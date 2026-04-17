# TLS / Ingress

## 7. TLS / Ingress / Cert-Manager

- **HAProxy Ingress**: DaemonSet, hostNetwork, binds node `:80` + `:443`. IngressClass `haproxy`.
- **cert-manager**: two `ClusterIssuer`s per cluster — `letsencrypt-staging` + `letsencrypt-prod`. Both HTTP-01 with `solvers.http01.ingress.class: haproxy`. Use staging on dev first to avoid LE rate limits; switch to prod once issuance flow is verified.
- Every Ingress annotated `cert-manager.io/cluster-issuer: letsencrypt-prod` with `tls.hosts` per host. **One cert per hostname** (no wildcard — HTTP-01 cannot issue wildcards).
- **Renewal**: automatic at 30d remaining (cert-manager default). No operator action.
- **Hostname templating**: `_helpers.tpl` has `app-chart.ingressHost <subdomain>` which returns `<subdomain>.<global.envPrefix>.<global.domain>`.
- **DNS**: A records for every hostname → server IP (wildcard `*.<env>.dataspace.smartsenselabs.com` preferred; fall back to explicit per-host A records if registrar doesn't support wildcards).

## Debugging a cert

```bash
kubectl describe certificate <host>-tls -n <ns>
kubectl describe order -n <ns>
kubectl describe challenge -n <ns>
kubectl logs -n cert-manager deploy/cert-manager
```

## Switching from staging to prod issuer

Edit the Ingress annotation: `cert-manager.io/cluster-issuer: letsencrypt-prod`. Delete the existing Secret — cert-manager will re-request.

## Rate limits

LE prod: 50 certs/week per registered domain. HTTP-01 challenges: none per se, but failed challenges accumulate. Always test on LE staging first.
