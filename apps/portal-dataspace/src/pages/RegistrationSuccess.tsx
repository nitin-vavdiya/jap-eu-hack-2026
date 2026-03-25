import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getApiBase, getPortalCompanyUrl } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()
const POLL_INTERVAL_MS = 5000

interface EdcProvisioning {
  status: 'pending' | 'provisioning' | 'ready' | 'failed'
  lastError?: string
  managementUrl?: string
  protocolUrl?: string
  dataplaneUrl?: string
  apiKey?: string
  k8sNamespace?: string
  argoAppName?: string
  vaultPath?: string
  dbName?: string
  provisionedAt?: string
}

interface ComplianceResult {
  status: string
  complianceLevel?: string
  endpointSetUsed: string
  timestamp: string
  issuedCredential?: Record<string, unknown>
}

interface NotaryResult {
  status: string
  registrationId?: string
  endpointSetUsed: string
}

interface OrgCredProof {
  vcPayload?: Record<string, unknown>
  vcJwt?: string
  complianceResult?: ComplianceResult
  notaryResult?: NotaryResult
  issuedVCs?: unknown[]
  verificationAttempts?: { id: string; timestamp: string; endpointSetUsed: string; step: string; status: string; durationMs: number }[]
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="text-[10px] text-[#9AA0A6] hover:text-[#5F6368] transition-colors ml-2 shrink-0">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 border-b border-[#E5EAF0] last:border-0">
      <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-0.5">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-[#1F1F1F] break-all">{value}</p>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: EdcProvisioning['status'] }) {
  const styles: Record<string, string> = {
    pending:      'bg-[#F1F3F6] text-[#9AA0A6]',
    provisioning: 'bg-[#E8F0FE] text-[#4285F4]',
    ready:        'bg-[#E6F4EA] text-[#34A853]',
    failed:       'bg-[#FCE8E6] text-[#EA4335]',
  }
  const labels: Record<string, string> = {
    pending:      'Pending',
    provisioning: 'Provisioning...',
    ready:        'Ready',
    failed:       'Failed',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status === 'provisioning' && <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] animate-pulse" />}
      {status === 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />}
      {labels[status]}
    </span>
  )
}

function SectionIcon({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
      {children}
    </div>
  )
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.')
    if (parts.length === 3) return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch { /* ignore */ }
  return null
}

export default function RegistrationSuccess() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const [edc, setEdc] = useState<EdcProvisioning | null>(null)
  const [proof, setProof] = useState<OrgCredProof | null>(null)
  const [proofLoading, setProofLoading] = useState(true)

  // Fetch Gaia-X proof data via org-credential for this company
  useEffect(() => {
    if (!companyId) return
    const fetchProof = async () => {
      try {
        // Get org-credentials list and find the one for this company
        const listRes = await axios.get(`${API_BASE}/org-credentials`)
        const creds = listRes.data as { id: string; companyId: string }[]
        const match = creds.find(c => c.companyId === companyId)
        if (match) {
          const proofRes = await axios.get(`${API_BASE}/org-credentials/${match.id}/proof`)
          setProof(proofRes.data)
        }
      } catch { /* proof not available yet */ }
      setProofLoading(false)
    }
    fetchProof()
  }, [companyId])

  // Poll EDC status
  useEffect(() => {
    if (!companyId) return

    const poll = async () => {
      try {
        const r = await axios.get(`${API_BASE}/companies/${companyId}/edc-status`)
        setEdc(r.data)
      } catch {
        // not yet created — keep polling
      }
    }

    poll()
    const interval = setInterval(() => {
      poll().then(() => {
        if (edc?.status === 'ready' || edc?.status === 'failed') {
          clearInterval(interval)
        }
      })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [companyId, edc?.status])

  // Decode compliance JWT if available
  const complianceJwt = proof?.complianceResult?.issuedCredential?.jwt as string | undefined
  const decoded = complianceJwt ? decodeJwtPayload(complianceJwt) : null
  const cs = decoded?.credentialSubject as Record<string, unknown> | undefined
  const compliantCreds = cs?.['gx:compliantCredentials'] as { id: string; type: string }[] | undefined

  const complianceOk = proof?.complianceResult?.status === 'compliant'
  const notaryOk = proof?.notaryResult?.status === 'success'

  return (
    <div className="max-w-2xl mx-auto mt-12 px-6 pb-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-14 h-14 bg-[#E6F4EA] rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-[#34A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-2">Organization Registered</h1>
        <p className="text-sm text-[#9AA0A6]">Your OrgVC has been issued and is now verifiable on the EU APAC Dataspace.</p>
      </div>

      {/* Company ID */}
      <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-xl p-4 mb-6">
        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-1">Company ID</p>
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-[#5F6368]">{companyId}</p>
          <CopyButton value={companyId!} />
        </div>
      </div>

      {/* ── Section A: Gaia-X Compliance ── */}
      <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden mb-4">
        {/* Section header */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex items-center gap-3">
          <SectionIcon bg="bg-[#E8F0FE]">
            <svg className="w-4.5 h-4.5 text-[#4285F4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </SectionIcon>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#1F1F1F]">Gaia-X Compliance Verified</p>
            <p className="text-[11px] text-[#9AA0A6] mt-0.5">Verified in real time by GXDCH &middot; Gaia-X Trust Framework Loire</p>
          </div>
          {!proofLoading && complianceOk && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E6F4EA] text-[#34A853]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
              Compliant
            </span>
          )}
          {!proofLoading && !complianceOk && proof?.complianceResult && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FCE8E6] text-[#EA4335]">
              Failed
            </span>
          )}
          {(proofLoading || (!proof?.complianceResult && !proofLoading)) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FEF7E0] text-[#F59E0B]">
              {proofLoading ? 'Loading...' : 'Pending'}
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          {proofLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full animate-spin" />
              <span className="text-xs text-[#9AA0A6] ml-3">Loading compliance proof...</span>
            </div>
          ) : complianceOk ? (
            <div className="space-y-4">
              {/* Trust status banner */}
              <div className="bg-[#E6F4EA] border border-[#34A853]/20 rounded-lg p-3.5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#34A853] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F]">Trust proof available for this organization</p>
                  <p className="text-[11px] text-[#5F6368] mt-0.5">This credential has been validated against the Gaia-X Trust Framework Loire by the Gaia-X Digital Clearing House (GXDCH).</p>
                </div>
              </div>

              {/* Proof details grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                  <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider">Compliance Status</p>
                  <p className="text-xs font-medium text-[#34A853] mt-1">{proof.complianceResult!.status}</p>
                </div>
                {proof.complianceResult!.complianceLevel && (
                  <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                    <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider">Compliance Level</p>
                    <p className="text-xs font-medium text-[#1F1F1F] mt-1">{proof.complianceResult!.complianceLevel}</p>
                  </div>
                )}
                <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                  <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider">Endpoint Set</p>
                  <p className="text-xs font-mono text-[#1F1F1F] mt-1">{proof.complianceResult!.endpointSetUsed}</p>
                </div>
                <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                  <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider">Verified At</p>
                  <p className="text-xs text-[#1F1F1F] mt-1">{new Date(proof.complianceResult!.timestamp).toLocaleString()}</p>
                </div>
                {proof.notaryResult && (
                  <>
                    <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                      <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider">Notary Status</p>
                      <p className={`text-xs font-medium mt-1 ${notaryOk ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{proof.notaryResult.status}</p>
                    </div>
                    {proof.notaryResult.registrationId && (
                      <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider">Registration ID</p>
                        <p className="text-xs font-mono text-[#1F1F1F] mt-1 break-all">{proof.notaryResult.registrationId}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Gaia-X Label Credential details (from decoded JWT) */}
              {decoded && (
                <div className="space-y-3">
                  <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium">Gaia-X Label Credential</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { l: 'Issuer', v: decoded.issuer as string },
                      { l: 'Label Level', v: cs?.['gx:labelLevel'] as string },
                      { l: 'Rules Version', v: cs?.['gx:rulesVersion'] as string },
                      { l: 'Engine Version', v: cs?.['gx:engineVersion'] as string },
                      { l: 'Valid From', v: decoded.validFrom ? new Date(decoded.validFrom as string).toLocaleDateString() : undefined },
                      { l: 'Valid Until', v: decoded.validUntil ? new Date(decoded.validUntil as string).toLocaleDateString() : undefined },
                    ].filter(x => x.v).map((x, i) => (
                      <div key={i} className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                        <p className="text-[10px] text-[#9AA0A6] uppercase">{x.l}</p>
                        <p className="text-xs text-[#1F1F1F] mt-0.5 font-mono break-all">{x.v}</p>
                      </div>
                    ))}
                  </div>

                  {compliantCreds && compliantCreds.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-2">Compliant Credentials</p>
                      <div className="space-y-1.5">
                        {compliantCreds.map((cc, i) => (
                          <div key={i} className="flex items-center gap-2 bg-[#E6F4EA] border border-[#34A853]/20 rounded-lg px-3 py-2">
                            <span className="w-4 h-4 rounded-full bg-[#34A853] text-white flex items-center justify-center text-[9px]">&#10003;</span>
                            <span className="text-xs font-medium text-[#1F1F1F]">{cc.type}</span>
                            <span className="text-[10px] text-[#9AA0A6] font-mono truncate flex-1">{cc.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Trust Framework reference */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#E5EAF0]">
                <svg className="w-3.5 h-3.5 text-[#9AA0A6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-[10px] text-[#9AA0A6]">Compliant with the latest Gaia-X Trust Framework Loire &middot; Verification performed by GXDCH endpoints</p>
              </div>
            </div>
          ) : proof?.complianceResult ? (
            /* Compliance failed */
            <div className="bg-[#FCE8E6] border border-[#EA4335]/20 rounded-lg p-3.5">
              <p className="text-sm font-medium text-[#EA4335]">Compliance verification failed</p>
              <p className="text-xs text-[#5F6368] mt-1">Status: {proof.complianceResult.status} &middot; Endpoint: {proof.complianceResult.endpointSetUsed}</p>
            </div>
          ) : (
            /* No proof yet */
            <div className="text-center py-6">
              <p className="text-xs text-[#9AA0A6]">Gaia-X compliance verification is in progress or has not started yet.</p>
              <p className="text-[11px] text-[#9AA0A6] mt-1">Proof details will appear here once verification completes.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section B: Automated EDC Deployment ── */}
      <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden mb-8">
        {/* Section header */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex items-center gap-3">
          <SectionIcon bg="bg-[#FEF7E0]">
            <svg className="w-4.5 h-4.5 text-[#F59E0B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </SectionIcon>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#1F1F1F]">
              {edc?.status === 'ready' ? 'Automated EDC Deployment Complete' : 'Automated EDC Deployment'}
            </p>
            <p className="text-[11px] text-[#9AA0A6] mt-0.5">Eclipse Dataspace Connector &middot; Dedicated tenant instance</p>
          </div>
          {edc ? <StatusBadge status={edc.status} /> : <StatusBadge status="pending" />}
        </div>

        <div className="px-5 py-4">
          {/* Pending / Provisioning */}
          {(!edc || edc.status === 'pending' || edc.status === 'provisioning') && (
            <div className="text-center py-6">
              <div className="w-8 h-8 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#5F6368]">Setting up your dedicated EDC instance...</p>
              <p className="text-[11px] text-[#9AA0A6] mt-1">This may take 2-5 minutes. You can leave this page — it will be ready in the background.</p>
            </div>
          )}

          {/* Failed */}
          {edc?.status === 'failed' && (
            <div className="bg-[#FCE8E6] border border-[#EA4335]/20 rounded-lg p-3.5">
              <p className="text-xs font-medium text-[#EA4335] mb-1">Provisioning failed</p>
              <p className="text-xs text-[#5F6368]">{edc.lastError || 'An unexpected error occurred.'}</p>
            </div>
          )}

          {/* Ready — show all EDC config */}
          {edc?.status === 'ready' && (
            <div className="space-y-0">
              {edc.protocolUrl    && <ConfigRow label="DSP Protocol URL"    value={edc.protocolUrl} />}
              {edc.managementUrl  && <ConfigRow label="Management API URL"  value={edc.managementUrl} />}
              {edc.dataplaneUrl   && <ConfigRow label="Dataplane URL"       value={edc.dataplaneUrl} />}
              {edc.apiKey         && <ConfigRow label="API Key"             value={edc.apiKey} />}
              {edc.k8sNamespace   && <ConfigRow label="Kubernetes Namespace" value={edc.k8sNamespace} />}
              {edc.argoAppName    && <ConfigRow label="ArgoCD Application"  value={edc.argoAppName} />}
              {edc.dbName         && <ConfigRow label="Database Name"       value={edc.dbName} />}
              {edc.provisionedAt  && (
                <ConfigRow label="Provisioned At" value={new Date(edc.provisionedAt).toLocaleString()} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/')}
          className="flex-1 border border-[#E5EAF0] text-[#5F6368] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F8FAFD] transition-colors"
        >
          Register Another
        </button>
        <a
          href={getPortalCompanyUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-[#1F1F1F] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#333] text-center transition-colors"
        >
          Company Portal
        </a>
      </div>
    </div>
  )
}
