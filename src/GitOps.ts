import { SimpleGit } from 'simple-git/promise'

function stopMe(message: string) {
    console.log(message)
    process.exit(-1)
}

export class GitOps {

    constructor(private readonly git: SimpleGit) {}

    async getBranch() {
        const bs = await this.git.branch(["-vv"])
        return bs.branches[bs.current]
    }
    
    async noUncommittedChanges() {
        const d = await this.git.diffSummary()
        if (d.files.length) {
            stopMe('you have uncommitted changes')
        }
    }
    
    async push() {
        await this.noUncommittedChanges()
    
        const b = await this.getBranch()
    
        // we need to by pass typechecking (incorrect signature of the .push() method), so we use .apply()
        const temp = await this.git.push.apply(this.git, [['--set-upstream', 'origin', b.name]])
        console.log(temp)
    }    

    async getRepo() {
        const r = await this.git.remote(['-v'])
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
}
