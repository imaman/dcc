import { GitOps } from './GitOps'
import * as Octokit from '@octokit/rest'

export class GithubOps {

    constructor(private readonly kit: Octokit, private readonly gitOps: GitOps) {}

    async getUser() {
        const d = await this.kit.users.getAuthenticated()
        return d.data.login
    }
    
    async listPrs() {
        const [repo, user] = await Promise.all([this.gitOps.getRepo(), this.getUser()])
    
        // const req: Octokit.PullsListParams = {
        //     owner: repo.owner,
        //     repo: repo.name,
        //     state: 'open',
        //     sort: 'updated',
        //     direction: 'desc'
        // }
        // const resp = await this.kit.pulls.list(req)

        const respB = await this.kit.search.issuesAndPullRequests({
            q: `type:pr	author:${user} state:open repo:${repo.owner}/${repo.name} sort:updated-desc`,
        })
        // console.log('resp=\n'+ JSON.stringify(respB, null, 2))
        // process.exit(-1)
        const prs = respB.data.items.map(curr => ({
                user: curr.user.login, 
                title: curr.title, 
                url: `https://github.com/${repo.owner}/${repo.name}/pull/${curr.number}`,
                body: curr.body,
                // branch: curr.head.ref,
                updatedAt: curr.updated_at,
                createdAt: curr.created_at,
                // mergedAt: curr.merged_at,
                number: curr.number,
                state: curr.state
            }))
    
        return prs.filter(curr => curr.user === user)    
    }

    getCurrentPr() {

    }

    async listChecks() {
        const r = await this.gitOps.getRepo()
        const b = await this.gitOps.getBranch()
        const statusPromise = this.kit.repos.getCombinedStatusForRef({
            owner: r.owner,
            repo: r.name,
            ref: b.name
          })        

        const branchPromise = await this.kit.repos.getBranch({
            owner: r.owner,
            repo: r.name,
            branch: 'master'
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

        return {statuses, state: status.data.state, sha: status.data.sha, commit: d}
    }

    async listMerged(user?: string) {
        const r = await this.gitOps.getRepo()
    
        const pageSize = user ? 100 : 40
        const req: Octokit.PullsListParams = {
            owner: r.owner,
            repo: r.name,
            state: 'closed',
            sort: 'updated',
            direction: 'desc',
            per_page: pageSize
        }
        const resp = await this.kit.pulls.list(req)
        let prs = resp.data.map(curr => ({
                user: curr.user.login, 
                title: curr.title, 
                url: `https://github.com/${r.owner}/${r.name}/pull/${curr.number}`,
                body: curr.body,
                branch: curr.head.ref,
                updatedAt: curr.updated_at,
                createdAt: curr.created_at,
                mergedAt: curr.merged_at,
                // closedAt: curr.closed_at,
                number: curr.number,
                state: curr.state
            }))
    
        prs = prs.filter(curr => Boolean(curr.mergedAt))
        // prs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    
        if (user) {
            prs = prs.filter(curr => curr.user === user)
        }
        return prs
    }

    async createPr(title: string) { 
        this.gitOps.noUncommittedChanges()    
        this.gitOps.push()
    
        const b = await this.gitOps.getBranch()
        const r = await this.gitOps.getRepo()
    
        const req: Octokit.PullsCreateParams = {
            base: 'master',
            head: b.name,
            owner: r.owner,
            repo: r.name,
            title
        }
        const resp = await this.kit.pulls.create(req)
        console.log(JSON.stringify(resp))
    }    
}
