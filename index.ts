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

async function waitForWorkflowCompletion(
    octokit: Octokit,
    owner: string,
    repo: string,
    workflowName: string,
    maxAttempts: number,
    pollIntervalSeconds: number
) {
    let attempt = 0;
    const current_time = new Date();
    core.info('Current Time: ' + current_time.toISOString());
    const thirtySecsLater = new Date(current_time.getTime() + 30000);
    const pollIntervalMs = pollIntervalSeconds * 1000;

    core.info(
        `Polling up to ${maxAttempts} attempt(s) every ${pollIntervalSeconds}s ` +
        `(~${Math.round((maxAttempts * pollIntervalSeconds) / 60)} min max).`
    );

    let res: WorkflowRunStatus = { status: null, conclusion: null };
    while (attempt < maxAttempts) {
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
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    if (attempt === maxAttempts) {
        core.error('Max attempts reached without completion. Exiting.');
        process.exit(1);
    }
}

// Parse a positive-integer input, falling back to a default for empty or
// invalid values so callers can omit it and preserve historical behavior.
function parsePositiveInt(value: string, fallback: number): number {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        core.warning(`Invalid positive integer input "${value}"; falling back to ${fallback}.`);
        return fallback;
    }
    return parsed;
}

// Defaults preserve the historical ~8 minute ceiling (16 attempts x 30s) so
// existing consumers that don't set these inputs are unaffected.
const DEFAULT_MAX_ATTEMPTS = 16;
const DEFAULT_POLL_INTERVAL_SECONDS = 30;

async function run() {
    const githubToken = core.getInput('GITHUB_TOKEN');
    const repository = core.getInput('REPOSITORY');
    const workflowName = core.getInput('WORKFLOW_NAME');
    const clientPayload = core.getInput('CLIENT_PAYLOAD', { required: false });
    const verifyJobInput = core.getInput('VERIFY_JOB');
    const verifyJob = verifyJobInput.toLowerCase() === 'true';
    const maxAttempts = parsePositiveInt(core.getInput('MAX_ATTEMPTS'), DEFAULT_MAX_ATTEMPTS);
    const pollIntervalSeconds = parsePositiveInt(
        core.getInput('POLL_INTERVAL_SECONDS'),
        DEFAULT_POLL_INTERVAL_SECONDS
    );

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
        await waitForWorkflowCompletion(octokit, owner, repo, workflowName, maxAttempts, pollIntervalSeconds);
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
