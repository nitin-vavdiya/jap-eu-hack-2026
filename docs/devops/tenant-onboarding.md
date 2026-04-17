# Adding a new EDC tenant

1. Create tenant values file: `edc/tx-edc-eleven/values-<slug>.yaml`. Copy from `values-template.yaml`, set `participant.id`, `iatp.id`, hostnames, DID.
2. Create Argo Application: `gitops/envs/<env>/tenants/<slug>-edc.yaml`. Copy from `bmw-edc.yaml`, change `name`, `values-<slug>.yaml` reference, and `destination.namespace: edc-<slug>-<env>`.
3. Commit + push. Argo sync picks it up on next reconcile.
4. The provisioning service performs steps 1-3 automatically via its git write-back — this doc is for manual additions.

## Where tenant Applications live

There are two locations to be aware of — they serve different purposes, and both are current:

- `gitops/applications/` — **automated** path. The provisioning service writes new tenant Applications here via its git write-back flow. The Handlebars template it renders from is `gitops/applications/template.yaml.hbs`.
- `gitops/envs/<env>/tenants/` — **manual** path. Use this folder when you are hand-adding a tenant per the steps above (operator onboarding, one-off testing, or recovering from a provisioning-service failure).

Both paths are tracked by the same app-of-apps sweep, so Argo CD will reconcile Applications from either location. Keep a given tenant in exactly one of the two — do not duplicate.

## Removing a tenant

1. Delete the Application: `kubectl -n argocd delete application edc-<slug>-<env>`.
2. Delete the two files from git and push.
3. Argo prune will reconcile. Verify `kubectl get ns edc-<slug>-<env>` shows Terminating.
