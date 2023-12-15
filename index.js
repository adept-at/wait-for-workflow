const { Octokit } = require('@octokit/rest');
const core = require('@actions/core');

async function run() {
  const githubToken = core.getInput('GITHUB_TOKEN');
  const repository = core.getInput('REPOSITORY');
  const workflowName = core.getInput('WORKFLOW_NAME');

  // Create a new Octokit instance
  const octokit = new Octokit({
    auth: githubToken,
    userAgent: 'GitHub Action',
  });

  const [owner, repo] = repository.split('/');

  const MAX_ATTEMPTS = 8;
  let attempt = 0;
  const current_time = new Date();
  core.info('Current Time: ' + current_time.toISOString());
  const thirtySecsLater = new Date(current_time.getTime() + 30000);

  async function checkWorkflowStatus() {
    try {
      const response = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        event: 'repository_dispatch'
      });

      if (!response.data.workflow_runs) {
        core.error('No workflow runs found');
        return { status: null, conclusion: null };
      }

      const workflowRuns = response.data.workflow_runs.filter(
        (run) =>
          new Date(run.created_at) > new Date(current_time) &&
          new Date(run.created_at) < new Date(thirtySecsLater) &&
          run.display_title === workflowName
      );

      if (workflowRuns.length > 0) {
        const status = workflowRuns[0].status;
        const conclusion = workflowRuns[0].conclusion;
        core.info('Status of the matching workflow run: ' + status);
        return { status, conclusion };
      } else {
        core.info('No matching workflow runs found');
        return { status: null, conclusion: null };
      }
    } catch (error) {
      core.error('Error fetching workflow runs: ' + error.message);
      throw error;
    }
  }

  async function waitForWorkflowCompletion() {
    let res = {};
    while (attempt < MAX_ATTEMPTS) {
      try {
        res = await checkWorkflowStatus();
        if (res && res.status === 'completed') {
          if (res.conclusion === 'success') {
            core.info('Workflow completed and test passed!');
            break;
          } else if (res.conclusion === 'failure') {
            core.error('Workflow status is failed...');
            process.exit(1);
          }
        } else if (res.status) {
          core.info(
            'Workflow status is ' + res.status + '. Waiting for completion...'
          );
        } else {
          core.info('Workflow status is unknown. Waiting for completion...');
        }
      } catch (error) {
        core.error('Error checking workflow status: ' + error.message);
        break;
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
