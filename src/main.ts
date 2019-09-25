import * as sourceMapSupport from 'source-map-support';
sourceMapSupport.install();


import * as yargs from 'yargs';


function createPr(args) {
    console.log(JSON.stringify(args))
}

yargs
    .usage('<cmd> [options]')
    .version('1.0.0')
    .strict()
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
