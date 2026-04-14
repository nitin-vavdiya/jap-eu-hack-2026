import { useState, useEffect, type ReactNode } from 'react'
import axios from 'axios'
import { getApiBase } from '@eu-jap-hack/auth'
import { useCompany } from '../context/CompanyContext'

const API_BASE = getApiBase()
const VC_BASE = API_BASE.replace(/\/api$/, '')

type Tab = 'overview' | 'credentials' | 'gaiax' | 'edc' | 'did'

interface OrgCredential {
  id: string
  legalName: string
  contactEmail: string
  website?: string
  did?: string
  verificationStatus: string
  validFrom: string
  validUntil: string
  legalRegistrationNumber?: { id?: string; type?: string }
  legalAddress?: { countryCode?: string; locality?: string; streetAddress?: string; postalCode?: string }
  headquartersAddress?: { countryCode?: string; locality?: string; streetAddress?: string; postalCode?: string }
  complianceResult?: { status: string; issuedCredential?: unknown; error?: string }
  notaryResult?: { status: string; registrationNumberType?: string; legalName?: string; error?: string }
  issuedVCs: unknown[]
  vcPayload?: unknown
}

interface EdcProvisioning {
  status: string
  attempts: number
  lastError?: string
  managementUrl?: string
  protocolUrl?: string
  dataplaneUrl?: string
  helmRelease?: string
  argoAppName?: string
  k8sNamespace?: string
  vaultPath?: string
  dbName?: string
  provisionedAt?: string
  createdAt?: string
}

interface Company {
  id: string
  name: string
  did?: string
  edcProvisioning?: EdcProvisioning
  orgCredentials: OrgCredential[]
}

// --- Small reusable components ---

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    verified: 'text-[#34A853] bg-[#E6F4EA]',
    compliant: 'text-[#34A853] bg-[#E6F4EA]',
    provisioned: 'text-[#34A853] bg-[#E6F4EA]',
    success: 'text-[#34A853] bg-[#E6F4EA]',
    failed: 'text-[#EA4335] bg-[#FCE8E6]',
    error: 'text-[#EA4335] bg-[#FCE8E6]',
    pending: 'text-[#FBBC05] bg-[#FEF7E0]',
    verifying: 'text-[#4285F4] bg-[#E8F0FE]',
    draft: 'text-[#9AA0A6] bg-[#F1F3F6]',
  }
  const cls = map[status] ?? 'text-[#9AA0A6] bg-[#F1F3F6]'
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  )
}

function Field({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-xs text-[#1F1F1F] break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-[#E5EAF0] rounded-xl p-5 space-y-4">
      <h3 className="text-xs font-semibold text-[#1F1F1F] uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function JsonViewer({ data }: { data: unknown }) {
  if (!data) return <p className="text-xs text-[#9AA0A6]">No data available</p>
  return (
    <pre className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4 text-[11px] font-mono text-[#5F6368] overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

// --- Tab: Overview ---

function OverviewTab({ company }: { company: Company }) {
  const cred = company.orgCredentials?.[0]
  return (
    <div className="space-y-4">
      <Section title="Company Identity">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name" value={company.name} />
          <Field label="DID" value={company.did} mono />
          {cred?.legalRegistrationNumber?.id && (
            <Field label="Registration Number" value={cred.legalRegistrationNumber.id} />
          )}
          {cred?.legalRegistrationNumber?.type && (
            <Field label="Registration Type" value={cred.legalRegistrationNumber.type} />
          )}
          <Field label="Contact Email" value={cred?.contactEmail} />
          <Field label="Website" value={cred?.website} />
        </div>
      </Section>

      {cred?.legalAddress && (
        <Section title="Legal Address">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Street" value={cred.legalAddress.streetAddress} />
            <Field label="City" value={cred.legalAddress.locality} />
            <Field label="Postal Code" value={cred.legalAddress.postalCode} />
            <Field label="Country" value={cred.legalAddress.countryCode} />
          </div>
        </Section>
      )}

      {cred?.headquartersAddress && (
        <Section title="Headquarters Address">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Street" value={cred.headquartersAddress.streetAddress} />
            <Field label="City" value={cred.headquartersAddress.locality} />
            <Field label="Postal Code" value={cred.headquartersAddress.postalCode} />
            <Field label="Country" value={cred.headquartersAddress.countryCode} />
          </div>
        </Section>
      )}
    </div>
  )
}

// --- Tab: Credentials ---

function CredentialsTab({ company }: { company: Company }) {
  const creds = company.orgCredentials ?? []

  if (creds.length === 0) {
    return (
      <div className="text-center py-12 text-[#9AA0A6] text-sm">
        No Gaia-X credentials found. Register your organization in the Dataspace Portal to issue credentials.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {creds.map(cred => (
        <Section key={cred.id} title={`Gaia-X Credential — ${cred.legalName}`}>
          <div className="flex items-center gap-3 mb-3">
            <StatusBadge status={cred.verificationStatus} />
            {cred.complianceResult?.status && (
              <StatusBadge status={cred.complianceResult.status} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <Field label="Legal Name" value={cred.legalName} />
            <Field label="DID" value={cred.did} mono />
            <Field label="Valid From" value={cred.validFrom ? new Date(cred.validFrom).toLocaleDateString() : undefined} />
            <Field label="Valid Until" value={cred.validUntil ? new Date(cred.validUntil).toLocaleDateString() : undefined} />
          </div>

          {/* Issued VC links */}
          <div>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-2">Issued Verifiable Credentials</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Legal Participant VC', url: `${VC_BASE}/vc/${cred.id}` },
                { label: 'Terms & Conditions VC', url: `${VC_BASE}/vc/${cred.id}/tandc` },
                { label: 'Legal Registration Number VC', url: `${VC_BASE}/vc/${cred.id}/lrn` },
              ].map(item => (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#4285F4] border border-[#4285F4]/30 bg-[#E8F0FE] px-3 py-1 rounded-lg hover:bg-[#4285F4] hover:text-white transition-colors"
                >
                  {item.label} ↗
                </a>
              ))}
            </div>
          </div>
        </Section>
      ))}
    </div>
  )
}

// --- Tab: Gaia-X & Compliance ---

function GaiaxTab({ company }: { company: Company }) {
  const cred = company.orgCredentials?.[0]

  if (!cred) {
    return <div className="text-center py-12 text-[#9AA0A6] text-sm">No Gaia-X credential data available.</div>
  }

  return (
    <div className="space-y-4">
      <Section title="Notary Result">
        {cred.notaryResult ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={cred.notaryResult.status} />
              {cred.notaryResult.legalName && (
                <span className="text-xs text-[#5F6368]">{cred.notaryResult.legalName}</span>
              )}
            </div>
            {cred.notaryResult.registrationNumberType && (
              <Field label="Registration Type Verified" value={cred.notaryResult.registrationNumberType} />
            )}
            {cred.notaryResult.error && (
              <p className="text-xs text-[#EA4335] bg-[#FCE8E6] px-3 py-2 rounded-lg">{cred.notaryResult.error}</p>
            )}
            <div className="mt-2">
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-1">Raw Notary Response</p>
              <JsonViewer data={cred.notaryResult} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#9AA0A6]">Not yet verified via GXDCH notary.</p>
        )}
      </Section>

      <Section title="Compliance Result">
        {cred.complianceResult ? (
          <div className="space-y-3">
            <StatusBadge status={cred.complianceResult.status} />
            {cred.complianceResult.error && (
              <p className="text-xs text-[#EA4335] bg-[#FCE8E6] px-3 py-2 rounded-lg">{cred.complianceResult.error}</p>
            )}
            {!!cred.complianceResult.issuedCredential && (
              <div>
                <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-1">Issued Compliance Credential</p>
                <JsonViewer data={cred.complianceResult.issuedCredential} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-[#9AA0A6]">Compliance check not yet completed.</p>
        )}
      </Section>

      <Section title="VC Payload (Legal Participant Credential)">
        <JsonViewer data={cred.vcPayload} />
      </Section>
    </div>
  )
}

// --- Tab: EDC Infrastructure ---

function EdcTab({ company }: { company: Company }) {
  const edc = company.edcProvisioning

  if (!edc) {
    return (
      <div className="text-center py-12 text-[#9AA0A6] text-sm">
        EDC infrastructure not yet provisioned. Complete onboarding in the Dataspace Portal.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Section title="Provisioning Status">
        <div className="flex items-center gap-3 mb-3">
          <StatusBadge status={edc.status} />
          {edc.provisionedAt && (
            <span className="text-xs text-[#9AA0A6]">
              Provisioned {new Date(edc.provisionedAt).toLocaleString()}
            </span>
          )}
        </div>
        {edc.lastError && (
          <p className="text-xs text-[#EA4335] bg-[#FCE8E6] px-3 py-2 rounded-lg">{edc.lastError}</p>
        )}
        <div className="grid grid-cols-2 gap-4 mt-3">
          <Field label="Attempts" value={String(edc.attempts)} />
          {edc.createdAt && <Field label="Created" value={new Date(edc.createdAt).toLocaleDateString()} />}
        </div>
      </Section>

      <Section title="Connector Endpoints">
        <div className="space-y-3">
          {edc.protocolUrl ? (
            <div>
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-0.5">Data Space Protocol (DSP) URL</p>
              <code className="text-xs font-mono text-[#4285F4] break-all">{edc.protocolUrl}</code>
            </div>
          ) : (
            <p className="text-xs text-[#9AA0A6]">DSP URL not yet available</p>
          )}
          {edc.managementUrl && (
            <div>
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-0.5">Management API URL</p>
              <code className="text-xs font-mono text-[#5F6368] break-all">{edc.managementUrl}</code>
            </div>
          )}
          {edc.dataplaneUrl && (
            <div>
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wider mb-0.5">Dataplane URL</p>
              <code className="text-xs font-mono text-[#5F6368] break-all">{edc.dataplaneUrl}</code>
            </div>
          )}
        </div>
      </Section>

      <Section title="Kubernetes & GitOps">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Helm Release" value={edc.helmRelease} mono />
          <Field label="Argo CD App" value={edc.argoAppName} mono />
          <Field label="K8s Namespace" value={edc.k8sNamespace} mono />
          <Field label="Vault Path" value={edc.vaultPath} mono />
          <Field label="Database Name" value={edc.dbName} mono />
        </div>
      </Section>
    </div>
  )
}

// --- Tab: DID Document ---

function DidTab({ companyId }: { companyId: string }) {
  const [didDoc, setDidDoc] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get(`${VC_BASE}/company/${companyId}/did.json`)
      .then(r => { setDidDoc(r.data); setLoading(false) })
      .catch(() => { setError('DID document not available'); setLoading(false) })
  }, [companyId])

  return (
    <Section title="DID Document">
      <p className="text-[10px] text-[#9AA0A6] mb-3">
        Public DID document served at:{' '}
        <code className="font-mono">{VC_BASE}/company/{companyId}/did.json</code>
      </p>
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin w-5 h-5 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full" />
        </div>
      ) : error ? (
        <p className="text-xs text-[#9AA0A6]">{error}</p>
      ) : (
        <JsonViewer data={didDoc} />
      )}
    </Section>
  )
}

// --- Main Page ---

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'gaiax', label: 'Gaia-X & Compliance' },
  { id: 'edc', label: 'EDC Infrastructure' },
  { id: 'did', label: 'DID Document' },
]

export default function CompanyProfile() {
  const { company, loading, error } = useCompany()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-7 h-7 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full" />
      </div>
    )
  }

  if (error || !company) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 text-center text-sm text-[#9AA0A6]">
        {error || 'Company profile not found.'}
      </div>
    )
  }

  const hasVerifiedCredential = company.orgCredentials?.some(
    c => c.verificationStatus === 'verified' && c.complianceResult?.status === 'compliant'
  )

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[#1F1F1F]">{company.name}</h1>
          {company.did && (
            <p className="text-xs font-mono text-[#9AA0A6] mt-0.5 break-all">{company.did}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={hasVerifiedCredential ? 'verified' : 'unverified'} />
          {company.edcProvisioning?.status && (
            <StatusBadge status={company.edcProvisioning.status} />
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-[#E5EAF0] mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#4285F4] text-[#4285F4]'
                : 'border-transparent text-[#9AA0A6] hover:text-[#5F6368]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab company={company} />}
      {activeTab === 'credentials' && <CredentialsTab company={company} />}
      {activeTab === 'gaiax' && <GaiaxTab company={company} />}
      {activeTab === 'edc' && <EdcTab company={company} />}
      {activeTab === 'did' && <DidTab companyId={company.id} />}
    </div>
  )
}
