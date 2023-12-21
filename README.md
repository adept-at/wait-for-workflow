# wait-for-workflow:

To update and release: 

1. Create a new branch.
2. Make edits to /index.ts, then once staged in a commit, husky will compile the /dist/index.js, then just push that commit, and merge to main, 
3. Do a release, Example:

git tag -a v1.0.11 -m "change version to match package.json version"
git push origin v1.0.11

Go to the release tab in repo and publish by that tag ^.

# Example usage in a workflow to dispatch and wait for results:


```
name: Cypress E2E Preview Url Tests
on: [deployment_status]

jobs:
  setup:
    runs-on: ubuntu-22.04
    timeout-minutes: 9
    if: ${{ github.event.deployment_status.state == 'success' && github.event.deployment_status.environment != 'Production' }}
    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js 18
        uses: actions/setup-node@v3
        with:
          node-version: 18.x
          registry-url: https://npm.pkg.github.com
          scope: '@adept-at'
      # Dispatch and wait for the Cypress workflow to complete and report back the status
      - name: Wait for Workflow Completion
        uses: adept-at/wait-for-workflow@v1.0.8
        with:
            GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
            REPOSITORY: adept-at/learn-webapp
            WORKFLOW_NAME: cypress-learn-webapp
            CLIENT_PAYLOAD: '{"ref": "${{ github.ref }}", "sha": "${{ github.sha }}", "repo": "${{ github.repository }}", "run_id": "${{ github.run_id }}", "run_attempt": "${{ github.run_attempt }}", "target_url": "${{ github.event.deployment_status.target_url }}"}'
            VERIFY_JOB: true ** Only required if waiting for the wortkflow results is needed. **
    env:
      GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
```
# Example usage in a workflow to just dispatch a remote_dispatch and not wait for results:


```
name: deployment-invite

on: [deployment_status]

jobs:
  check-deployment:
    runs-on: ubuntu-latest
    if: ${{ github.event.deployment_status.state == 'success' && github.event.deployment_status.environment == 'Production' }}
    steps:
      - name: Dispatch invite learner test in production
        uses: adept-at/wait-for-workflow@v1.0.9
        with:
          GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
          REPOSITORY:  adept-at/lib-wdio-8-multi-remote
          WORKFLOW_NAME: invite_learner
```