const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const IORedis = require('ioredis');
const { runAITriage } = require('./orchestrator');

const prisma = new PrismaClient();
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker('triage-tasks', async (job) => {
  const { repoDbId, githubRepoFullName, issueNumber, title, body } = job.data;
  const [owner, repoName] = String(githubRepoFullName || '').split('/');

  console.log(`[Queue Processing] ${githubRepoFullName}#${issueNumber}`);

  const repo = await prisma.repository.findUnique({
    where: { id: repoDbId },
    include: { organization: true, rules: true }
  });

  if (!repo || !repo.isHookActive) return;

  const { result, tokensUsed } = await runAITriage({
    title,
    body,
    repoRules: repo.rules,
    provider: repo.organization.llmProvider,
    encryptedApiKey: repo.organization.encryptedApiKey
  });

  await prisma.issue.create({
    data: {
      githubIssueId: BigInt(Date.now()),
      issueNumber: issueNumber,
      title: title,
      repositoryId: repo.id,
      labelsApplied: result.suggestedLabels,
      wasIncomplete: result.isIncomplete,
      tokensUsed: tokensUsed,
    }
  });

  if (GITHUB_APP_ID && GITHUB_PRIVATE_KEY) {
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: GITHUB_APP_ID,
        privateKey: String(GITHUB_PRIVATE_KEY).replace(/\\n/g, '\n'),
        installationId: repo.organization.installationId,
      },
    });

    if (repo.autoLabeling && result.suggestedLabels.length > 0) {
      await octokit.rest.issues.addLabels({
        owner,
        repo: repoName,
        issue_number: issueNumber,
        labels: result.suggestedLabels,
      });
    }

    if (repo.checkCompleteness && result.isIncomplete && result.politeCommentText.trim().length > 0) {
      await octokit.rest.issues.createComment({
        owner,
        repo: repoName,
        issue_number: issueNumber,
        body: result.politeCommentText,
      });
    }
  }

  console.log(`[Job Success] Completed pipeline for #${issueNumber}`);
}, {
  connection: redisConnection,
  concurrency: 5
});

worker.on('failed', (job, err) => {
  console.error(`[Worker Crash] Job ${job?.id} failed:`, err.message);
});
