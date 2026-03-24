import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Renders the per-tenant Helm values file from the Handlebars template
 * and writes it to edc/tx-edc-eleven/values-{tenantCode}.yaml.
 *
 * Template:  edc/tx-edc-eleven/values-template.yaml
 * Output:    edc/tx-edc-eleven/values-{tenantCode}.yaml
 */
export async function generateValuesFile(tenantCode: string, bpn: string): Promise<string> {
  const repoPath = process.env.GIT_REPO_PATH;
  if (!repoPath) throw new Error('GIT_REPO_PATH is not set');

  const templatePath = path.join(repoPath, 'edc', 'tx-edc-eleven', 'values-template.yaml');
  const outputPath = path.join(repoPath, 'edc', 'tx-edc-eleven', `values-${tenantCode}.yaml`);

  console.log(`[helm] Reading template from ${templatePath}`);
  const templateSource = fs.readFileSync(templatePath, 'utf-8');

  // Strip Handlebars comment blocks before compiling so YAML is valid after rendering
  const cleanedSource = templateSource.replace(/\{\{!--[\s\S]*?--\}\}/g, '').trimStart();

  const template = Handlebars.compile(cleanedSource, { noEscape: true });
  const tenantCodeUnderscore = tenantCode.replace(/-/g, '_');
  const rendered = template({ tenantCode, tenantCodeUnderscore, bpn });

  console.log(`[helm] Writing values file to ${outputPath}`);
  fs.writeFileSync(outputPath, rendered, 'utf-8');

  console.log(`[helm] Values file generated: values-${tenantCode}.yaml`);
  return outputPath;
}
