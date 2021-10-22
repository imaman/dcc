import { GitOps } from './GitOps'
import { createTokenAuth } from '@octokit/auth-token'
import * as octokit from '@octokit/graphql'
import { graphql } from '@octokit/graphql/dist-types/types'
import { logger } from './logger'

type MergeabilityStatus = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
export interface CurrentPrInfo {
  title: string
  number: number
  mergeabilityStatus: MergeabilityStatus
  foundFailingRequiredChecks: boolean
  hasRequiredStatusChecks: boolean
  url: string
  checksArePositive: boolean
  rollupState: string
  rollupStateIsMissing: boolean
  requiredChecks: {
    url: string
    description: string
    state: string
    contextName: string
  }[]
  lastCommit?: {
    message: string
    abbreviatedOid?: string
    oid: string
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
        branchProtectionRules(last: 100) {
          nodes {
            matchingRefs(last: 100) {
              nodes {
                name
              }
            }
            requiredStatusCheckContexts
            requiresStatusChecks
          }
        }
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
                        context
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
    const resp = await this.authedGraphql(q)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repository: Rep = (resp as any).repository
    logger.silly(`getCurrentPr(): q=\n${q}, resp=${JSON.stringify(repository, null, 2)}`)

    const nodes = repository?.ref?.associatedPullRequests?.nodes
    const pr = nodes && nodes[0]

    if (!pr) {
      return undefined
    }

    const matchingRules = repository?.branchProtectionRules?.nodes?.filter(n =>
      n.matchingRefs?.nodes?.find(({ name }) => name === this.gitOps.mainBranch),
    )
    const rulesWithRequireStatusChecks =
      matchingRules?.filter(r => r.requiredStatusCheckContexts.length > 0 && r.requiresStatusChecks) || []

    const requiredCheckContexts = new Set<string>(
      rulesWithRequireStatusChecks.map(r => r.requiredStatusCheckContexts).flat(),
    )

    const commit = pr?.commits?.nodes && pr?.commits?.nodes[0]?.commit
    const d = commit && (await this.gitOps.describeCommit(commit?.oid))
    const ordinal = d ? d.ordinal : -1

    const rollupState = commit?.statusCheckRollup?.state
    const checksArePositive = rollupState === 'SUCCESS'
    const rollupStateIsMissing = !rollupState
    const checks =
      commit?.status?.contexts?.map(c => ({
        state: c.state,
        description: c.description,
        url: c.targetUrl,
        contextName: c.context,
      })) || []

    const requiredChecks = checks.filter(c => requiredCheckContexts.has(c.contextName))

    const received = new Set<string>(checks.map(c => c.contextName))
    const missing = [...requiredCheckContexts].filter(curr => !received.has(curr))
    for (const m of missing) {
      requiredChecks.push({ state: 'UNKNOWN', description: '', url: '', contextName: m })
    }

    logger.silly(
      `analysis of checks:\n${JSON.stringify(
        { matchingRules, rulesWithRequireStatusChecks, requiredCheckContexts: [...requiredCheckContexts], missing },
        null,
        2,
      )}`,
    )

    const hasRequiredStatusChecks = rulesWithRequireStatusChecks.length > 0
    const foundFailingRequiredChecks = Boolean(requiredChecks.find(c => c.state === 'ERROR' || c.state === 'FAILURE'))
    const mergeabilityStatus: MergeabilityStatus =
      pr.mergeable === 'MERGEABLE' ? 'MERGEABLE' : pr.mergeable === 'CONFLICTING' ? 'CONFLICTING' : 'UNKNOWN'

    const ret = {
      title: pr.title,
      number: pr.number,
      hasRequiredStatusChecks,
      foundFailingRequiredChecks,
      mergeabilityStatus,
      url: pr.url,
      checksArePositive,
      rollupState,
      rollupStateIsMissing,
      requiredChecks,
      lastCommit: commit && {
        message: commit?.message,
        abbreviatedOid: commit?.abbreviatedOid,
        ordinal,
        oid: commit?.oid,
      },
    }

    logger.silly('ret=\n' + JSON.stringify(ret, null, 2))
    return ret
  }
}

type Rep = {
  ref: {
    associatedPullRequests: {
      nodes: {
        mergeable: string
        title: string
        number: number
        url: string
        commits: {
          nodes: {
            commit: {
              message: string
              oid: string
              abbreviatedOid: string
              statusCheckRollup: {
                state: string
              }
              status: {
                contexts: {
                  state: string
                  description: string
                  targetUrl: string
                  context: string
                }[]
              }
            }
          }[]
        }
      }[]
    }
  }
  branchProtectionRules: {
    nodes: {
      matchingRefs: {
        nodes: {
          name: string
        }[]
      }
      requiredStatusCheckContexts: string[]
      requiresStatusChecks: boolean
    }[]
  }
}
