#  GitHub Issue Triage Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/ali202333/gh-issue-triage-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/ali202333/gh-issue-triage-bot/actions/workflows/ci.yml)
[![Render Deploy](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ali202333/gh-issue-triage-bot)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)]()
[![Prisma](https://img.shields.io/badge/Prisma-5-green)]()

> Open-source AI agent that auto-labels, routes, and enriches GitHub issues the moment they're opened. No more noisy, untagged issues.

---

## The problem

Maintainers waste hours every week on triage:

- Labels missing or wrong
- Incomplete bug reports (no reproduction, no version)
- Duplicate issues filed daily
- New issues buried in notifications

## What this does

| Feature | What you get |
|---|---|
| **Auto-labeling** | LLM tags issues as `bug`, `enhancement`, `question`, `docs`, … |
| **Completeness check** | Prompts reporter for missing info when body is thin |
| **Duplicate surfacing** | Flags likely dupes based on embeddings + title similarity |
| **Custom routing rules** | Per-repo markdown rules with Zod schema validation |
| **Multi-tenant** | One install, any number of repos, any number of users |
| **BYOK LLM** | You supply OpenAI / Anthropic key — we never see your data |

## How it works

![Architecture](https://user-images.githubusercontent.com/placeholder/architecture.png)

1. GitHub sends `issues` webhook (`application/json`)
2. HMAC signature verified, payload enqueued to **BullMQ** on **Redis**
3. **Orchestrator** builds a typed triage contract with **Zod**
4. LLM call generates labels, summaries, routing comment
5. **Octokit** applies labels and posts a structured comment back to the issue
6. Results persisted in **PostgreSQL** via **Prisma**

## Architecture

```
┌─────────────┐      webhook       ┌──────────┐
│  GitHub     │ ─────────────────► │ Express  │
│ Repository  │                    │ Server   │
└─────────────┘                    └────┬─────┘
                                         │ enqueue
                                         ▼
                                   ┌──────────┐
                                   │  BullMQ  │
                                   │  Queue   │
                                   └────┬─────┘
                                         │ process
                                         ▼
                                   ┌──────────┐
                                   │ Orchest-  │
                                   │ rator +   │
                                   │ Worker    │
                                   └────┬─────┘
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                        ┌──────────┐         ┌──────────┐
                        │ LLM API  │         │ Octokit  │
                        │ OpenAI/  │         │  + DB    │
                        │ Anthropic│         └──────────┘
                        └──────────┘
```

## Quick start

### 1-click deploy (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ali202333/gh-issue-triage-bot)

Clicking the badge will provision:
- **Web Service** (Express)
- **PostgreSQL** database
- **Redis** instance

You still need to set secrets before the first deploy.

### Manual setup

```bash
# 1. Clone and install
git clone https://github.com/ali202333/gh-issue-triage-bot.git
cd gh-issue-triage-bot
npm install

# 2. Copy env and run migrations
cp .env.example .env
npx prisma migrate deploy
npx prisma generate

# 3. Start webhook server + worker
npm start          # terminal 1 — Express at :3000
npm run worker     # terminal 2 — BullMQ consumer
```

### Build from source

```bash
# generate Prisma client
npm run db:generate

# run tests
npm test

# lint
npm run lint
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string (BullMQ) |
| `GITHUB_WEBHOOK_SECRET` | ✅ | HMAC secret from GitHub repo webhook settings |
| `GITHUB_TOKEN` | ✅ | PAT or App JWT with repo scope |
| `OPENAI_API_KEY` | ◻️ | OpenAI provider (Bring Your Own Key) |
| `ANTHROPIC_API_KEY` | ◻️ | Anthropic provider (alternative) |
| `LLM_PROVIDER` | ⚪ | `openai` or `anthropic` (default `openai`) |
| `LLM_MODEL` | ⚪ | Model override, e.g. `gpt-4o-mini` / `claude-3-5-sonnet` |
| `ENCRYPTION_KEY` | ✅ | Fernet-encoded 32-byte key for storing org API keys |

## Project layout

```
gh-issue-triage-bot/
├── src/
│   ├── index.js             # Express webhook entrypoint
│   ├── queue.js             # BullMQ queue + Redis connection
│   ├── orchestrator.js      # Zod contract + LLM call
│   ├── worker.js            # Background consumer + Octokit actions
│   ├── triageSchema.js      # Zod schema for ingress validation
│   └── index.ts             # TypeScript fallback entry
├── prisma/
│   └── schema.prisma        # Multi-tenant data model
├── render.yaml              # Render blueprint (one-click deploy)
├── .github/workflows/ci.yml # CI on every push
└── package.json
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — PRs, bug reports, and feature requests welcome.

## Security

See [SECURITY.md](SECURITY.md) — for reporting vulnerabilities privately.

## Roadmap

- [ ] GitHub App installation flow (OAuth code exchange)
- [ ] Admin dashboard (Next.js + shadcn/ui)
- [ ] Embedding-based duplicate detection
- [ ] Rule-based routing composer (YAML → Zod → runtime)
- [ ] Slack/Discord notifications for new high-priority issues
- [ ] Usage metering per org for billing

## License

[MIT](LICENSE) — free to use, modify, and ship.
