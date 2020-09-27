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

/* eslint-disable no-console */
async function listPrs() {
  const d = await githubOps.listPrs()
  for (const curr of d) {
    console.log(
      `${curr.updatedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
}

/* eslint-disable no-console */
async function mergePr() {
  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    console.log(`No PR was found for the current branch (use "dcc pr" to create one)`)
    return
  }

  this.gitOps.noUncommittedChanges()

  if (!pr.lastCommit) {
    throw new Error(`Failed to retreive information about the PR's latest commit`)
  }

  if (pr.lastCommit.ordinal !== 0) {
    console.log(`You have local changes that were not pushed to the PR`)
    return
  }

  if (pr.mergeBlockerFound) {
    console.log(`The PR cannot be merged at this point (use "dcc info" to see why)`)
    return
  }

  if (pr.checksArePositive) {
    console.log('merging')
    await githubOps.merge(pr.number)
    return
  }

  console.log('using #automerge')
  await githubOps.addPrComment(pr.number, '#automerge')
}

async function listMerged(args: Arguments) {
  const d = await githubOps.listMerged(args.user)

  for (const curr of d) {
    console.log(
      `${curr.mergedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
}

async function push() {
  await gitOps.push()
}

async function createPr(args: Arguments) {
  await githubOps.createPr(args.title)
}

async function info() {
  const pr = await graphqlOps.getCurrentPr()
  if (!pr) {
    console.log('No PR was created for this branch')
  } else {
    console.log(`PR: #${pr.number}`)
    console.log(pr.url)
    console.log(`Can be merged? ${pr.mergeBlockerFound ? 'No' : 'Yes'}`)
    if (pr.conflicts) {
      console.log(`Merge conflicts were found`)
    }
    if (pr.lastCommit) {
      let headIndication = ''
      if (pr.lastCommit.ordinal >= 0) {
        headIndication = '(HEAD' + (pr.lastCommit.ordinal ? `~${pr.lastCommit.ordinal}` : '') + ') '
      }

      console.log(
        `${pr.rollupState || ''} at ${headIndication}${pr.lastCommit.abbreviatedOid}: ${pr.lastCommit.message.substr(
          0,
          60,
        )}`.trim(),
      )
    }

    for (const c of pr.checks || []) {
      console.log(`  - ${c.state} ${c.url}\n    ${c.description}\n`)
    }
    console.log()
  }
}

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
  .command('info', 'Vital signs of the current PR', a => a, launch(info))
  .command('push', 'push your branch', a => a, launch(push))
  .command('prs', 'List currently open PRs', a => a, launch(listPrs))
  .command('merge', 'Merge the current PR', a => a, launch(mergePr))
  .command(
    'prs-recent',
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
      }),
    launch(createPr),
  )
  .help()
  .showHelpOnFail(false, 'Specify --help for available options').argv
