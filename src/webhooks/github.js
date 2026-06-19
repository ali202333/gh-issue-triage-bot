import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleGitHubWebhook(event, payload) {
  if (event === "installation" && payload.action === "created") {
    const account = payload.installation.account;
    await prisma.organization.upsert({
      where: { githubOrgId: BigInt(account.id) },
      update: {
        name: account.login,
        avatarUrl: account.avatar_url,
        installationId: String(payload.installation.id),
      },
      create: {
        githubOrgId: BigInt(account.id),
        name: account.login,
        avatarUrl: account.avatar_url,
        installationId: String(payload.installation.id),
      },
    });
    return { ok: true };
  }

  if (event === "issues" && payload.action === "opened") {
    const { repository, issue } = payload;
    const repoSettings = await prisma.repository.findUnique({
      where: { githubRepoId: BigInt(repository.id) },
      include: { organization: true },
    });

    if (!repSettings || !repSettings.isHookActive) {
      return { ok: true, ignored: true };
    }

    // TODO: enqueue background triage job instead of running inline
    // For MVP we just log and return 202
    console.log(
      `[triage] queued issue #${issue.number} in ${repository.full_name}`
    );
    return { ok: true, queued: true };
  }

  return { ok: true, ignored: true };
}

export function verifySignature(rawBody, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from("sha256=" + hmac.update(rawBody).digest("hex"), "utf8");
  const checksum = Buffer.from(signature, "utf8");
  return crypto.timingSafeEqual(digest, checksum);
}
