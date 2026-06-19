import http from "node:http";

const APP_NAME = "gh-issue-triage-bot";
const PORT = Number(process.env.PORT || "3000");
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

const labelsUrl = (owner, repo, issueNumber) =>
  `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`;

const commentUrl = (owner, repo, issueNumber) =>
  `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

const classify = (title, body) => {
  const text = `${title} ${body}`.toLowerCase();
  const labels = [];

  if (
    text.includes("bug") ||
    text.includes("error") ||
    text.includes("fix") ||
    text.includes("traceback") ||
    text.includes("exception")
  ) {
    labels.push("bug");
  }

  if (
    text.includes("feature") ||
    text.includes("enhancement") ||
    text.includes("request") ||
    text.includes("proposal")
  ) {
    labels.push("enhancement");
  }

  if (
    text.includes("documentation") ||
    text.includes("docs") ||
    text.includes("readme") ||
    text.includes("wiki")
  ) {
    labels.push("documentation");
  }

  if (
    text.includes("question") ||
    text.includes("help") ||
    text.startsWith("how to")
  ) {
    labels.push("question");
  }

  if (labels.length === 0) labels.push("triage");
  return labels;
};

const callGitHubApi = async (url, method, body) => {
  if (!GH_TOKEN) return;
  const bodyText = body ? JSON.stringify(body) : undefined;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...(bodyText ? { "Content-Type": "application/json" } : {})
    },
    body: bodyText
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("github_api_error", res.status, text);
    return;
  }
};

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
    const payload = JSON.parse(body);

    console.log(`[${APP_NAME}] event=${String(event ?? "unknown")}`);

    if (event === "issues" && payload.action === "opened") {
      const issue = payload.issue ?? {};
      const title = String(issue.title ?? "");
      const bodyText = String(((issue.body ?? "") || "") ?? "");
      const labels = classify(title, bodyText);

      const repoFullName = String(payload.repository?.full_name ?? "");

      if (repoFullName && GH_TOKEN) {
        const [owner, repo] = repoFullName.split("/");
        const issueNumber = Number(issue.number);

        if (owner && repo && issueNumber) {
          await callGitHubApi(
            labelsUrl(owner, repo, issueNumber),
            "POST",
            { labels }
          );

          await callGitHubApi(
            commentUrl(owner, repo, issueNumber),
            "POST",
            {
              body: `Labeled as: ${labels.join(", ")}`
            }
          );
        }
      }

      console.log("triaged", labels.join(","));
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
