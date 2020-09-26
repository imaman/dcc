import * as fs from 'fs'
import * as path from 'path'
import * as Octokit from '@octokit/rest'

import * as sourceMapSupport from 'source-map-support'
sourceMapSupport.install()

import * as git from 'simple-git/promise'
import * as yargs from 'yargs'
import { Arguments } from 'yargs'

import { GithubOps } from './GithubOps'
import { GitOps } from './GitOps'

const auth = fs
  .readFileSync(path.resolve(__dirname, '../.conf'), 'utf-8')
  .split('\n')[0]
  .trim()
const octoKit = new Octokit({ auth })

const gitOps = new GitOps(git())
const githubOps = new GithubOps(octoKit, gitOps)

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
  const d = await githubOps.listPrs()
  for (const curr of d) {
    console.log(
      `${curr.updatedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${
        curr.url
      }`,
    )
  }
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
  const x = await githubOps.getCurrentPr()
  console.log(`x=${JSON.stringify(x, null, 2)}`)

  // const o = await githubOps.listChecks()

  // console.log(process.cwd())
  // console.log('Pushed: HEAD' + (o.commit.ordinal ? `~${o.commit.ordinal}` : ''))
  // console.log('Commit: ' + o.commit.data.hash)
  // console.log('Message: ' + o.commit.data.message.substr(0, 60))

  // console.log()
  // const notPassingRequired = o.statuses.filter(curr => curr.required).filter(curr => curr.state !== 'success')
  // console.log(`Required checks pass? ${notPassingRequired.length ? 'no' : 'YES'}`)

  // if (notPassingRequired.length) {
  //   for (const curr of notPassingRequired) {
  //     console.log('  ' + curr.context + '? ' + curr.state)
  //   }
  // }

  // console.log()
  // const notPassingOptional = o.statuses.filter(curr => !curr.required).filter(curr => curr.state !== 'success')
  // console.log(`Optional checks pass? ${notPassingOptional.length ? 'no' : 'YES'}`)
  // if (notPassingOptional.length) {
  //   for (const curr of notPassingOptional) {
  //     console.log('  ' + curr.context + '? ' + curr.state)
  //   }
  // }
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
  .command('info', 'CI details', a => a, launch(info))
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
