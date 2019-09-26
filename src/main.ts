import * as fs from 'fs'
import * as path from 'path'
import * as Octokit from '@octokit/rest'

import * as sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

/* tslint:disable:no-submodule-imports */
import * as git from 'simple-git/promise'
import * as yargs from 'yargs';

const octokit = (() => {
    let ret: Octokit|undefined
    return () => {
        const auth = fs.readFileSync(path.resolve(__dirname, '../.conf'), 'utf-8')
        ret = ret || new Octokit({ auth });        
        return ret
    }
})()

async function createPr(args) { 
    if (!args.title) {
        throw new Error('Title must be specified')
    }

    const b = await getBranch()
    const r = await getRepo()
    const kit = octokit()

    const req: Octokit.PullsCreateParams = {
        base: 'master',
        head: b.name,
        owner: r.owner,
        repo: r.name,
        title: args.title
    }
    await kit.pulls.create(req)
    console.log(JSON.stringify(args))
}

async function getPrs(args) { 
    const r = await getRepo()
    const kit = octokit()

    const req: Octokit.PullsListParams = {
        // base: 'master',
        // head: b.name,
        owner: r.owner,
        repo: r.name,
    }
    await kit.pulls.list(req)
    console.log(JSON.stringify(args))
}

async function getBranch() {
    const bs = await git().branch(["-vv"])
    return bs.branches[bs.current]
}

async function getRepo() {
    const r = await git().remote(['-v'])
    // "origin\tgit@github.com:imaman/dcc.git (fetch)\norigin\tgit@github.com:imaman/dcc.git (push)\n"
    if (typeof r !== 'string') {
        throw new Error('Expected a string')
    }
    const repos = r.split('\n')
        .map(line => line && line.split('\t')[1].split(':')[1].split(' ')[0].split('/'))
        .filter(Boolean)
        .map(s => ({owner: s[0], name: s[1]}))

    for (const curr of repos) {
        if (!curr.name.endsWith('.git')) {
            throw new Error(`Repo reference should end with .git (but found: ${curr.name})`)
        }

        curr.name = curr.name.substr(0, curr.name.length - 4)
    }

    if (!repos.length) {
        throw new Error('No repo found')
    }

    for (let i = 1; i < repos.length; ++i) {
        const curr = repos[i];
        const prev = repos[i - 1]
        if (curr.name !== prev.name || curr.owner !== prev.owner) {
            throw new Error(`More than one repo ("${JSON.stringify(prev)}", "${JSON.stringify(curr)}") was reported ` 
                    + 'by <git remote -v>')
        }
    }

    return repos[0]
}

getPrs({}).then(x => console.log(x)).catch(e => console.error('NO-NO-NO', e))

async function push(args) {
    const b = await getBranch()

    const inst = git()
    // we need to by pass typechecking (incorrect signature of the .push() method), so we use .apply()
    const temp = await inst.push.apply(inst, [['--set-upstream', 'origin', b.name]])
    console.log(temp)
}

/* tslint:disable:no-shadowed-variable no-unused-expression */
yargs
    .usage('<cmd> [options]')
    .version('1.0.0')
    .strict()
    .command('push', 'push your branch', yargs => {
        // blah blah blah
    }, push)
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
    .argv;
