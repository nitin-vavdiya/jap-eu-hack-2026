import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import axios from 'axios';

/**
 * Renders the per-tenant Argo CD Application manifest and commits + pushes it to git.
 * The new file in gitops/applications/ triggers Argo CD auto-sync (default poll: ~3 min).
 * Optionally calls Argo CD API for an immediate sync if ARGOCD_AUTH_TOKEN is set.
 */
export async function commitArgoApp(tenantCode: string, bpn: string): Promise<void> {
  const repoPath = process.env.GIT_REPO_PATH;
  const gitRemoteUrl = process.env.GIT_REMOTE_URL;
  const gitAuthToken = process.env.GIT_AUTH_TOKEN;
  const gitRepoUrl = process.env.GIT_REPO_URL;
  const gitUserName = process.env.GIT_USER_NAME || 'edc-provisioning-bot';
  const gitUserEmail = process.env.GIT_USER_EMAIL || 'edc-provisioning@the-sense.io';

  if (!repoPath) throw new Error('GIT_REPO_PATH is not set');
  if (!gitRemoteUrl) throw new Error('GIT_REMOTE_URL is not set');
  if (!gitAuthToken) throw new Error('GIT_AUTH_TOKEN is not set');
  if (!gitRepoUrl) throw new Error('GIT_REPO_URL is not set');

  // Render Argo Application manifest
  const templatePath = path.join(repoPath, 'gitops', 'applications', 'template.yaml.hbs');
  const outputPath = path.join(repoPath, 'gitops', 'applications', `${tenantCode}-edc.yaml`);
  const valuesOutputPath = path.join(repoPath, 'edc', 'tx-edc-eleven', `values-${tenantCode}.yaml`);

  console.log(`[argo] Rendering Argo Application manifest for tenant "${tenantCode}"`);
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  const cleanedSource = templateSource.replace(/\{\{!--[\s\S]*?--\}\}/g, '').trimStart();
  const template = Handlebars.compile(cleanedSource, { noEscape: true });
  const rendered = template({ tenantCode, bpn, gitRepoUrl });

  fs.writeFileSync(outputPath, rendered, 'utf-8');
  console.log(`[argo] Argo Application manifest written: ${tenantCode}-edc.yaml`);

  // Inject token into remote URL for push auth
  const authenticatedRemote = gitRemoteUrl.replace(
    'https://',
    `https://${gitAuthToken}@`,
  );

  const git: SimpleGit = simpleGit(repoPath);
  await git.addConfig('user.name', gitUserName);
  await git.addConfig('user.email', gitUserEmail);

  // Pull latest changes before staging to avoid push rejection
  console.log(`[argo] Pulling latest changes from remote`);
  await git.pull(authenticatedRemote, 'HEAD', ['--rebase']);

  // Stage both the Helm values file and the Argo Application manifest
  const filesToStage = [
    path.relative(repoPath, valuesOutputPath),
    path.relative(repoPath, outputPath),
  ];

  console.log(`[argo] Staging files: ${filesToStage.join(', ')}`);
  await git.add(filesToStage);

  // Check if there is anything to commit (idempotent — skip if files unchanged)
  const status = await git.status();
  if (status.staged.length === 0) {
    console.log(`[argo] No changes to commit for tenant "${tenantCode}" — already up to date`);
  } else {
    const commitMessage = `chore: onboard EDC tenant ${tenantCode} (${bpn})`;
    console.log(`[argo] Committing: "${commitMessage}"`);
    await git.commit(commitMessage);

    console.log(`[argo] Pushing to remote`);
    await git.push(authenticatedRemote, 'HEAD');
    console.log(`[argo] Push complete — Argo CD will auto-sync within ~3 minutes`);
  }

  // Optional: trigger immediate Argo CD sync
  await triggerArgoSync(tenantCode);
}

async function triggerArgoSync(tenantCode: string): Promise<void> {
  const argoServerUrl = process.env.ARGOCD_SERVER_URL;
  const argoAuthToken = process.env.ARGOCD_AUTH_TOKEN;
  const appName = `edc-${tenantCode}`;

  if (!argoServerUrl || !argoAuthToken) {
    console.log(
      `[argo] ARGOCD_AUTH_TOKEN not set — skipping immediate sync for ${appName} (Argo CD will auto-sync)`,
    );
    return;
  }

  try {
    console.log(`[argo] Triggering immediate Argo CD sync for application "${appName}"`);
    await axios.post(
      `${argoServerUrl}/api/v1/applications/${appName}/sync`,
      {},
      {
        headers: { Authorization: `Bearer ${argoAuthToken}` },
        timeout: 15000,
      },
    );
    console.log(`[argo] Argo CD sync triggered for "${appName}"`);
  } catch (err: any) {
    // Non-fatal — auto-sync will catch it within ~3 minutes
    console.warn(
      `[argo] Argo CD sync trigger failed for "${appName}" (non-fatal): ${err.message}`,
    );
  }
}
