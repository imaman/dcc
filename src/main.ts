import * as fs from 'fs'
import * as path from 'path'
import { Octokit } from '@octokit/rest'

import * as sourceMapSupport from 'source-map-support'
sourceMapSupport.install()

import * as git from 'simple-git/promise'
import * as yargs from 'yargs'
import { Arguments } from 'yargs'

import { GithubOps } from './GithubOps'
import { GitOps } from './GitOps'
import { GraphqlOps } from './gql'

const token = fs
  .readFileSync(path.resolve(__dirname, '../.conf'), 'utf-8')
  .split('\n')[0]
  .trim()
const octoKit = new Octokit({ auth: token })

const gitOps = new GitOps(git())
const githubOps = new GithubOps(octoKit, gitOps)
const graphqlOps = new GraphqlOps(token, gitOps)

function print(...args: string[]) {
  /* eslint-disable-next-line no-console */
  console.log(...args)
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

async function listPrs() {
  const d = await githubOps.listPrs()
  for (const curr of d) {
    print(
      `${curr.updatedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
}

async function mergePr() {
  // TODO(imaman): auto-create a PR if one has not been created?
  // TODO(imaman): if only one commit from master, take it as the PR title?
  // TODO(imaman): should switch back to master before returning?
  await gitOps.notOnMainBranch()
  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    print(`No PR was found for the current branch (use "dcc pr" to create one)`)
    return
  }

  gitOps.noUncommittedChanges()

  if (!pr.lastCommit) {
    throw new Error(`Failed to retreive information about the PR's latest commit`)
  }

  if (pr.lastCommit.ordinal !== 0) {
    print(`You have local changes that were not pushed to the PR`)
    return
  }

  if (pr.mergeBlockerFound) {
    print(`The PR cannot be merged at this point (use "dcc info" to see why)`)
    return
  }

  // TODO(imaman): pr.rollupStateIsMissing is valid only if no required checks are defined
  if (pr.checksArePositive || pr.rollupStateIsMissing) {
    await githubOps.merge(pr.number)
    print('merged')
    gitOps.switchToMainBranch()
    return
  }

  await githubOps.addPrComment(pr.number, '#automerge')
  print('#automerge statred')
}

async function listMerged(args: Arguments) {
  const d = await githubOps.listMerged(args.user)

  for (const curr of d) {
    print(
      `${curr.mergedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
}

async function push() {
  await gitOps.notOnMainBranch()
  await gitOps.push()
}

async function createPr(args: Arguments) {
  await gitOps.notOnMainBranch()
  // TODO(imaman): allow updating the PR title if one has already been created
  await githubOps.createPr(args.title)
}

async function info() {
  // TODO(imaman): should print whether there are local changes that need to be merged.
  // TODO(imaman): should show info about closed PR if still on that branch (think about the exact UX that is needed here)
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

// TODO(imaman): show help when no command is given

/* tslint:disable:no-shadowed-variable no-unused-expression */
yargs
  .usage('<cmd> [options]')
  .version('1.0.0')
  .strict()
  .option('dir', {
    alias: 'd',
    describe: 'directroy to run at',
    type: 'string',
  })
  // TODO(imaman): add a sync command to fetch master and merge it in.
  .command('info', 'Vital signs of the current PR', a => a, launch(info))
  .command('push', 'push your branch', a => a, launch(push))
  .command('ongoing', 'List currently open PRs', a => a, launch(listPrs))
  .command('merge', 'Merge the current PR', a => a, launch(mergePr))
  .command(
    'closed',
    'List recently merged PRs',
    yargs =>
      yargs.option('user', {
        alias: 'u',
        describe: 'Shows only PR from that GitHub user ID. If omiited shows from all users.',
        type: 'string',
      }),
    launch(listMerged),
  )
  .command(
    'pr [options]',
    'Creates a PR',
    yargs =>
      yargs.option('title', {
        alias: 't',
        describe: 'A one line summary of this PR',
        type: 'string',
        demandOption: true,
      }),
    launch(createPr),
  )
  .help()
  .showHelpOnFail(false, 'Specify --help for available options').argv
