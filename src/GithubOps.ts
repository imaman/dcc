import { GitOps } from './GitOps'
import { Octokit } from '@octokit/rest'

interface PrInfo {
  url: string
  updatedAt: string
  number: number
  user: string
  title: string
}

interface CheckStatusInfo {
  context: string
  required: boolean
  state: string
  createdAt: string
  updatedAt: string
}

interface CheckCommitInfo {
  ordinal: number
  data: { hash: string; message: string }
}

interface CheckInfo {
  statuses: CheckStatusInfo[]
  state: string
  sha: string
  commit: CheckCommitInfo
}

interface MergedPrInfo {
  mergedAt: string
  title: string
  number: number
  url: string
  user: string
}

export class GithubOps {
  constructor(private readonly kit: Octokit, private readonly gitOps: GitOps) {}

  async getUser(): Promise<string> {
    const d = await this.kit.users.getAuthenticated()
    return d.data.login
  }

  async listPrs(): Promise<PrInfo[]> {
    const [repo, user] = await Promise.all([this.gitOps.getRepo(), this.getUser()])

    const respB = await this.kit.search.issuesAndPullRequests({
      q: `type:pr	author:${user} state:open repo:${repo.owner}/${repo.name} sort:updated-desc`,
    })
    const prs = respB.data.items.map(curr => ({
      user: curr.user.login,
      title: curr.title,
      url: `https://github.com/${repo.owner}/${repo.name}/pull/${curr.number}`,
      body: curr.body,
      updatedAt: curr.updated_at,
      createdAt: curr.created_at,
      number: curr.number,
      state: curr.state,
    }))

    return prs.filter(curr => curr.user === user)
  }

  async getCurrentPr(): Promise<PrInfo | undefined> {
    const b = await this.gitOps.getBranch()
    const [repo, user] = await Promise.all([this.gitOps.getRepo(), this.getUser()])

    const q = `type:pr head:"${b.name}" author:${user} state:open repo:${repo.owner}/${repo.name} sort:updated-desc`
    const respB = await this.kit.search.issuesAndPullRequests({
      q,
    })

    const prs = respB.data.items.map(curr => ({
      user: curr.user.login,
      title: curr.title,
      url: `https://github.com/${repo.owner}/${repo.name}/pull/${curr.number}`,
      body: curr.body,
      updatedAt: curr.updated_at,
      createdAt: curr.created_at,
      number: curr.number,
      state: curr.state,
    }))

    const filtered = prs.filter(curr => curr.user === user)
    if (filtered.length !== 1) {
      return undefined
    }
    return filtered[0]
  }

  async merge(prNumber: number): Promise<void> {
    const r = await this.gitOps.getRepo()
    await this.kit.pulls.merge({ owner: r.owner, repo: r.name, pull_number: prNumber, merge_method: 'squash' })
  }

  async addPrComment(prNumber: number, body: string): Promise<void> {
    const r = await this.gitOps.getRepo()
    await this.kit.issues.createComment({
      body,
      owner: r.owner,
      repo: r.name,
      issue_number: prNumber,
    })
  }

  async listChecks(): Promise<CheckInfo> {
    const r = await this.gitOps.getRepo()
    const b = await this.gitOps.getBranch()
    const statusPromise = this.kit.repos.getCombinedStatusForRef({
      owner: r.owner,
      repo: r.name,
      ref: b.name,
    })

    const branchPromise = await this.kit.repos.getBranch({
      owner: r.owner,
      repo: r.name,
      branch: 'master',
    })

    const [status, branch] = await Promise.all([statusPromise, branchPromise])
    const required = new Set<string>(branch.data.protection.required_status_checks.contexts)
    const statuses = status.data.statuses.map(s => ({
      context: s.context,
      required: required.has(s.context),
      state: s.state,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }))

    const d = await this.gitOps.describeCommit(status.data.sha)
    if (!d) {
      throw new Error(`Could not find sha ${status.data.sha} in git log`)
    }

    return { statuses, state: status.data.state, sha: status.data.sha, commit: d }
  }

  async listMerged(user?: string): Promise<MergedPrInfo[]> {
    const r = await this.gitOps.getRepo()

    const pageSize = user ? 100 : 40
    const resp = await this.kit.pulls.list({
      owner: r.owner,
      repo: r.name,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: pageSize,
    })
    let prs = resp.data.map(curr => ({
      user: curr.user.login,
      title: curr.title,
      url: `https://github.com/${r.owner}/${r.name}/pull/${curr.number}`,
      body: curr.body,
      branch: curr.head.ref,
      updatedAt: curr.updated_at,
      createdAt: curr.created_at,
      mergedAt: curr.merged_at,
      number: curr.number,
      state: curr.state,
    }))

    prs = prs.filter(curr => Boolean(curr.mergedAt))

    if (user) {
      prs = prs.filter(curr => curr.user === user)
    }
    return prs
  }

  async createPr(title: string): Promise<void> {
    this.gitOps.noUncommittedChanges()
    this.gitOps.push()

    const b = await this.gitOps.getBranch()
    const r = await this.gitOps.getRepo()

    const req = {
      base: 'master',
      head: b.name,
      owner: r.owner,
      repo: r.name,
      title,
    }
    try {
      const resp = await this.kit.pulls.create(req)
      // eslint-disable-next-line no-console
      console.log(`PR #${resp.data.number} created\n${resp.data.html_url}`)
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x = err as any
      const errors = [...x['errors']]
      const alreadyExist = Boolean(
        errors.find(
          e => e['resource'] === 'PullRequest' && String(e['message']).includes('A pull request already exists'),
        ),
      )
      if (!alreadyExist) {
        throw new Error(`Failed to create PR\n${JSON.stringify(x, null, 2)}`)
      }

      // eslint-disable-next-line no-console
      console.log('PR already exists')
    }
  }
}
