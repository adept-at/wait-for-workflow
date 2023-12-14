const https = require('https');
const core = require('@actions/core');

async function run() {
  const githubToken = core.getInput('GITHUB_TOKEN');
  const repository = core.getInput('REPOSITORY');
  const workflowName = core.getInput('WORKFLOW_NAME');

  const MAX_ATTEMPTS = 8;
  let attempt = 0;
  const current_time = new Date();
  core.info('Current Time: ' + current_time.toISOString());
  const thirtySecsLater = new Date(current_time.getTime() + 30000);

  async function checkWorkflowStatus() {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${repository}/actions/runs`,
      method: 'GET',
      headers: {
        Authorization: 'token ' + githubToken,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Node.js Script',
      },
    };
    core.info('Request options path: ' + JSON.stringify(options.path));

    return new Promise((resolve, reject) => {
      https
        .get(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const response = JSON.parse(data);
            if (!response.workflow_runs) {
              core.error(
                'Unexpected response structure: ' + JSON.stringify(response)
              );
              reject('Invalid API response');
              return;
            }
            core.info('Response: ' + response.workflow_runs[0].status);
            const workflowRuns = response.workflow_runs.filter(
              (run) =>
                new Date(run.created_at) > new Date(current_time) &&
                new Date(run.created_at) < new Date(thirtySecsLater) &&
                run.event === 'repository_dispatch' &&
                run.display_title === workflowName
            );
            if (workflowRuns.length > 0) {
              const status = workflowRuns[0].status;
              const conclusion = workflowRuns[0].conclusion;
              core.info('Status of the matching workflow run: ' + status);

              if (status === 'completed') {
                core.info(
                  'Completed matching workflow run: ' +
                    status +
                    ', ' +
                    conclusion
                );
                resolve({ status, conclusion });
              } else {
                core.info('Workflow run is not completed yet');
                resolve({ status, conclusion: null });
              }
            } else {
              core.info('No workflow runs found');
              reject('No workflow runs found');
            }
          });
        })
        .on('error', (e) => {
          core.error('HTTP request failed: ' + e.message);
          reject(e);
        });
    });
  }

  async function waitForWorkflowCompletion() {
    let res = {};
    while (attempt < MAX_ATTEMPTS) {
      try {
        res = await checkWorkflowStatus();
      } catch (error) {
        core.error('Error checking workflow status: ' + error.message);
      }

      if (res && res.status === 'completed' && res.conclusion === 'success') {
        core.info('Workflow completed and test passed!');
        break;
      } else if (
        res &&
        res.status === 'completed' &&
        res.conclusion === 'failure'
      ) {
        core.error('Workflow status is failed...');
        process.exit(1);
      } else if (res?.status !== '') {
        core.info(
          'Workflow status is ' + res?.status + '. Waiting for completion...'
        );
      } else {
        core.info('Workflow status is unknown. Waiting for completion...');
      }

      attempt++;
      core.info('Attempt: ' + attempt);
      await new Promise((resolve) => setTimeout(resolve, 60000)); // 60 seconds
    }

    if (attempt === MAX_ATTEMPTS) {
      core.error('Max attempts reached without completion. Exiting.');
      process.exit(1);
    }
  }

  await waitForWorkflowCompletion();
}

run().catch((error) => {
  core.setFailed('Action failed with error: ' + error.message);
});
