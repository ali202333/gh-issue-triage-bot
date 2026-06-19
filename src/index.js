const http = require("http");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const APP_NAME = "gh-issue-triage-bot";
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET || !signature) return false;
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = Buffer.from("sha256=" + hmac.update(rawBody).digest("hex"), "utf8");
  const checksum = Buffer.from(signature, "utf8");
  return crypto.timingSafeEqual(digest, checksum);
}

function getRepo(fullName) {
  const [owner, repo] = String(fullName || "").split("/");
  if (!owner || !repo) return null;
  return `https://api.github.com/repos/${owner}/${repo}`;
}

async function githubApi(url, method, body) {
  if (!GITHUB_TOKEN || !url) return null;
  const bodyText = body ? JSON.stringify(body) : undefined;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...(bodyText ? { "Content-Type": "application/json" } : {})
    },
    body: bodyText
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("github_api_error", res.status, text, { url, method });
    return null;
  }

  if (res.status === 204) return { ok: true };
  return res.json().catch(() => ({ ok: true }));
}

const classify = (title, body) => {
  const text = `${title} ${body}`.toLowerCase();
  if (/bug|error|fix|traceback|exception/.test(text)) return ["bug"];
  if (/enhancement|feature|request|proposal/.test(text)) return ["enhancement"];
  if (/documentation|docs|readme|wiki/.test(text)) return ["documentation"];
  if (/question|help/.test(text)) return ["question"];
  return ["triage"];
};

async function handleIssueOpened(payload) {
  const repository = payload.repository || {};
  const issue = payload.issue || {};
  const repoFullName = repository.full_name;
  const base = getRepo(repoFullName);
  if (!base) return;

  const labels = classify(issue.title || "", issue.body || "");

  const repoSettings = await prisma.repository.findUnique({
    where: { githubRepoId: BigInt(repository.id) },
    include: { organization: true }
  });

  // Always label when hook active
  if (repoSettings) {
    await githubApi(
      `${base}/issues/${issue.number}/labels`,
      "POST",
      { labels: [...(issue.labels || []).map((label) => label.name), ...labels].filter(Boolean) }
    );

    if (repoSettings.checkCompleteness) {
      const needsInfo =
        !(issue.body || "").includes("reproduce") &&
        !(issue.body || "").includes("environment");
      if (needsInfo) {
        await githubApi(`${base}/issues/${issue.number}/comments`, "POST", {
          body: "Thanks for opening this! Could you please share reproduction steps and environment details?"
        });
      }
    }
  } else if (GITHUB_TOKEN) {
    // Fallback: label directly if repo not registered yet
    await githubApi(`${base}/issues/${issue.number}/labels`, "POST", { labels });
  }

  await prisma.issue.create({
    data: {
      githubIssueId: BigInt(issue.id),
      issueNumber: Number(issue.number),
      title: issue.title || "",
      repository: {
        connectOrCreate: {
          where: { githubRepoId: BigInt(repository.id) },
          create: {
            githubRepoId: BigInt(repository.id),
            name: repository.name || repoFullName,
            isHookActive: true,
            organization: {
              connectOrCreate: {
                where: { githubOrgId: BigInt(repository.owner.id) },
                create: {
                  githubOrgId: BigInt(repository.owner.id),
                  name: repository.owner.login,
                  avatarUrl: repository.owner.avatar_url || "",
                  installationId: String(payload.installation?.id || "")
                }
              }
            }
          }
        }
      },
      labelsApplied: labels
    }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  try {
    const event = req.headers["x-github-event"];
    const sig = req.headers["x-hub-signature-256"] || "";

    if (!verifySignature(body, sig)) {
      console.warn(`[${APP_NAME}] bad_webhook_signature`);
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const payload = JSON.parse(body);
    console.log(`[${APP_NAME}] event=${String(event ?? "unknown")}`);

    if (event === "issues" && payload.action === "opened") {
      await handleIssueOpened(payload).catch((err) => console.error("triage_error", err));
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("handler_error", err);
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad_request" }));
  }
});

server.listen(PORT, () => {
  console.log(`[${APP_NAME}] listening on :${PORT}`);
});
