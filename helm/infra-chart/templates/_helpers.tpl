{{/*
Build per-env fully-qualified hostname: <subdomain>.<envPrefix>.<domain>
Usage: {{ include "infra-chart.host" (dict "subdomain" "argocd" "ctx" .) }}
*/}}
{{- define "infra-chart.host" -}}
{{- $subdomain := .subdomain -}}
{{- $ctx := .ctx -}}
{{- printf "%s.%s.%s" $subdomain $ctx.Values.global.envPrefix $ctx.Values.global.domain -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "infra-chart.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: jap-eu-hack-2026
app.kubernetes.io/env: {{ .Values.global.envPrefix }}
{{- end -}}
