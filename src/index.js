const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { triageQueue } = require('./queue');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(digest, 'utf8'));
}

app.post('/api/webhooks/github', async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook token signature.' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event === 'installation' && payload.action === 'created') {
    await prisma.organization.create({
      data: {
        githubOrgId: payload.installation.account.id,
        name: payload.installation.account.login,
        avatarUrl: payload.installation.account.avatar_url,
        installationId: String(payload.installation.id),
      }
    });
    return res.status(200).json({ status: 'Installation tracked successfully.' });
  }

  if (event === 'issues' && payload.action === 'opened') {
    const { repository, issue } = payload;

    const repoSettings = await prisma.repository.findUnique({
      where: { githubRepoId: repository.id },
      include: { organization: true }
    });

    if (!repoSettings || !repoSettings.isHookActive) {
      return res.status(200).json({ status: 'Repository is unmonitored or toggle is inactive.' });
    }

    await triageQueue.add('analyze-issue', {
      repoDbId: repoSettings.id,
      githubRepoFullName: repository.full_name,
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body || '',
    });

    return res.status(202).json({ queued: true, status: 'Payload decoupled to background pipeline.' });
  }

  return res.status(200).json({ status: 'Event type bypassed.' });
});

app.listen(PORT, () => console.log(`Core webhook router active on port ${PORT}`));
