#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Octokit } from '@octokit/rest'

import * as sourceMapSupport from 'source-map-support'
sourceMapSupport.install()

import * as git from 'simple-git/promise'
import * as yargs from 'yargs'
import { Arguments } from 'yargs'

import { GithubOps } from './GithubOps'
import { GitOps } from './GitOps'
import { CurrentPrInfo, GraphqlOps } from './gql'
import { logger } from './logger'

const confFile = path.resolve(os.homedir(), './.dccrc.json')
const token = JSON.parse(fs.readFileSync(confFile, 'utf-8')).token

if (!token) {
  throw new Error(`Missing "token" value in ${confFile}`)
}

const octoKit = new Octokit({ auth: token })

const gitOps = new GitOps(git())
const githubOps = new GithubOps(octoKit, gitOps)
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

async function catchUp() {
  await gitOps.notOnMainBranch()
  await gitOps.noUncommittedChanges()
  await gitOps.fetch('origin', gitOps.mainBranch)
  await gitOps.merge('origin', gitOps.mainBranch)
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

  if (pr.mergeBlockerFound) {
    print(`The PR cannot be merged at this point (use "dcc status" to see why)`)
    return
  }

  // TODO(imaman): pr.rollupStateIsMissing is valid only if no required checks are defined
  if (pr.checksArePositive || pr.rollupStateIsMissing) {
    await githubOps.merge(pr.number)
    print('merged')
    await gitOps.switchToMainBranch()
    return
  }

  await githubOps.addPrComment(pr.number, '#automerge')
  print('#automerge statred')
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
}

async function info() {
  // TODO(imaman): should print whether there are local changes that need to be merged.
  // TODO(imaman): should show info about closed PR if still on that branch (think about the exact UX that is needed here)
  // TODO(imaman): show 'auto-merge' indication.
  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    print('No PR was created for this branch')
  } else {
    print(`PR #${pr.number}: ${pr.title}`)
    print(pr.url)
    print(`Can be merged? ${pr.mergeBlockerFound ? 'No' : 'Yes'}`)
    if (pr.conflicts) {
      print(`Merge conflicts were found`)
    }
    if (pr.lastCommit) {
      let headIndication = ''
      if (pr.lastCommit.ordinal >= 0) {
        headIndication = '(HEAD' + (pr.lastCommit.ordinal ? `~${pr.lastCommit.ordinal}` : '') + ') '
      }

      print(
        `${pr.rollupState || ''} at ${headIndication}${pr.lastCommit.abbreviatedOid}: ${pr.lastCommit.message.substr(
          0,
          60,
        )}`.trim(),
      )
    }

    for (const c of pr.checks || []) {
      print(`  - ${c.state} ${c.url}\n    ${c.description}\n`)
    }
    print()
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
        await launch(info)(argv)
      } else {
        logger.info(`Unknown command: ${commands[0]}\n\n${GENERIC_HELP_MESSAGE}`)
      }
    },
  )
  .command(
    'upload',
    'Push your changes to Gitub (creates a PR, if a title is specified)',
    yargs =>
      yargs.option('title', {
        alias: 't',
        type: 'string',
        describe: 'A one line summary of this PR',
        default: '',
      }),
    // TODO(imaman): add a -s option to do upload+submit
    launch(upload),
  )
  .command('submit', 'Merge the current PR into the main branch', a => a, launch(submit))
  .command(
    'catch-up',
    'Pull most recent changes into the main branch and into the current one',
    a => a,
    launch(catchUp),
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
  .strict()
  .help()
  .showHelpOnFail(false, GENERIC_HELP_MESSAGE).argv
