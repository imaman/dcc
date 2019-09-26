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
    .command('list', 'List PRs', yargs => {}, listPrs)
    .command('pr [options]', 'Creates a PR', yargs => {
        // specFileAndSectionOptions(yargs);
        yargs.option('title', {
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
