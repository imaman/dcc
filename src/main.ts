#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Octokit } from '@octokit/rest'
import { z } from 'zod'
import * as timeago from 'timeago.js'
import open from 'open'

import * as sourceMapSupport from 'source-map-support'
sourceMapSupport.install()

import simpleGit from 'simple-git'
import * as yargs from 'yargs'
import { Arguments } from 'yargs'

import { Check, GithubOps } from './GithubOps'
import { GitOps } from './GitOps'
import { CurrentPrInfo, GraphqlOps } from './gql'
import { logger } from './logger'

const DccConfigSchema = z.object({
  token: z.string(),
  prLabels: z
    .string()
    .array()
    .optional(),
})
type DccConfig = z.infer<typeof DccConfigSchema>

const confFile = path.resolve(os.homedir(), './.dccrc.json')
const parsed: DccConfig = DccConfigSchema.parse(JSON.parse(fs.readFileSync(confFile, 'utf-8')))
const token = parsed.token

if (!token) {
  throw new Error(`Missing "token" value in ${confFile}`)
}

const octoKit = new Octokit({ auth: token })

const gitOps = new GitOps(simpleGit())
const githubOps = new GithubOps(octoKit, gitOps, parsed.prLabels ?? [])
const graphqlOps = new GraphqlOps(token, gitOps)

function print(...args: string[]) {
  logger.info(args.join(' '))
}

function format(s: string, n: number) {
  if (s.length > n) {
    return s.substr(0, n)
  }

  return s.padEnd(n)
}

function launch(f: (a: Arguments) => Promise<void>) {
  return (args: Arguments) => {
    if (args.dir) {
      process.chdir(args.dir)
    }
    return f(args)
  }
}

async function catchUp(mode: 'SILENT' | 'CHATTY') {
  await gitOps.notOnMainBranch()
  await gitOps.noUncommittedChanges()
  const mainBranch = await gitOps.mainBranch()
  await gitOps.fetch('origin', mainBranch)
  await gitOps.merge('origin', mainBranch)
  const baselineCommit = await gitOps.findBaselineCommit(`origin/${mainBranch}`)
  const c = await gitOps.describeCommit(baselineCommit)

  if (mode === 'SILENT') {
    return mainBranch
  }
  print(`This branch's baseline is now: ${c?.data.hash.substring(0, 7)} ${c?.data.message}`)
  const changedFiles = await gitOps.getChangedFiles(baselineCommit)
  print(`${changedFiles.length} pending file${changedFiles.length !== 1 ? 's' : ''}`)
  return mainBranch
}

async function listOngoing() {
  const d = await githubOps.listPrs()
  for (const curr of d) {
    print(
      `${curr.updatedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
}

async function createNew(a: Arguments) {
  await gitOps.noUncommittedChanges()
  const mainBranch = await gitOps.mainBranch()
  await gitOps.fetch('origin', mainBranch)
  await gitOps.merge('origin', mainBranch)
  await gitOps.createBranch(a.branch, `origin/${mainBranch}`)
}

async function diff(a: Arguments) {
  const mainBranch = await gitOps.mainBranch()
  const baselineCommit = await gitOps.findBaselineCommit(`origin/${mainBranch}`)
  await gitOps.diff(baselineCommit, Boolean(a.tool))
}

async function pending() {
  const mainBranch = await gitOps.mainBranch()
  const baselineCommit = await gitOps.findBaselineCommit(`origin/${mainBranch}`)
  const changedFiles = await gitOps.getChangedFiles(baselineCommit)
  for (const curr of changedFiles) {
    print(curr)
  }
}

function prIsUpToDate(pr: CurrentPrInfo) {
  if (!pr.lastCommit) {
    throw new Error(`Failed to retreive information about the PR's latest commit`)
  }

  return pr.lastCommit.ordinal === 0
}

async function submit() {
  // TODO(imaman): auto-create a PR if one has not been created?
  // TODO(imaman): if only one commit from master, take it as the PR title?
  await gitOps.notOnMainBranch()
  await gitOps.noUncommittedChanges()

  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    print(`No PR was found for the current branch (use "dcc pr" to create one)`)
    return
  }

  if (!prIsUpToDate(pr)) {
    print(`You have local changes that were not pushed to the PR`)
    return
  }

  if (pr.mergeabilityStatus === 'CONFLICTING') {
    print(`This PR is blocked by merge conflicts`)
    return
  }

  const checks = await githubOps.getChecks(pr?.number)
  const failing = checks.filter(c => c.tag === 'FAILING')
  if (failing.length) {
    print('some checks are failing')
    for (const c of failing) {
      printCheck(c)
    }
    return
  }

  const pending = checks.filter(c => c.tag === 'PENDING')
  if (pending.length) {
    print('some checks are pending')
    for (const c of pending) {
      printCheck(c)
    }

    await graphqlOps.enableAutoMerge(pr)
    print('auto merge requested')
    return
  }

  await githubOps.merge(pr.number)
  print('merged')
  const mainBranch = await catchUp('SILENT')
  // Order is important here: merge will work only if we have switched to the main branch.
  await gitOps.switchToMainBranch()
  await gitOps.merge('origin', mainBranch)
}

async function listClosed(args: Arguments) {
  const d = await githubOps.listMerged(args.user)

  for (const curr of d) {
    print(
      `${curr.mergedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
}

async function upload(args: Arguments) {
  await gitOps.notOnMainBranch()

  const pr = await graphqlOps.getCurrentPr()
  if (!pr || !prIsUpToDate(pr)) {
    print('Pushing changes')
    await gitOps.push()
  }

  if (!args.title) {
    return
  }

  const currentPr = await graphqlOps.getCurrentPr()
  if (currentPr) {
    await githubOps.updatePrTitle(currentPr.number, args.title)
  } else {
    await githubOps.createPr(args.title)
  }

  if (!args.submit) {
    return
  }

  logger.silly('waiting for uploaded content to be reflected back')
  for (let i = 0; i < 5; ++i) {
    const p = await graphqlOps.getCurrentPr()
    logger.silly(`attempt #${i}: ordinal=${p?.lastCommit?.ordinal}`)
    if (p?.lastCommit?.ordinal === 0) {
      submit()
      return
    }

    await new Promise<void>(resolve => setTimeout(() => resolve(), i * 500))
  }

  throw new Error(`Something went wrong: uploaded commit was not shown on the PR so the PR was not submitted`)
}

async function status() {
  // TODO(imaman): should print whether there are local changes that need to be merged.
  // TODO(imaman): should show info about closed PR if still on that branch (think about the exact UX that is needed here)
  // TODO(imaman): show 'auto-merge' indication.
  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    print('No PR was created for this branch')
  } else {
    const checks: Check[] = await githubOps.getChecks(pr?.number)
    print(`PR #${pr.number}: ${pr.title}`)
    print(pr.url)
    if (pr.lastCommit) {
      let headIndication = ''
      if (pr.lastCommit.ordinal >= 0) {
        headIndication = 'HEAD' + (pr.lastCommit.ordinal ? `~${pr.lastCommit.ordinal}` : '') + ': '
      }

      print(
        `Currently at ${headIndication}${pr.lastCommit.abbreviatedOid} "${pr.lastCommit.message.substr(0, 60)}"`.trim(),
      )
    }

    print(`\nMeragability status: ${pr.mergeabilityStatus}`)
    print('Checks:')
    const orderOfCheck = (c: Check) =>
      c.tag === 'PASSING' ? 0 : c.tag === 'PENDING' ? 1 : c.tag === 'FAILING' ? 2 : shouldNeverHappen(c)
    for (const c of checks.sort((a, b) => orderOfCheck(a) - orderOfCheck(b))) {
      printCheck(c)
    }
    print()
  }
}

async function openPr() {
  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    print('🚫 No PR found for this branch')
    return
  }

  const filesUrl = `${pr.url}/files`
  print(`🌐 Opening ${filesUrl}`)
  await open(filesUrl)
}

function shouldNeverHappen(_n: never): never {
  throw new Error(`Never goign to happen at runtime`)
}

function printCheck(c: Check) {
  if (c.tag === 'PASSING') {
    print(`  - ✅ ${c.name}\n`)
  } else if (c.tag === 'PENDING') {
    print(`  - 🚧 ${c.name} ${c.startedAt ? '(started ' + timeago.format(c.startedAt) + ')' : ''}\n    ${c.url}\n`)
  } else if (c.tag === 'FAILING') {
    print(`  - ❌ ${c.name}: ${c.summary}\n       ${c.url}`)
  } else {
    shouldNeverHappen(c)
  }
}

// Fix this: running dcc status when checks are still in 'expected' state, I get a "yes" for "can be merged?"
// $ dcc status
// PR #43: introduce caching of definitions
// https://github.com/wix-private/wix-dx/pull/43
// Can be merged? Yes
// at (HEAD) dae1010: tsc 4.0.3
//
// Similarly, when running 'dcc submit' at this stage it tries directly to merge (instead of doing '#automerge').
// Only when the checks state has changed to PENDING did 'dcc submit' do '#automerge'

const GENERIC_HELP_MESSAGE = 'Specify --help for available options'

const STATUS_COMMAND = 'status'

const currentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')).version
yargs
  .usage('<command> [options]')
  .version(currentVersion)
  .option('dir', {
    alias: 'd',
    describe: 'directroy to run at',
    type: 'string',
  })
  .command(
    [STATUS_COMMAND, '*'],
    'Show the status of the current PR',
    a => a,
    async argv => {
      const commands = argv._
      if (!commands.length || commands[0] === STATUS_COMMAND) {
        await launch(status)(argv)
      } else {
        logger.info(`Unknown command: ${commands[0]}\n\n${GENERIC_HELP_MESSAGE}`)
      }
    },
  )
  .command(
    'upload',
    'Push your changes to Gitub (creates a PR, if a title is specified)',
    yargs =>
      yargs
        .option('title', {
          alias: 't',
          type: 'string',
          describe: 'A one line summary of this PR',
          default: '',
        })
        .option('submit', {
          alias: 's',
          type: 'boolean',
          describe: 'Whether to also submit immediately after the upload',
          default: '',
        }),
    launch(upload),
  )
  .command('submit', 'Merge the current PR into the main branch', a => a, launch(submit))
  .command(
    'catch-up',
    'Pull most recent changes into the main branch and into the current one',
    a => a,
    launch(async () => {
      await catchUp('CHATTY')
    }),
  )
  .command('list-ongoing', 'List currently open PRs', a => a, launch(listOngoing))
  .command(
    'list-closed',
    'List recently merged PRs',
    yargs =>
      yargs.option('user', {
        alias: 'u',
        describe: 'Shows only PR from that GitHub user ID. If omiited shows from all users.',
        type: 'string',
      }),
    launch(listClosed),
  )
  .command('pending', `Lists all changes files (compared to branch's baseline commit)`, a => a, launch(pending))
  .command(
    'diff',
    `Diffs against the branch's baseline commit`,
    yargs =>
      yargs.option('tool', {
        alias: 't',
        describe: 'Use git difftool for showing the diff',
        type: 'boolean',
      }),
    launch(diff),
  )
  .command(
    'start-new',
    `Creates a new branch, from the most recently merged commit.`,
    yargs =>
      yargs
        .option('branch', {
          alias: 'b',
          type: 'string',
          describe: 'The name of the new branch',
        })
        .demandOption('branch'),
    launch(createNew),
  )
  .command('open', 'Open the current PR files page in your browser', a => a, launch(openPr))
  .strict()
  .help()
  .showHelpOnFail(false, GENERIC_HELP_MESSAGE).argv
