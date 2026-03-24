import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API = getApiBase()

interface OrgCred {
  id: string; companyId: string; legalName: string; verificationStatus: string
  legalRegistrationNumber: Record<string, string | undefined>
  legalAddress: { streetAddress: string; locality: string; postalCode: string; countryCode: string; countrySubdivisionCode: string }
  headquartersAddress: { streetAddress: string; locality: string; postalCode: string; countryCode: string; countrySubdivisionCode: string }
  website?: string; contactEmail: string; did?: string; validFrom: string; validUntil: string
  vcPayload?: Record<string, unknown>
  complianceResult?: { status: string; complianceLevel?: string; endpointSetUsed: string; timestamp: string; issuedCredential?: Record<string, unknown> }
  notaryResult?: { status: string; registrationId?: string; endpointSetUsed: string; proof?: Record<string, unknown> }
  verificationAttempts: { id: string; timestamp: string; endpointSetUsed: string; step: string; status: string; durationMs: number; error?: string }[]
  createdAt: string; updatedAt: string
}

interface EdcProv {
  status: string; attempts: number; lastError?: string
  managementUrl?: string; protocolUrl?: string; dataplaneUrl?: string
  helmRelease?: string; k8sNamespace?: string; provisionedAt?: string
}

type JourneyStepStatus = 'done' | 'failed' | 'running' | 'pending'

function JourneyIcon({ status }: { status: JourneyStepStatus }) {
  if (status === 'done') return (
    <div className="w-7 h-7 rounded-full bg-[#34A853] flex items-center justify-center flex-shrink-0">
      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
    </div>
  )
  if (status === 'failed') return (
    <div className="w-7 h-7 rounded-full bg-[#EA4335] flex items-center justify-center flex-shrink-0">
      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </div>
  )
  if (status === 'running') return (
    <div className="w-7 h-7 rounded-full bg-[#4285F4] flex items-center justify-center flex-shrink-0 animate-pulse">
      <div className="w-2.5 h-2.5 rounded-full bg-white" />
    </div>
  )
  return <div className="w-7 h-7 rounded-full bg-[#E5EAF0] flex-shrink-0 border-2 border-[#D0D5DD]" />
}

const sts: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-[#F1F3F6]', text: 'text-[#5F6368]' },
  verifying: { label: 'Verifying...', bg: 'bg-[#FEF7E0]', text: 'text-[#F59E0B]' },
  verified: { label: 'Verified (No Proof)', bg: 'bg-[#FEF7E0]', text: 'text-[#F59E0B]' },
  compliant: { label: 'Gaia-X Compliant', bg: 'bg-[#E6F4EA]', text: 'text-[#34A853]' },
  failed: { label: 'Verification Failed', bg: 'bg-[#FCE8E6]', text: 'text-[#EA4335]' },
}

/** Hard check: "Gaia-X Compliant" only with actual compliance proof */
function getEffectiveStatus(cred: OrgCred): string {
  if (cred.verificationStatus === 'verified' && cred.complianceResult?.status === 'compliant' && cred.complianceResult?.issuedCredential) {
    return 'compliant'
  }
  return cred.verificationStatus
}

export default function OrgCredentialDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [cred, setCred] = useState<OrgCred | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [tab, setTab] = useState<'overview' | 'proof' | 'raw' | 'audit' | 'journey'>('overview')
  const [steps, setSteps] = useState<{ name: string; status: string }[]>([])
  const [edcProv, setEdcProv] = useState<EdcProv | null>(null)

  const fetch = useCallback(() => {
    api.get(`${API}/org-credentials/${id}`).then(r => { setCred(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (tab === 'journey' && cred?.companyId) {
      api.get(`${API}/companies/${cred.companyId}/edc-status`)
        .then(r => setEdcProv(r.data))
        .catch(() => setEdcProv(null))
    }
  }, [tab, cred?.companyId])

  const handleVerify = async () => {
    setVerifying(true)
    setSteps([{ name: 'Preparing VC', status: 'in-progress' }, { name: 'Contacting Notary', status: 'pending' }, { name: 'Registry', status: 'pending' }, { name: 'Compliance', status: 'pending' }, { name: 'Done', status: 'pending' }])
    const timings = [800, 1500, 2000, 2800]
    timings.forEach((ms, i) => setTimeout(() => setSteps(p => p.map((s, j) => ({ ...s, status: j < i + 1 ? 'completed' : j === i + 1 ? 'in-progress' : 'pending' }))), ms))
    try {
      const res = await api.post(`${API}/org-credentials/${id}/verify`)
      setCred(res.data)
      setSteps(p => p.map(s => ({ ...s, status: 'completed' })))
    } catch { fetch() }
    setVerifying(false)
  }

  if (loading || !cred) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full animate-spin" /></div>

  const st = sts[getEffectiveStatus(cred)] || sts.draft
  const ids = Object.entries(cred.legalRegistrationNumber || {}).filter(([, v]) => v)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <button onClick={() => navigate('/')} className="text-xs text-[#4285F4] hover:text-[#3367D6] mb-6">&larr; Back</button>

      <div className="bg-white border border-[#E5EAF0] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-[#1F1F1F]">{cred.legalName}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.label}</span>
            </div>
            <p className="text-xs text-[#9AA0A6] font-mono">{cred.id}</p>
            <p className="text-xs text-[#5F6368] mt-2">{cred.legalAddress.locality}, {cred.legalAddress.countryCode} &middot; {cred.contactEmail}</p>
          </div>
          {(cred.verificationStatus === 'draft' || cred.verificationStatus === 'failed') && (
            <button onClick={handleVerify} disabled={verifying} className="bg-[#4285F4] hover:bg-[#3367D6] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm">
              {verifying ? 'Verifying...' : cred.verificationStatus === 'failed' ? 'Retry Verification' : 'Verify with Gaia-X'}
            </button>
          )}
        </div>

        {steps.length > 0 && (
          <div className="mt-6 pt-6 border-t border-[#E5EAF0]">
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-4">Verification Progress</p>
            <div className="flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium ${s.status === 'completed' ? 'bg-[#34A853] text-white' : s.status === 'in-progress' ? 'bg-[#4285F4] text-white animate-pulse' : s.status === 'failed' ? 'bg-[#EA4335] text-white' : 'bg-[#F1F3F6] text-[#9AA0A6]'}`}>
                    {s.status === 'completed' ? '✓' : s.status === 'failed' ? '✕' : i + 1}
                  </div>
                  <span className={`text-[10px] whitespace-nowrap ${s.status === 'completed' ? 'text-[#34A853]' : s.status === 'in-progress' ? 'text-[#4285F4]' : s.status === 'failed' ? 'text-[#EA4335]' : 'text-[#9AA0A6]'}`}>{s.name}</span>
                  {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${s.status === 'completed' ? 'bg-[#34A853]' : 'bg-[#E5EAF0]'}`} />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-6 bg-white border border-[#E5EAF0] rounded-xl p-1">
        {(['overview', 'proof', 'raw', 'audit', 'journey'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors capitalize ${tab === t ? 'bg-[#4285F4] text-white' : 'text-[#5F6368] hover:bg-[#F1F3F6]'}`}>
            {t === 'raw' ? 'Raw JSON' : t === 'audit' ? 'Audit Log' : t === 'proof' ? 'Proof & Compliance' : t === 'journey' ? 'Onboarding Journey' : t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E5EAF0] rounded-xl p-6">
        {tab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-3">Registration Identifiers</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ids.map(([k, v]) => <div key={k} className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3"><p className="text-[10px] text-[#9AA0A6] uppercase">{k}</p><p className="text-sm font-mono text-[#1F1F1F] mt-0.5">{v}</p></div>)}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[{ title: 'Legal Address', addr: cred.legalAddress }, { title: 'HQ Address', addr: cred.headquartersAddress }].map((a, i) => (
                <div key={i}><h3 className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-3">{a.title}</h3><div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4"><p className="text-sm text-[#1F1F1F]">{a.addr.streetAddress}</p><p className="text-sm text-[#5F6368]">{a.addr.locality}, {a.addr.postalCode}</p><p className="text-sm text-[#5F6368]">{a.addr.countryCode}</p></div></div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[{ l: 'Valid From', v: new Date(cred.validFrom).toLocaleDateString() }, { l: 'Valid Until', v: new Date(cred.validUntil).toLocaleDateString() }, { l: 'Contact', v: cred.contactEmail }, { l: 'DID', v: cred.did || 'Auto-generated' }].map((x, i) => (
                <div key={i} className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3"><p className="text-[10px] text-[#9AA0A6] uppercase">{x.l}</p><p className="text-xs text-[#1F1F1F] mt-0.5 break-all">{x.v}</p></div>
              ))}
            </div>
          </div>
        )}

        {tab === 'proof' && (
          <div className="space-y-6">
            {cred.complianceResult ? (
              <div className={`p-4 rounded-lg border-l-4 ${cred.complianceResult.status === 'compliant' ? 'bg-[#E6F4EA] border-[#34A853]' : 'bg-[#FCE8E6] border-[#EA4335]'}`}>
                <p className={`text-sm font-semibold ${cred.complianceResult.status === 'compliant' ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{cred.complianceResult.status === 'compliant' ? 'Gaia-X Compliance Verified' : 'Failed'}</p>
                {cred.complianceResult.complianceLevel && <p className="text-xs text-[#5F6368] mt-1">Level: {cred.complianceResult.complianceLevel}</p>}
                <p className="text-xs text-[#9AA0A6] mt-1">Endpoint: {cred.complianceResult.endpointSetUsed}</p>
              </div>
            ) : <p className="text-sm text-[#9AA0A6] text-center py-8">No proof available. Run verification first.</p>}
            {cred.complianceResult?.issuedCredential && (() => {
              const ic = cred.complianceResult.issuedCredential as Record<string, unknown>
              const jwtStr = ic.jwt as string | undefined
              let decoded: Record<string, unknown> | null = null
              if (jwtStr) {
                try {
                  const parts = jwtStr.split('.')
                  if (parts.length === 3) decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
                } catch { /* ignore */ }
              }
              const cs = decoded?.credentialSubject as Record<string, unknown> | undefined
              const compliantCreds = cs?.['gx:compliantCredentials'] as { id: string; type: string }[] | undefined
              const criteria = cs?.['gx:validatedCriteria'] as string[] | undefined
              return (
                <div className="space-y-4">
                  <h3 className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium">Gaia-X Label Credential</h3>
                  {decoded ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { l: 'Issuer', v: decoded.issuer as string },
                          { l: 'Label Level', v: cs?.['gx:labelLevel'] as string },
                          { l: 'Rules Version', v: cs?.['gx:rulesVersion'] as string },
                          { l: 'Engine Version', v: cs?.['gx:engineVersion'] as string },
                          { l: 'Valid From', v: decoded.validFrom ? new Date(decoded.validFrom as string).toLocaleDateString() : '-' },
                          { l: 'Valid Until', v: decoded.validUntil ? new Date(decoded.validUntil as string).toLocaleDateString() : '-' },
                        ].map((x, i) => (
                          <div key={i} className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                            <p className="text-[10px] text-[#9AA0A6] uppercase">{x.l}</p>
                            <p className="text-xs text-[#1F1F1F] mt-0.5 break-all font-mono">{x.v || '-'}</p>
                          </div>
                        ))}
                      </div>
                      {compliantCreds && compliantCreds.length > 0 && (
                        <div>
                          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-2">Compliant Credentials</p>
                          <div className="space-y-2">
                            {compliantCreds.map((cc, i) => (
                              <div key={i} className="flex items-center gap-2 bg-[#E6F4EA] border border-[#34A853]/20 rounded-lg p-3">
                                <span className="w-5 h-5 rounded-full bg-[#34A853] text-white flex items-center justify-center text-[10px]">✓</span>
                                <span className="text-xs font-medium text-[#1F1F1F]">{cc.type}</span>
                                <span className="text-[10px] text-[#9AA0A6] font-mono truncate flex-1">{cc.id}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {criteria && criteria.length > 0 && (
                        <div>
                          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-2">Validated Criteria</p>
                          <div className="space-y-1">
                            {criteria.map((c, i) => (
                              <a key={i} href={c} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#4285F4] hover:text-[#3367D6] font-mono bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3 hover:bg-[#EEF2FF] transition-colors">{c}</a>
                            ))}
                          </div>
                        </div>
                      )}
                      <details className="group">
                        <summary className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium cursor-pointer hover:text-[#5F6368]">Raw JWT Payload</summary>
                        <pre className="mt-2 bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4 text-xs text-[#5F6368] overflow-auto max-h-64 font-mono">{JSON.stringify(decoded, null, 2)}</pre>
                      </details>
                    </>
                  ) : (
                    <pre className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4 text-xs text-[#5F6368] overflow-auto max-h-64 font-mono">{JSON.stringify(ic, null, 2)}</pre>
                  )}
                </div>
              )
            })()}
            {cred.notaryResult && (
              <div><h3 className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-2">Notary Result</h3><div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4"><span className={`w-2 h-2 rounded-full inline-block mr-2 ${cred.notaryResult.status === 'success' ? 'bg-[#34A853]' : 'bg-[#EA4335]'}`} /><span className="text-xs font-medium text-[#1F1F1F]">{cred.notaryResult.status}</span>{cred.notaryResult.registrationId && <span className="text-[10px] font-mono text-[#9AA0A6] ml-2">ID: {cred.notaryResult.registrationId}</span>}</div></div>
            )}
          </div>
        )}

        {tab === 'raw' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium">VC Payload (JSON-LD)</h3>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(cred.vcPayload, null, 2))} className="text-xs text-[#4285F4] font-medium">Copy</button>
            </div>
            <pre className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4 text-xs text-[#5F6368] overflow-auto max-h-[500px] font-mono leading-relaxed">{JSON.stringify(cred.vcPayload || {}, null, 2)}</pre>
          </div>
        )}

        {tab === 'journey' && (() => {
          const complianceOk = cred.complianceResult?.status === 'compliant'
          const notaryOk = cred.notaryResult?.status === 'success'
          const gaiaxDone = cred.verificationStatus === 'verified' || cred.verificationStatus === 'compliant'
          const gaiaxFailed = cred.verificationStatus === 'failed'
          const gaiaxRunning = cred.verificationStatus === 'verifying'

          const gaiaxStatus: JourneyStepStatus = complianceOk ? 'done' : gaiaxFailed ? 'failed' : gaiaxRunning ? 'running' : gaiaxDone && notaryOk ? 'failed' : 'pending'
          const gaiaxDetail = complianceOk
            ? 'Compliant with Gaia-X Loire trust framework'
            : notaryOk && !complianceOk
              ? 'Notary verified · Compliance check failed'
              : gaiaxFailed ? 'Verification failed'
              : gaiaxRunning ? 'Verifying…' : 'Not started'

          const edcBlocked = gaiaxStatus === 'failed'
          const edcStatus: JourneyStepStatus = edcBlocked
            ? 'failed'
            : !edcProv ? 'pending'
            : edcProv.status === 'ready' ? 'done'
            : edcProv.status === 'failed' ? 'failed'
            : edcProv.status === 'pending' || edcProv.status === 'provisioning' ? 'running'
            : 'pending'
          const edcDetail = edcBlocked
            ? 'Skipped — Gaia-X compliance required'
            : !edcProv ? 'No provisioning record'
            : edcProv.status === 'ready' ? 'EDC connector is live and ready'
            : edcProv.status === 'failed' ? (edcProv.lastError || 'Provisioning failed')
            : `Status: ${edcProv.status}…`

          const journeySteps = [
            { label: 'Organization registered',        detail: cred.legalName,   status: 'done' as JourneyStepStatus, error: null },
            { label: 'Verifiable Credential issued',   detail: 'OrgVC signed',   status: 'done' as JourneyStepStatus, error: null },
            { label: 'Gaia-X compliance verification', detail: gaiaxDetail,       status: gaiaxStatus,                  error: (!complianceOk && (gaiaxDone || gaiaxFailed)) ? { compliance: cred.complianceResult, notary: cred.notaryResult } : null },
            { label: 'EDC connector provisioning',     detail: edcDetail,         status: edcStatus,                    error: null },
          ]

          return (
            <div className="space-y-0">
              {journeySteps.map((step, i) => (
                <div key={i}>
                  <div className="flex items-start gap-4 py-4">
                    <JourneyIcon status={step.status} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${step.status === 'failed' ? 'text-[#EA4335]' : step.status === 'done' ? 'text-[#1F1F1F]' : step.status === 'running' ? 'text-[#4285F4]' : 'text-[#9AA0A6]'}`}>
                        {step.label}
                      </p>
                      <p className="text-xs text-[#9AA0A6] mt-0.5">{step.detail}</p>
                      {step.error && (
                        <div className="mt-2 border-l-2 border-[#EA4335] pl-3 space-y-1">
                          {step.error.compliance && (
                            <p className="text-xs text-[#EA4335]">
                              Compliance: <span className="font-medium">{step.error.compliance.status}</span>
                              {step.error.compliance.endpointSetUsed && <span className="text-[#9AA0A6] ml-1">· {step.error.compliance.endpointSetUsed}</span>}
                            </p>
                          )}
                          {step.error.notary && (
                            <p className="text-xs text-[#5F6368]">
                              Notary: <span className={`font-medium ${step.error.notary.status === 'success' ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{step.error.notary.status}</span>
                              {step.error.notary.registrationId && <span className="text-[#9AA0A6] ml-1">· ID: {step.error.notary.registrationId}</span>}
                            </p>
                          )}
                        </div>
                      )}
                      {step.status === 'done' && i === 3 && edcProv?.provisionedAt && (
                        <p className="text-[10px] text-[#9AA0A6] mt-1">Provisioned {new Date(edcProv.provisionedAt).toLocaleString()}</p>
                      )}
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      step.status === 'done'    ? 'bg-[#E6F4EA] text-[#34A853]' :
                      step.status === 'failed' ? 'bg-[#FCE8E6] text-[#EA4335]' :
                      step.status === 'running'? 'bg-[#E8F0FE] text-[#4285F4]' :
                      'bg-[#F1F3F4] text-[#9AA0A6]'
                    }`}>
                      {step.status === 'done' ? 'Done' : step.status === 'failed' ? 'Failed' : step.status === 'running' ? 'Running' : 'Waiting'}
                    </span>
                  </div>
                  {i < journeySteps.length - 1 && <div className="ml-3.5 w-px h-3 bg-[#E5EAF0]" />}
                </div>
              ))}
              {edcProv && edcProv.status === 'ready' && (
                <div className="mt-6 pt-4 border-t border-[#E5EAF0]">
                  <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-3">EDC Connector Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { l: 'Management URL', v: edcProv.managementUrl },
                      { l: 'Protocol URL',   v: edcProv.protocolUrl },
                      { l: 'Dataplane URL',  v: edcProv.dataplaneUrl },
                      { l: 'Helm Release',   v: edcProv.helmRelease },
                      { l: 'K8s Namespace',  v: edcProv.k8sNamespace },
                    ].filter(x => x.v).map((x, i) => (
                      <div key={i} className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
                        <p className="text-[10px] text-[#9AA0A6] uppercase">{x.l}</p>
                        <p className="text-xs text-[#1F1F1F] mt-0.5 font-mono break-all">{x.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {tab === 'audit' && (
          <div>
            <h3 className="text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium mb-4">Verification Audit Trail</h3>
            {cred.verificationAttempts.length === 0 ? <p className="text-sm text-[#9AA0A6] text-center py-8">No attempts yet</p> : (
              <div className="space-y-3">
                {[...cred.verificationAttempts].reverse().map((a, i) => (
                  <div key={a.id || i} className="flex items-start gap-3 p-4 bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${a.status === 'success' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#FCE8E6] text-[#EA4335]'}`}>{a.status === 'success' ? '✓' : '✕'}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#1F1F1F] capitalize">{a.step}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.status === 'success' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#FCE8E6] text-[#EA4335]'}`}>{a.status}</span>
                      </div>
                      <p className="text-[10px] text-[#9AA0A6] mt-1">{new Date(a.timestamp).toLocaleString()} &middot; {a.endpointSetUsed} &middot; {a.durationMs}ms</p>
                      {a.error && <p className="text-[11px] text-[#EA4335] mt-1 bg-[#FCE8E6] px-2 py-1 rounded">{a.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
