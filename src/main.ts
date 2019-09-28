import * as fs from 'fs'
import * as path from 'path'
import * as Octokit from '@octokit/rest'

import * as sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import * as git from 'simple-git/promise'
import * as yargs from 'yargs';

import { GithubOps } from './GithubOps'
import { GitOps } from './GitOps'

const auth = fs.readFileSync(path.resolve(__dirname, '../.conf'), 'utf-8').split('\n')[0].trim()
const octoKit = new Octokit({ auth });        

const gitOps = new GitOps(git())
const githubOps = new GithubOps(octoKit, gitOps)

function format(s: string, n: number) {
    if (s.length > n) {
        return s.substr(0, n)
    }

    return s.padEnd(n)
}

async function listPrs() { 
    const d = await githubOps.listPrs()
    for (const curr of d) {
        console.log(`${curr.updatedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${curr.url}`)
    }
}

async function listMerged(args) { 
    const d = await githubOps.listMerged(args.user)

    for (const curr of d) {
        console.log(`${curr.mergedAt} ${('#' + curr.number).padStart(6)} ${format(curr.user, 10)} ${format(curr.title, 60)} ${curr.url}`)
    }
}

async function push() {
    await gitOps.push()
}

async function createPr(args) {
    await githubOps.createPr(args.title)
}

async function info() {
    const o = await githubOps.listChecks()

    console.log('HEAD' + (Boolean(o.commit.ordinal) ? `~${o.commit.ordinal}` : ''))
    console.log(o.commit.data.hash)
    console.log(o.commit.data.message.substr(0, 60))

    console.log()
    const notPassingRequired = o.statuses.filter(curr => curr.required).filter(curr => curr.state !== 'success')
    console.log(`Required checks pass? ${notPassingRequired.length ? 'no' : 'YES'}`)

    if (notPassingRequired.length) {
        for (const curr of notPassingRequired) {
            console.log('  ' + curr.context + '? ' + curr.state)
        }
    }

    console.log()
    const notPassingOptional = o.statuses.filter(curr => !curr.required).filter(curr => curr.state !== 'success')
    console.log(`Optional checks pass? ${notPassingOptional.length ? 'no' : 'YES'}`)
    if (notPassingOptional.length) {
        for (const curr of notPassingOptional) {
            console.log('  ' + curr.context + '? ' + curr.state)
        }
    }
}

/* tslint:disable:no-shadowed-variable no-unused-expression */
yargs
    .usage('<cmd> [options]')
    .version('1.0.0')
    .strict()
    .command('info', 'CI details', yargs => {}, info)
    .command('push', 'push your branch', yargs => {}, push)
    .command('prs', 'List currently open PRs', yargs => {}, listPrs)
    .command('merged', 'List recently merged PRs', yargs => {
        yargs.option('user', {
            alias: 'u',
            describe: 'Shows only PR from that GitHub user ID. If omiited shows from all users.',
            type: 'string'
        });
    }, listMerged)
    .command('pr [options]', 'Creates a PR', yargs => {
        yargs.option('title', {
            alias: 't',
            describe: 'A one line summary of this PR',
            type: 'string'
        });
    }, createPr)
    .help()
    .showHelpOnFail(true, "Specify --help for available options")
    .argv;
