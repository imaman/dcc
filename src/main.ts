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

async function catchUp() {
  await gitOps.notOnMainBranch()
  const { name } = await gitOps.getBranch()
  await gitOps.noUncommittedChanges()
  await gitOps.switchToMainBranch()
  await gitOps.pull()
  await gitOps.checkout(name)
  await gitOps.mergeMainBranch()
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

async function submit() {
  // TODO(imaman): auto-create a PR if one has not been created?
  // TODO(imaman): if only one commit from master, take it as the PR title?
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
    await gitOps.switchToMainBranch()
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

async function upload(args: Arguments) {
  await gitOps.notOnMainBranch()
  await gitOps.push()

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

const argv = yargs
  .usage('<cmd> [options]')
  .version('1.0.0')
  .option('dir', {
    alias: 'd',
    describe: 'directroy to run at',
    type: 'string',
  })
  .command('info', 'Vital signs of the current PR', a => a, launch(info))
  // .command('push', 'push your branch', a => a, launch(push))
  .command(
    'upload',
    'pushes changes to gitub (creates a PR, if a title is specified)',
    yargs =>
      yargs.option('title', {
        alias: 't',
        type: 'string',
        describe: 'A one line summary of this PR',
        default: '',
      }),
    launch(upload),
  )
  .command('submit', 'Merge the current PR', a => a, launch(submit))
  .command('catch-up', 'merge recent changes', a => a, launch(catchUp))
  .command('list-ongoing', 'List currently open PRs', a => a, launch(listPrs))
  .command(
    'list-closed',
    'List recently merged PRs',
    yargs =>
      yargs.option('user', {
        alias: 'u',
        describe: 'Shows only PR from that GitHub user ID. If omiited shows from all users.',
        type: 'string',
      }),
    launch(listMerged),
  )
  .strict()
  .help()
  .showHelpOnFail(false, 'Specify --help for available options').argv

if (!argv._[0]) {
  yargs.showHelp()
}
