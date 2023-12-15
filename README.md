# wait-for-workflow:

To update and release: 

Create a new branch.
Make edits to /index.ts, then run 'ncc build index.ts -o dist' to create /dist/index.js for
 the action file to locate and run.

push and merge, then do a release, Example:

git tag -a v1.0.1 -m "change version ot match package.json"
git push origin v1.0.1

Go to release tab in repo and publish.

Example usage in a workflow:


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
        uses: adept-at/wait-for-workflow@v1.0.5
        with:
            GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
            REPOSITORY: adept-at/learn-webapp
            WORKFLOW_NAME: cypress-learn-webapp
            CLIENT_PAYLOAD: '{"ref": "${{ github.ref }}", "sha": "${{ github.sha }}", "repo": "${{ github.repository }}", "run_id": "${{ github.run_id }}", "run_attempt": "${{ github.run_attempt }}", "target_url": "${{ github.event.deployment_status.target_url }}"}'
    env:
      GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
```
