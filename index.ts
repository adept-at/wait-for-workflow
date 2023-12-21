import { Octokit } from "@octokit/rest";
import * as core from '@actions/core';

interface WorkflowRunStatus {
    status: string | null;
    conclusion: string | null;
}

async function dispatchWorkflowEvent(octokit: Octokit, owner: string, repo: string, eventType: string, clientPayload: string) {
    try {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        await octokit.rest.repos.createDispatchEvent({
            owner,
            repo,
            event_type: eventType,
            client_payload: payload
        });
        core.info(`Dispatched event '${eventType}' successfully.`);
    } catch (error) {
        if (error instanceof Error) {
            core.error(`Error dispatching event: ${error.message}`);
        } else {
            core.error('Unknown error occurred while dispatching event');
        }
        throw error;
    }
}

async function checkWorkflowStatus(octokit: Octokit, owner: string, repo: string, workflowName: string, current_time: Date, thirtySecsLater: Date): Promise<WorkflowRunStatus> {
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
            const url = workflowRuns[0].html_url; 
            core.info(`Status of the matching run: ${status} at (${url})`);
            return { status, conclusion };
        } else {
            core.info('No matching workflow runs found');
            return { status: null, conclusion: null };
        }
    } catch (error) {
        if (error instanceof Error) {
            core.error('Error fetching workflow runs: ' + error.message);
        } else {
            core.error('An unknown error occurred');
        }
        throw error;
    }
}

async function waitForWorkflowCompletion(octokit: Octokit, owner: string, repo: string, workflowName: string) {
    const MAX_ATTEMPTS = 16;
    let attempt = 0;
    const current_time = new Date();
    core.info('Current Time: ' + current_time.toISOString());
    const thirtySecsLater = new Date(current_time.getTime() + 30000);

    let res: WorkflowRunStatus = { status: null, conclusion: null };
    while (attempt < MAX_ATTEMPTS) {
        res = await checkWorkflowStatus(octokit, owner, repo, workflowName, current_time, thirtySecsLater);
        if (res && res.status === 'completed') {
            if (res.conclusion === 'success') {
                core.info('Workflow completed successfully!');
                break;
            } else if (res.conclusion === 'failure') {
                core.error('Workflow failed...');
                process.exit(1);
            }
        } else if (res.status) {
            core.info('Workflow status is ' + res.status + '. Waiting for completion...');
        } else {
            core.info('Workflow status is unknown. Waiting for completion...');
        }
        attempt++;
        core.info('Attempt: ' + attempt);
        await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds
    }

    if (attempt === MAX_ATTEMPTS) {
        core.error('Max attempts reached without completion. Exiting.');
        process.exit(1);
    }
}

async function run() {
    const githubToken = core.getInput('GITHUB_TOKEN');
    const repository = core.getInput('REPOSITORY');
    const workflowName = core.getInput('WORKFLOW_NAME');
    const clientPayload = core.getInput('CLIENT_PAYLOAD', { required: false });
    const verifyJobInput = core.getInput('VERIFY_JOB');
    const verifyJob = verifyJobInput.toLowerCase() === 'true';

    // Create a new Octokit instance
    const octokit = new Octokit({
        auth: githubToken,
        userAgent: 'GitHub Action',
    });

    const [owner, repo] = repository.split('/');

    // Dispatch the workflow event
    await dispatchWorkflowEvent(octokit, owner, repo, workflowName, clientPayload);

    // Only wait for workflow completion if VERIFY_JOB is true
    if (verifyJob) {
        await waitForWorkflowCompletion(octokit, owner, repo, workflowName);
    } else {
        core.info(`VERIFY_JOB is not enabled. ${workflowName} was dispatched from ${repo}.`);
    }
}

run().catch((error) => {
    if (error instanceof Error) {
        core.setFailed('Action failed with error: ' + error.message);
    } else {
        core.setFailed('Action failed due to an unknown error');
    }
});
