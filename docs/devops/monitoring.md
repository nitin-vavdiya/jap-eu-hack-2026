# Monitoring

## 9. Monitoring Stack

- **Prometheus** (kube-prometheus-stack chart): Alertmanager OFF, operator ON for `ServiceMonitor` CRDs only. Scrapes kube-state-metrics, node-exporter, haproxy-ingress, vault telemetry.
- **Grafana**: Ingress `grafana.<env>.dataspace...`, persistence 2Gi local-path, admin password from Vault (`secret/grafana/admin`).
- **Loki** single-binary mode, filesystem storage, 10Gi local-path PVC, 7d retention.
- **Promtail** DaemonSet scrapes all pod logs.
- **Dashboards** provisioned via ConfigMap: `kubernetes-cluster`, `postgres` (needs `postgres_exporter` sidecar), `vault`, `haproxy-ingress`.
- **Backend metrics**: `ServiceMonitor` added if/when backend exposes `/metrics`; skipped otherwise (app code change out of scope).

## Access

- URL: `https://grafana.<env>.dataspace.smartsenselabs.com`
- User: `admin`
- Password: from Vault → `secret/grafana/admin`, key `password`.

## Pre-provisioned dashboards

- Kubernetes Cluster Overview (kube-prometheus-stack default)
- Loki Logs (via Grafana datasource `Loki`, pre-configured)

## Add a custom dashboard

Create a ConfigMap with `grafana_dashboard: "1"` label in the monitoring namespace. The grafana operator auto-imports.
