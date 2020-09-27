import { GitOps } from './GitOps'
import { createTokenAuth } from '@octokit/auth-token'
import * as octokit from '@octokit/graphql'
import { graphql } from '@octokit/graphql/dist-types/types'

export interface CurrentPrInfo {
  number: number
  url: string
  rollupState: string
  checks: string[]
  lastCommit?: {
    message: string
    abbreviatedOid?: string
  }
}

export class GraphqlOps {
  private readonly authedGraphql: graphql
  constructor(token: string, private readonly gitOps: GitOps) {
    const auth = createTokenAuth(token)

    this.authedGraphql = octokit.graphql.defaults({
      request: {
        hook: auth.hook,
      },
    })
  }

  async getCurrentPr(): Promise<CurrentPrInfo | undefined> {
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
              commits(last: 1) {
                nodes {
                  commit {
                    message
                    abbreviatedOid
                    statusCheckRollup {
                      state
                    }
                    status {
                      contexts {
                        state
                        targetUrl
                        description
                      }
                    }
                  }
                }
              }    
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

    const commit = pr?.commits?.nodes && pr?.commits?.nodes[0]?.commit
    const rollupState = commit?.statusCheckRollup?.state
    const checks = commit?.status?.contexts?.map(c => ({
      state: c.state,
      description: c.description,
      url: c.targetUrl,
    }))
    return {
      number: pr.number,
      url: pr.url,
      rollupState,
      checks,
      lastCommit: commit && { message: commit?.message, abbreviatedOid: commit?.abbreviatedOid },
    }
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
