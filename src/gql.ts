import { GitOps } from './GitOps'
import { createTokenAuth } from '@octokit/auth-token'
import * as octokit from '@octokit/graphql'
import { graphql } from '@octokit/graphql/dist-types/types'

export interface CurrentPrInfo {
  number: number
  conflicts: boolean
  mergeBlockerFound: boolean
  url: string
  rollupState: string
  checks: {
    url: string
    description: string
    state: string
  }[]
  lastCommit?: {
    message: string
    abbreviatedOid?: string
    ordinal: number
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
              mergeable
              commits(last: 1) {
                nodes {
                  commit {
                    message
                    abbreviatedOid
                    oid
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
    const d = commit && (await this.gitOps.describeCommit(commit?.oid))
    const ordinal = d ? d.ordinal : -1
    const hasConflicts = pr.mergeable !== 'MERGEABLE'

    const rollupState = commit?.statusCheckRollup?.state
    const checks = commit?.status?.contexts?.map(c => ({
      state: c.state,
      description: c.description,
      url: c.targetUrl,
    }))
    return {
      number: pr.number,
      conflicts: hasConflicts,
      mergeBlockerFound: hasConflicts || rollupState === 'ERROR' || rollupState === 'FAILURE',
      url: pr.url,
      rollupState,
      checks,
      lastCommit: commit && { message: commit?.message, abbreviatedOid: commit?.abbreviatedOid, ordinal },
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
