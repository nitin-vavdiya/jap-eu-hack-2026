import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()
// VC endpoints live at /vc/:id (no /api prefix)
const VC_BASE = API_BASE.replace(/\/api$/, '')

interface OrgCredential {
  id: string
  verificationStatus?: string
  notaryResult?: Record<string, unknown>
  complianceResult?: Record<string, unknown>
  credentialSubject?: Record<string, unknown>
}

interface Credential {
  id: string
  type: string
  status: string
  issuerName?: string
  issuedAt?: string
  credentialSubject?: Record<string, unknown>
}

interface Company {
  id: string
  name: string
  did?: string
  vatId?: string
  eoriNumber?: string
  cin?: string
  gstNumber?: string
  country: string
  city?: string
  address?: string
  adminName?: string
  adminEmail?: string
  createdAt?: string
  credentials?: Credential[]
  orgCredentials?: OrgCredential[]
}

interface DidVerificationMethod {
  id: string
  type: string
  controller: string
  publicKeyJwk?: Record<string, unknown>
}

interface DidService {
  id: string
  type: string
  serviceEndpoint: string
  description?: string
}

interface DidDocument {
  '@context': string[]
  id: string
  verificationMethod?: DidVerificationMethod[]
  authentication?: string[]
  assertionMethod?: string[]
  service?: DidService[]
}

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

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 text-[10px] font-medium text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded px-1.5 py-0.5 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function UrlRow({ label, url, icon }: { label: string; url: string; icon?: string }) {
  return (
    <div className="group py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-[11px]">{icon}</span>}
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline break-all flex-1 min-w-0"
        >
          {url}
        </a>
        <CopyButton value={url} />
      </div>
    </div>
  )
}

function EdcStatusBadge({ status }: { status: EdcProvisioning['status'] }) {
  const styles: Record<string, string> = {
    pending:      'bg-gray-100 text-gray-500',
    provisioning: 'bg-blue-50 text-blue-600',
    ready:        'bg-green-50 text-green-600',
    failed:       'bg-red-50 text-red-600',
  }
  const labels: Record<string, string> = {
    pending:      'Pending',
    provisioning: 'Provisioning…',
    ready:        'Ready',
    failed:       'Failed',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status === 'provisioning' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
      {status === 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
      {labels[status]}
    </span>
  )
}

type Tab = 'overview' | 'certificates' | 'edc' | 'did'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',      label: 'Overview' },
  { id: 'certificates',  label: 'Certificates' },
  { id: 'edc',           label: 'EDC Infrastructure' },
  { id: 'did',           label: 'DID Document' },
]

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [edc, setEdc] = useState<EdcProvisioning | null>(null)
  const [didDoc, setDidDoc] = useState<DidDocument | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  useEffect(() => {
    // Use authenticated API instance — GET /companies is now protected
    api.get(`${API_BASE}/companies/${id}`).then(r => {
      setCompany(r.data.company || r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    api.get(`${API_BASE}/companies/${id}/edc-status`)
      .then(r => setEdc(r.data))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    if (!id) return
    // DID document endpoint is intentionally public — no auth header needed
    axios.get(`${VC_BASE}/company/${id}/did.json`)
      .then(r => setDidDoc(r.data))
      .catch(() => {})
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!company) return (
    <div className="p-8 text-center">
      <p className="text-sm text-gray-400">Company not found</p>
      <button onClick={() => navigate('/')} className="mt-4 text-sm text-gray-400 underline">Back to directory</button>
    </div>
  )

  const orgCredential = company.orgCredentials?.[0]
  const vcStatus = orgCredential?.verificationStatus

  const vcUrls = orgCredential ? [
    { label: 'Legal Participant VC', url: `${VC_BASE}/vc/${orgCredential.id}`, icon: '🏛️' },
    { label: 'Terms & Conditions VC', url: `${VC_BASE}/vc/${orgCredential.id}/tandc`, icon: '📄' },
    { label: 'Legal Registration Number VC', url: `${VC_BASE}/vc/${orgCredential.id}/lrn`, icon: '🔢' },
  ] : []

  const idFields = [
    { label: 'VAT ID', value: company.vatId },
    { label: 'EORI', value: company.eoriNumber },
    { label: 'CIN', value: company.cin },
    { label: 'GST', value: company.gstNumber },
  ].filter(f => f.value)

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block">&larr; Back to Directory</button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{company.name}</h1>
            <p className="text-sm text-gray-400 mt-1">{company.city ? `${company.city}, ` : ''}{company.country}</p>
            {company.address && <p className="text-xs text-gray-300 mt-0.5">{company.address}</p>}
          </div>
          {vcStatus === 'verified' && (
            <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-1 rounded font-medium">Verified</span>
          )}
          {vcStatus === 'failed' && (
            <span className="text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded font-medium">Failed</span>
          )}
          {(vcStatus === 'pending' || !vcStatus) && (
            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded">Pending</span>
          )}
        </div>
        {company.did && (
          <div className="mt-4 bg-gray-50 rounded p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">DID</p>
            <p className="font-mono text-xs text-gray-600 break-all">{company.did}</p>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-100 mb-6">
        <nav className="flex gap-1" aria-label="Company detail tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-slate-700 text-slate-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-100 rounded-lg p-5">
            <p className="text-xs text-gray-400 mb-3">Registration Identifiers</p>
            {idFields.length > 0 ? (
              <div className="space-y-2">
                {idFields.map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-xs text-gray-400">{f.label}</span>
                    <span className="text-xs font-mono text-gray-600">{f.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300">None recorded</p>
            )}
          </div>

          <div className="border border-gray-100 rounded-lg p-5">
            <p className="text-xs text-gray-400 mb-3">Admin Contact</p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-gray-400">Name</p>
                <p className="text-sm text-gray-700">{company.adminName || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">Email</p>
                <p className="text-sm text-gray-600">{company.adminEmail || '—'}</p>
              </div>
              {company.createdAt && (
                <div>
                  <p className="text-[10px] text-gray-400">Registered</p>
                  <p className="text-xs text-gray-500">{new Date(company.createdAt).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Certificates */}
      {activeTab === 'certificates' && (
        <div className="space-y-4">
          {/* Gaia-X VC links */}
          <div className="border border-gray-100 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-gray-700">Gaia-X Verifiable Credentials</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Compliant credential endpoints</p>
              </div>
              {orgCredential ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Issued
                </span>
              ) : (
                <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-full">Not issued</span>
              )}
            </div>
            {vcUrls.length > 0 ? (
              <div className="space-y-0">
                {vcUrls.map(vc => (
                  <UrlRow key={vc.url} label={vc.label} url={vc.url} icon={vc.icon} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300 py-4 text-center">No credentials issued yet — appears after Gaia-X verification</p>
            )}
          </div>

          {/* Gaia-X compliance status */}
          {orgCredential && (
            <div className="border border-gray-100 rounded-lg p-5">
              <p className="text-xs font-medium text-gray-700 mb-3">Gaia-X Compliance Status</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-[10px] text-gray-400 mb-1">Notary Result</p>
                  <p className="text-xs text-gray-700 capitalize">
                    {orgCredential.notaryResult
                      ? String((orgCredential.notaryResult as Record<string, unknown>).status ?? 'pending')
                      : 'Pending'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-[10px] text-gray-400 mb-1">Compliance Result</p>
                  <p className="text-xs text-gray-700 capitalize">
                    {orgCredential.complianceResult
                      ? String((orgCredential.complianceResult as Record<string, unknown>).status ?? 'pending')
                      : 'Pending'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* OrgVC credential subject */}
          {orgCredential?.credentialSubject && (
            <div className="border border-gray-100 rounded-lg p-5">
              <p className="text-xs text-gray-400 mb-4">Organization Credential Details</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(orgCredential.credentialSubject).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded p-3">
                    <p className="text-[10px] text-gray-400 capitalize mb-0.5">{k.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="text-xs text-gray-700 truncate">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: EDC Infrastructure */}
      {activeTab === 'edc' && (
        <div className="border border-gray-100 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-gray-700">Eclipse Dataspace Connector</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Live-deployed EDC instance for this participant</p>
            </div>
            {edc ? <EdcStatusBadge status={edc.status} /> : (
              <span className="text-[10px] text-gray-300 bg-gray-50 px-2 py-1 rounded-full">Not configured</span>
            )}
          </div>

          {!edc && (
            <p className="text-xs text-gray-300 py-8 text-center">No EDC instance provisioned yet</p>
          )}

          {edc && (edc.status === 'pending' || edc.status === 'provisioning') && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-gray-500 font-medium">Deploying EDC instance…</p>
              <p className="text-[10px] text-gray-300 mt-1">URLs will appear automatically once deployed</p>
            </div>
          )}

          {edc?.status === 'failed' && (
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-xs font-medium text-red-600 mb-1">Provisioning failed</p>
              <p className="text-xs text-red-400">{edc.lastError || 'An unexpected error occurred.'}</p>
            </div>
          )}

          {edc?.status === 'ready' && (
            <div className="space-y-0">
              {edc.managementUrl && <UrlRow label="DSP Protocol URL"   url={edc.managementUrl.replace('-controlplane.', '-protocol.').replace('/management', '/api/v1/dsp')} icon="🔗" />}
              {edc.managementUrl && <UrlRow label="Management API URL" url={edc.managementUrl} icon="⚙️" />}
              {edc.dataplaneUrl  && <UrlRow label="Dataplane URL"      url={edc.dataplaneUrl} icon="📡" />}
            </div>
          )}

          {edc && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs">
              {edc.k8sNamespace && (
                <div>
                  <p className="text-[10px] text-gray-400">K8s Namespace</p>
                  <p className="font-mono text-gray-600">{edc.k8sNamespace}</p>
                </div>
              )}
              {edc.argoAppName && (
                <div>
                  <p className="text-[10px] text-gray-400">Argo CD App</p>
                  <p className="font-mono text-gray-600">{edc.argoAppName}</p>
                </div>
              )}
              {edc.dbName && (
                <div>
                  <p className="text-[10px] text-gray-400">Database</p>
                  <p className="font-mono text-gray-600">{edc.dbName}</p>
                </div>
              )}
              {edc.provisionedAt && (
                <div>
                  <p className="text-[10px] text-gray-400">Provisioned At</p>
                  <p className="text-gray-600">{new Date(edc.provisionedAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: DID Document */}
      {activeTab === 'did' && (
        <div className="border border-gray-100 rounded-lg p-5">
          {!didDoc ? (
            <p className="text-xs text-gray-300 py-8 text-center">DID document not available</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Document ID</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs text-gray-600 break-all flex-1">{didDoc.id}</p>
                  <CopyButton value={didDoc.id} />
                </div>
              </div>

              {/* Verification Methods */}
              {didDoc.verificationMethod && didDoc.verificationMethod.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Verification Methods</p>
                  <div className="space-y-2">
                    {didDoc.verificationMethod.map(vm => (
                      <div key={vm.id} className="bg-gray-50 rounded p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-400">ID</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[10px] text-gray-600 truncate">{vm.id}</span>
                            <CopyButton value={vm.id} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-400">Type</span>
                          <span className="text-[10px] text-gray-600">{vm.type}</span>
                        </div>
                        {vm.publicKeyJwk && (
                          <div>
                            <p className="text-[10px] text-gray-400 mb-1">Public Key (JWK)</p>
                            <pre className="text-[10px] text-gray-600 bg-white rounded border border-gray-100 p-2 overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(vm.publicKeyJwk, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Services */}
              {didDoc.service && didDoc.service.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Services</p>
                  <div className="space-y-2">
                    {didDoc.service.map(svc => (
                      <div key={svc.id} className="bg-gray-50 rounded p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-400">Type</span>
                          <span className="text-[10px] text-gray-600">{svc.type}</span>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] text-gray-400 shrink-0">Endpoint</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <a
                              href={svc.serviceEndpoint}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[10px] text-blue-600 hover:underline break-all"
                            >
                              {svc.serviceEndpoint}
                            </a>
                            <CopyButton value={svc.serviceEndpoint} />
                          </div>
                        </div>
                        {svc.description && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-gray-400">Description</span>
                            <span className="text-[10px] text-gray-500">{svc.description}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON toggle */}
              <details className="group">
                <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                  View raw JSON
                </summary>
                <pre className="mt-2 text-[10px] text-gray-600 bg-gray-50 rounded border border-gray-100 p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(didDoc, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
