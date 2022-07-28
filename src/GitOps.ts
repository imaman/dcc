import { SimpleGit, BranchSummary } from 'simple-git'
import * as child_process from 'child_process'
import { logger } from './logger'
import * as execa from 'execa'

interface BranchInfo {
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
  constructor(private readonly git: SimpleGit) {}

  async mainBranch(): Promise<string> {
    const args = ['symbolic-ref', 'refs/remotes/origin/HEAD']
    const command = `<git ${args.join(' ')}>`
    const temp = await execa('git', args)
    const stderr = temp.stderr.trim()
    if (stderr.length) {
      throw new Error(`Failed to get main branch. ${command} failed with: ${stderr}`)
    }

    const lines = temp.stdout.trim().split('\n')
    if (lines.length !== 1) {
      throw new Error(`Expected exactly one output line from ${command} but got: ${lines.join('\n')}`)
    }
    // refs/remotes/origin/main -> main
    const parts = lines[0]
      .split('/')
      .map(at => at.trim())
      .filter(Boolean)
    if (parts.length !== 4) {
      throw new Error(`Unexpected output from ${command}: ${lines[0]}`)
    }

    return parts[3]
  }

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
    await this.git.checkout(await this.mainBranch())
  }

  async getBranch(): Promise<BranchInfo> {
    const bs: BranchSummary = await this.git.branch(['-vv'])
    return bs.branches[bs.current]
  }

  async noUncommittedChanges(): Promise<void> {
    const d = await this.git.diffSummary()
    if (d.files.length) {
      stopMe('you have uncommitted changes')
    }
  }

  /**
   * Checks whether the current branch is the main branch, and bails out with an error if it is the main branch.
   */
  async notOnMainBranch(): Promise<void> {
    const [summ, mainBranch] = await Promise.all([await this.git.branch([]), await this.mainBranch()])
    if (summ.current === mainBranch) {
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

  async createBranch(branchName: string, baselineRef: string): Promise<void> {
    await this.git.checkoutBranch(branchName, baselineRef)
  }

  async merge(remoteName: string, branchName: string): Promise<void> {
    await this.git.merge([`${remoteName}/${branchName}`])
  }

  async getChangedFiles(gitRef: string): Promise<string[]> {
    const diffSummary = await this.git.diffSummary([gitRef])
    return diffSummary.files.map(it => it.file)
  }

  async findBaselineCommit(mainBranch: string): Promise<string> {
    const out = await this.git.raw(['merge-base', mainBranch, 'HEAD'])
    const lines = out
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    if (lines.length !== 1) {
      throw new Error(`Cannot find baseline commit`)
    }
    return lines[0]
  }

  async diff(commit: string, useDifftool: boolean): Promise<void> {
    await execa('git', [useDifftool ? 'difftool' : 'diff', commit], { stdout: 'inherit' })
  }
}
