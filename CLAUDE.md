# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DCC (Dev Control Center) is a CLI tool for managing Git and GitHub pull request workflows. It's written in TypeScript and provides commands for creating branches, managing PRs, merging changes, and tracking ongoing work.

## Key Commands

### Build and Development

```bash
# Build the TypeScript project
yarn build

# Run tests (currently no test implementation)
yarn test
```

### Pre-commit/Pre-push Hooks

- **Pre-push**: Runs `yarn build`

### Important Instructions

**NEVER run lint or yarn lint commands** - The project's linting is handled automatically by pre-commit hooks and should not be run manually.

## Architecture and Structure

### Core Components

1. **Main Entry Point** (`src/main.ts`):

   - Command-line interface using yargs
   - Commands: status, push, submit, catch-up, list-ongoing, list-closed, pending, diff, start-new
   - Reads configuration from `~/.dccrc.json` (requires GitHub token)

2. **GitOps** (`src/GitOps.ts`):

   - Wrapper around simple-git library
   - Handles all Git operations (fetch, merge, push, diff, branch management)
   - Key methods: `mainBranch()`, `push()`, `findBaselineCommit()`, `getChangedFiles()`

3. **GithubOps** (`src/GithubOps.ts`):

   - Uses Octokit REST API
   - Manages GitHub PR operations
   - Key methods: `createPr()`, `merge()`, `getChecks()`, `listPrs()`

4. **GraphqlOps** (`src/gql.ts`):
   - Uses GitHub GraphQL API for complex queries
   - Handles auto-merge functionality
   - Key methods: `getCurrentPr()`, `enableAutoMerge()`

### Key Workflows

1. **Creating a new branch**: `dcc start-new -b <branch-name>`
2. **Pushing changes**: `dcc push <PR title>`
3. **Submitting PR**: `dcc submit` (handles auto-merge when checks are pending)
4. **Checking status**: `dcc status` (shows PR info, checks, mergeability)

### Configuration

The tool requires a `.dccrc.json` file in the user's home directory:

```json
{
  "token": "github-personal-access-token",
  "prLabels": ["optional", "labels"]
}
```

### Important Notes

- The tool enforces working from feature branches (not main)
- Requires clean working directory for most operations
- Automatically determines main branch using `git symbolic-ref`
- Supports auto-merge when checks are pending
- Uses emoji indicators for check status (✅ passing, 🚧 pending, ❌ failing)
