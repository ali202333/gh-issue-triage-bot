# Contributing to GitHub Issue Triage Bot

Thanks for your interest — PRs, issues, and feature requests all welcome.

## Development

```bash
git clone https://github.com/ali202333/gh-issue-triage-bot.git
cd gh-issue-triage-bot
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:generate
```

## Commit messages

Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

Need help? Open an issue with the label `question`.
