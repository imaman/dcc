import { GitOps } from './GitOps'
import { createTokenAuth } from '@octokit/auth-token'
import * as octokit from '@octokit/graphql'
import * as fs from 'fs'
import { graphql } from '@octokit/graphql/dist-types/types'
import { GithubOps } from './GithubOps'
import { prependListener } from 'process'

export class GraphqlOps {
  private readonly authedGraphql: graphql
  constructor(token: string, private readonly gitOps: GitOps, private readonly githubOps: GithubOps) {
    const auth = createTokenAuth(token)

    this.authedGraphql = octokit.graphql.defaults({
      request: {
        hook: auth.hook,
      },
    })
  }

  async getCurrentPr() {
    const b = await this.gitOps.getBranch()
    // const user = await this.githubOps.getUser()
    const repo = await this.gitOps.getRepo()

    const q = `
    {
      repository(owner: "${repo.owner}", name: "${repo.name}") {
        ref(qualifiedName: "refs/heads/${b.name}") {
          name
          associatedPullRequests(last: 10, states: OPEN) {
            nodes {
              headRefName
              title
              number
              url
            }
          }
        }
      }
    }`
    const { repository } = await this.authedGraphql(q)
    const nodes = repository.ref.associatedPullRequests.nodes
    const pr = nodes && nodes[0]

    if (!pr) {
      return undefined
    }

    return { number: pr.number, url: pr.url }
  }
}
// async function main() {
//   const token = fs.readFileSync('/home/imaman/code/imaman/dcc/.conf').toString().split('\n')[0].trim()

//   const { repository } = await authedGraphql(`
//   {
//     repository(owner: "imaman", name: "dcc") {
//       ref(qualifiedName: "refs/heads/merge") {
//         name
//         associatedPullRequests(last: 10, states: OPEN) {
//           nodes {
//             headRefName
//             title
//             number
//           }
//         }
//       }
//     }
//   }
//   `)

//   return repository

// }

// main().then(c => console.log(JSON.stringify(c, null, 2))).catch(e => console.error('FAIL', e.stack || e))
