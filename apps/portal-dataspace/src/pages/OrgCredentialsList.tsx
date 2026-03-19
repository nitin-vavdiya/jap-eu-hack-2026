import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios } from '@eu-jap-hack/auth'

const API = 'http://localhost:8000/api'

interface OrgCredential {
  id: string
  legalName: string
  verificationStatus: string
  legalRegistrationNumber: Record<string, string | undefined>
  legalAddress: { countryCode: string; locality: string }
  contactEmail: string
  createdAt: string
  updatedAt: string
  complianceResult?: { status: string; endpointSetUsed: string; complianceLevel?: string }
  verificationAttempts: unknown[]
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: 'Draft', bg: 'bg-[#F1F3F6]', text: 'text-[#5F6368]', dot: 'bg-[#9AA0A6]' },
  submitted: { label: 'Submitted', bg: 'bg-[#E8F0FE]', text: 'text-[#4285F4]', dot: 'bg-[#4285F4]' },
  verifying: { label: 'Verifying', bg: 'bg-[#FEF7E0]', text: 'text-[#F59E0B]', dot: 'bg-[#FBBC05]' },
  verified: { label: 'Gaia-X Compliant', bg: 'bg-[#E6F4EA]', text: 'text-[#34A853]', dot: 'bg-[#34A853]' },
  failed: { label: 'Verification Failed', bg: 'bg-[#FCE8E6]', text: 'text-[#EA4335]', dot: 'bg-[#EA4335]' },
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.draft
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}

export default function OrgCredentialsList() {
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [credentials, setCredentials] = useState<OrgCredential[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get(`${API}/org-credentials`).then(r => {
      const sorted = (r.data as OrgCredential[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setCredentials(sorted)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const stats = {
    total: credentials.length,
    verified: credentials.filter(c => c.verificationStatus === 'verified').length,
    pending: credentials.filter(c => ['submitted', 'verifying', 'draft'].includes(c.verificationStatus)).length,
    failed: credentials.filter(c => c.verificationStatus === 'failed').length,
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full animate-spin" />
        <p className="text-xs text-[#9AA0A6]">Loading credentials...</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#1F1F1F]">Organization Credentials</h1>
          <p className="text-sm text-[#5F6368] mt-1">Manage your Gaia-X verifiable credentials</p>
        </div>
        <button onClick={() => navigate('/create')} className="bg-[#4285F4] hover:bg-[#3367D6] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-[0.98]">
          + Create Credential
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Verified', value: stats.verified },
          { label: 'Pending', value: stats.pending },
          { label: 'Failed', value: stats.failed },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[#E5EAF0] rounded-xl p-4 hover:shadow-sm transition-shadow">
            <p className="text-2xl font-semibold text-[#1F1F1F]">{s.value}</p>
            <p className="text-xs text-[#9AA0A6] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {credentials.length === 0 ? (
        <div className="bg-white border border-[#E5EAF0] rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-[#E8F0FE] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#4285F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#1F1F1F] mb-2">No credentials yet</h2>
          <p className="text-sm text-[#5F6368] mb-6 max-w-md mx-auto">Create your first organization credential and verify it with the Gaia-X Loire trust framework.</p>
          <button onClick={() => navigate('/create')} className="bg-[#4285F4] hover:bg-[#3367D6] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all">
            Create Organization Credential
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5EAF0]">
                {['Organization', 'Location', 'Identifiers', 'Status', 'Created', ''].map((h, i) => (
                  <th key={i} className={`${i === 5 ? 'text-right' : 'text-left'} px-5 py-3 text-[10px] text-[#9AA0A6] uppercase tracking-wider font-medium`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F6]">
              {credentials.map(cred => {
                const ids = Object.entries(cred.legalRegistrationNumber || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)
                return (
                  <tr key={cred.id} className="hover:bg-[#F8FAFD] transition-colors cursor-pointer" onClick={() => navigate(`/credential/${cred.id}`)}>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-[#1F1F1F]">{cred.legalName}</p>
                      <p className="text-[10px] text-[#9AA0A6] font-mono mt-0.5">{cred.id.slice(0, 12)}...</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-[#5F6368]">{cred.legalAddress?.locality}, {cred.legalAddress?.countryCode}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {ids.slice(0, 2).map((id, i) => (
                          <span key={i} className="text-[10px] text-[#5F6368] bg-[#F1F3F6] px-2 py-0.5 rounded font-mono">{id}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={cred.verificationStatus} /></td>
                    <td className="px-5 py-4 text-xs text-[#9AA0A6]">{new Date(cred.createdAt).toLocaleDateString()}<br/><span className="text-[10px]">{new Date(cred.createdAt).toLocaleTimeString()}</span></td>
                    <td className="px-5 py-4 text-right"><span className="text-[#4285F4] text-xs font-medium">View &rarr;</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
