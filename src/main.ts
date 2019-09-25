import * as sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

/* tslint:disable:no-submodule-imports */
import * as git from 'simple-git/promise'
import * as yargs from 'yargs';

function createPr(args) { 
    console.log(JSON.stringify(args))
}

async function push(args) {
    const bs = await git().branch(["-vv"])
    const b = bs.branches[bs.current]
    const label = b.label
    const name = b.name

    const prefix = `[origin/${name}`
    if (label.startsWith(`${prefix}: `) || label.startsWith(`${prefix}] `)) {
        console.log('remote exists')
    } else {
        console.log('remote does not exist')
    }
}

/* tslint:disable:no-shadowed-variable no-unused-expression */
yargs
    .usage('<cmd> [options]')
    .version('1.0.0')
    .strict()
    .command('push', 'push your branch', yargs => {
        // blah blah blah
    }, push)
    .command('pr', 'Creates a PR', yargs => {
        // specFileAndSectionOptions(yargs);
        // yargs.option('teleporting', {
        //     describe: 'whether to enable teleporting to significantly reduce deployment time',
        //     default: true,
        //     type: 'boolean'
        // });
        // yargs.option('deploy-mode', {
        //     choices: ['ALWAYS', 'IF_CHANGED'],
        //     describe: 'When should lambda instruments be deployed',
        //     default: 'IF_CHANGED'
        // });
    }, createPr)
    .help()
    .argv;
