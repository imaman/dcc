import { GitOps } from './git-ops.js'
import { Octokit } from '@octokit/rest'
import { logger } from './logger.js'

export type Check =
  | {
      tag: 'FAILING'
      name: string
      url: string | null
      summary: string | null
    }
  | {
      tag: 'PASSING'
      name: string
    }
  | {
      tag: 'PENDING'
      name: string
      startedAt: string | null
      url: string | null
    }
export class GithubOps {
  constructor(private readonly kit: Octokit, private readonly gitOps: GitOps, private readonly prLabels: string[]) {}

  async getChecks(n: number): Promise<Check[]> {
    const r = await this.gitOps.getRepo()
    const pr = await this.kit.pulls.get({ pull_number: n, owner: r.owner, repo: r.name })
    const checks = await this.kit.checks.listForRef({
      owner: r.owner,
      repo: r.name,
      ref: pr.data.head.sha,
    })

    const pending: Check[] = checks.data.check_runs
      .filter(cr => cr.status !== 'completed')
      .map(cr => ({ tag: 'PENDING', name: cr.name, startedAt: cr.started_at, url: cr.html_url }))
    const passing: Check[] = checks.data.check_runs
      .filter(cr => cr.status === 'completed' && cr.conclusion === 'success')
      .map(cr => ({ tag: 'PASSING', name: cr.name }))
    const failing: Check[] = checks.data.check_runs
      .filter(cr => cr.status === 'completed' && cr.conclusion !== 'success')
      .map(cr => ({ tag: 'FAILING', name: cr.name, url: cr.html_url, summary: cr.output.summary }))

    return [...pending, ...passing, ...failing]
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

  async updatePrTitle(prNumber: number, newTitle: string): Promise<void> {
    const b = await this.gitOps.getRepo()
    await this.kit.pulls.update({ owner: b.owner, repo: b.name, pull_number: prNumber, title: newTitle })
  }
  async createPr(title: string): Promise<number> {
    const b = await this.gitOps.getBranch()
    const r = await this.gitOps.getRepo()

    let issueNumber: number | undefined
    try {
      const resp = await this.kit.pulls.create({
        base: await this.gitOps.mainBranch(),
        head: b.name,
        owner: r.owner,
        repo: r.name,
        title,
      })
      issueNumber = resp.data.number
      logger.info(`PR #${issueNumber} created\n${resp.data.html_url}`)
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

      logger.info('PR already exists')
    }

    if (issueNumber === undefined) {
      throw new Error(`Falsy issue number`)
    }

    if (this.prLabels.length > 0) {
      await this.kit.issues.addLabels({
        owner: r.owner,
        repo: r.name,
        issue_number: issueNumber,
        labels: this.prLabels,
      })
    }

    return issueNumber
  }
}
