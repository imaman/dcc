import { SimpleGit } from 'simple-git/promise'
import * as child_process from 'child_process'
import { logger } from './logger'

interface BranchInfo {
  current: string
  name: string
  commit: string
  label: string
}

interface RepoInfo {
  owner: string
  name: string
}

interface LogInfo {
  hash: string
  date: string
  message: string
  refs: string
  body: string
  author_name: string
  author_email: string
}

interface CommitInfo {
  ordinal: number
  data: LogInfo
}

function stopMe(message: string) {
  logger.info(message)
  // eslint-disable-next-line no-process-exit
  process.exit(-1)
}

export class GitOps {
  constructor(private readonly git: SimpleGit, readonly mainBranch = 'master') {}

  async describeCommit(sha: string): Promise<CommitInfo | undefined> {
    const log = await this.git.log()
    const index = log.all.findIndex(curr => curr.hash === sha)
    if (index < 0) {
      return undefined
    }

    const data = log.all[index]
    logger.silly(`describeCommit(${sha}) index=${index}, data=\n${JSON.stringify(data, null, 2)}`)
    return { ordinal: index, data }
  }

  async switchToMainBranch(): Promise<void> {
    await this.noUncommittedChanges()
    await this.git.checkout(this.mainBranch)
  }

  async getBranch(): Promise<BranchInfo> {
    const bs = await this.git.branch(['-vv'])
    return bs.branches[bs.current]
  }

  async noUncommittedChanges(): Promise<void> {
    const d = await this.git.diffSummary()
    if (d.files.length) {
      stopMe('you have uncommitted changes')
    }
  }

  async notOnMainBranch(): Promise<void> {
    const summ = await this.git.branch([])
    if (summ.current === this.mainBranch) {
      stopMe(`cannot be carried out when on branch '${summ.current}'`)
    }
  }

  async push(): Promise<void> {
    await this.noUncommittedChanges()
    const b = await this.getBranch()

    const temp = child_process.spawnSync('git', ['push', '--set-upstream', 'origin', b.name], { stdio: 'inherit' })
    if (temp.status !== 0) {
      throw new Error(`exit code (git push) is ${temp.status}`)
    }
  }

  async getRepo(): Promise<RepoInfo> {
    const r = await this.git.remote(['-v'])
    // "origin\tgit@github.com:imaman/dcc.git (fetch)\norigin\tgit@github.com:imaman/dcc.git (push)\n"
    if (typeof r !== 'string') {
      throw new Error('Expected a string')
    }
    const repos = r
      .split('\n')
      .map(
        line =>
          line &&
          line
            .split('\t')[1]
            .split(':')[1]
            .split(' ')[0]
            .split('/'),
      )
      .filter(Boolean)
      .map(s => ({ owner: s[0], name: s[1] }))

    for (const curr of repos) {
      if (curr.name.endsWith('.git')) {
        curr.name = curr.name.substr(0, curr.name.length - 4)
      }
    }

    if (!repos.length) {
      throw new Error('No repo found')
    }

    for (let i = 1; i < repos.length; ++i) {
      const curr = repos[i]
      const prev = repos[i - 1]
      if (curr.name !== prev.name || curr.owner !== prev.owner) {
        throw new Error(
          `More than one repo ("${JSON.stringify(prev)}", "${JSON.stringify(curr)}") was reported ` +
            'by <git remote -v>',
        )
      }
    }

    return repos[0]
  }

  async fetch(remoteName: string, branchName: string): Promise<void> {
    await this.git.fetch(remoteName, branchName)
  }

  async checkout(branchName: string): Promise<void> {
    await this.git.checkout(branchName)
  }

  async merge(remoteName: string, branchName: string): Promise<void> {
    await this.git.merge([`${remoteName}/${branchName}`])
  }

  async getChangedFiles(remoteName: string): Promise<string[]> {
    const diffSummary = await this.git.diffSummary([remoteName])
    return diffSummary.files.map(it => it.file)
  }
}
