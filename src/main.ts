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

async function listPrs() { 
    const d = await githubOps.listPrs()
    console.log(JSON.stringify(d, null, 2))
}

async function listMerged(args) { 
    const d = await githubOps.listMerged(args.user)

    // {
    //     "user": "imaman",
    //     "title": "some deduping (e.g., setDependencies() getBuildsArtifactsDependencies()) and cleanups (early exits, etc.)",
    //     "url": "https://github.com/wix-private/wix-ci/pull/3263",
    //     "body": "",
    //     "branch": "xx",
    //     "updatedAt": "2019-09-24T11:22:43Z",
    //     "createdAt": "2019-09-24T06:39:37Z",
    //     "mergedAt": "2019-09-24T11:22:43Z",
    //     "number": 3263,
    //     "state": "closed"
    //   }

    function format(s: string, n: number) {
        if (s.length > n) {
            return s.substr(0, n)
        }

        return s.padEnd(n)
    }
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
/* tslint:disable:no-shadowed-variable no-unused-expression */
yargs
    .usage('<cmd> [options]')
    .version('1.0.0')
    .strict()
    .command('push', 'push your branch', yargs => {
        // blah blah blah
    }, push)
    .command('prs', 'List currently open PRs', yargs => {}, listPrs)
    .command('merged', 'List recently merged PRs', yargs => {
        yargs.option('user', {
            alias: 'u',
            describe: 'Shows only PR from that GitHub user ID. If omiited shows from all users.',
            type: 'string'
        });
    }, listMerged)
    .command('pr [options]', 'Creates a PR', yargs => {
        // specFileAndSectionOptions(yargs);
        yargs.option('title', {
            alias: 't',
            describe: 'A one line summary of this PR',
            type: 'string'
        });
        // yargs.option('deploy-mode', {
        //     choices: ['ALWAYS', 'IF_CHANGED'],
        //     describe: 'When should lambda instruments be deployed',
        //     default: 'IF_CHANGED'
        // });
    }, createPr)
    .help()
    .showHelpOnFail(false, "Specify --help for available options")
    .argv;
