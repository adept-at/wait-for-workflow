const https = require('https');
const core = require('@actions/core');

async function run() {
  const githubToken = core.getInput('GITHUB_TOKEN');
  const repository = core.getInput('REPOSITORY');
  const workflowName = core.getInput('WORKFLOW_NAME');

  const MAX_ATTEMPTS = 8;
  let attempt = 0;
  const current_time = new Date();
  console.log('Current Time: ', current_time.toISOString());
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
              console.error('Unexpected response structure:', response);
              reject('Invalid API response');
              return;
            }
            console.log('Response:', response.workflow_runs[0].status);
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
              console.log('Status of the matching workflow run: ', status);

              if (status === 'completed') {
                console.log(
                  'Completed matching workflow run: ',
                  status,
                  conclusion
                );
                resolve({ status, conclusion });
              } else {
                console.log('Workflow run is not completed yet');
                resolve({ status, conclusion: null });
              }
            } else {
              console.log('No workflow runs found');
              reject('No workflow runs found');
            }
          });
        })
        .on('error', (e) => {
          console.error(e);
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
        console.error('Error checking workflow status:', error);
      }

      if (res && res.status === 'completed' && res.conclusion === 'success') {
        console.log('Workflow completed and test passed!');
        break;
      } else if (
        res &&
        res.status === 'completed' &&
        res.conclusion === 'failure'
      ) {
        console.log('Workflow status is failed...');
        process.exit(1);
      } else if (res?.status !== '') {
        console.log(
          'Workflow status is ' + res?.status + '. Waiting for completion...'
        );
      } else {
        console.log('Workflow status is unknown. Waiting for completion...');
      }

      attempt++;
      console.log('Attempt: ' + attempt);
      await new Promise((resolve) => setTimeout(resolve, 60000)); // 60 seconds
    }

    if (attempt === MAX_ATTEMPTS) {
      console.log('Max attempts reached without completion. Exiting.');
      process.exit(1);
    }
  }

  await waitForWorkflowCompletion();
}

run().catch((error) => {
  core.setFailed(error.message);
});
