{{/*
Expand the name of the chart.
*/}}
{{- define "app-chart.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
*/}}
{{- define "app-chart.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "app-chart.labels" -}}
helm.sh/chart: {{ include "app-chart.name" . }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: jap-eu-hack-2026
app.kubernetes.io/env: {{ .Values.global.envPrefix | default "dev" }}
{{- end }}

{{/*
Selector labels for a component
*/}}
{{- define "app-chart.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .release }}
{{- end }}

{{/*
Image helper — supports per-chart registry override via global.imageRegistry.
Usage: {{ include "app-chart.image" (dict "global" .Values.global "image" .Values.backend.image) }}
*/}}
{{- define "app-chart.image" -}}
{{- if .image.registry -}}
{{ .image.registry }}/{{ .image.repository }}:{{ .image.tag }}
{{- else if .global.imageRegistry -}}
{{ .global.imageRegistry }}/{{ .image.repository }}:{{ .image.tag }}
{{- else -}}
{{ .image.repository }}:{{ .image.tag }}
{{- end -}}
{{- end }}

{{/*
Host helper — per-env <subdomain>.<envPrefix>.<domain>
Usage: {{ include "app-chart.host" (dict "subdomain" "api" "ctx" .) }}
*/}}
{{- define "app-chart.host" -}}
{{- $subdomain := .subdomain -}}
{{- $ctx := .ctx -}}
{{- printf "%s.%s.%s" $subdomain $ctx.Values.global.envPrefix $ctx.Values.global.domain -}}
{{- end -}}
