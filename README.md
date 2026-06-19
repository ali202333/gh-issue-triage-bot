# GitHub Issue Triage Bot

Auto-labels GitHub issues on open and leaves a routing comment.

## Prerequisites

- Node.js 18+
- PostgreSQL
- GitHub App or personal access token with repo access

## Local Setup

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npx prisma generate
npm start
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GITHUB_TOKEN` | GitHub App JWT or personal access token |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for webhook verification |

## Deployment

### Railway / Render

1. Connect the repo
2. Add env vars in the dashboard
3. Run `npx prisma migrate deploy` on startup

## GitHub Webhook

Add a webhook to your repository:
- Payload URL: `<your-server-url>`
- Content type: `application/json`
- Secret: same as `GITHUB_WEBHOOK_SECRET`
- Events: `Issues`, `Issue comment`
