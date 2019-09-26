import { GitOps } from './GitOps'
import * as Octokit from '@octokit/rest'

export class GithubOps {

    constructor(private readonly kit: Octokit, private readonly gitOps: GitOps) {}

    async getUser() {
        const d = await this.kit.users.getAuthenticated()
        return d.data.login
    }
    
    async listPrs() {
        const arr = await Promise.all([this.gitOps.getRepo(), this.getUser()])
        const r = arr[0]
        const user = arr[1]
    
        const req: Octokit.PullsListParams = {
            owner: r.owner,
            repo: r.name,
            state: 'open',
            sort: 'updated',
            direction: 'desc'
        }
        const resp = await this.kit.pulls.list(req)
        const prs = resp.data.map(curr => ({
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
    
        prs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    
        return prs.filter(curr => curr.user === user)    
    }

    async listMerged(user?: string) {
        const arr = await Promise.all([this.gitOps.getRepo()])
        const r = arr[0]
    
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
