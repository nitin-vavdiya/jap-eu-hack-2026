import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

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
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null)

  useEffect(() => {
    axios.get(`${API_BASE}/companies/${id}`).then(r => {
      setCompany(r.data.company || r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full"></div></div>
  if (!company) return (
    <div className="p-8 text-center">
      <p className="text-sm text-gray-400">Company not found</p>
      <button onClick={() => navigate('/')} className="mt-4 text-sm text-gray-400 underline">Back to directory</button>
    </div>
  )

  const orgVC = company.credentials?.find(c => c.type === 'OrgVC')
  const idFields = [
    { label: 'VAT ID', value: company.vatId },
    { label: 'EORI', value: company.eoriNumber },
    { label: 'CIN', value: company.cin },
    { label: 'GST', value: company.gstNumber },
  ].filter(f => f.value)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block">&larr; Back to Directory</button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{company.name}</h1>
            <p className="text-sm text-gray-400 mt-1">{company.city ? `${company.city}, ` : ''}{company.country}</p>
            {company.address && <p className="text-xs text-gray-300 mt-0.5">{company.address}</p>}
          </div>
          {orgVC?.status === 'active' ? (
            <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-1 rounded font-medium">Verified</span>
          ) : (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
              <p className="text-sm text-gray-700">{company.adminName || '\u2014'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">Email</p>
              <p className="text-sm text-gray-600">{company.adminEmail || '\u2014'}</p>
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

      {/* Credentials */}
      <div className="border border-gray-100 rounded-lg p-5 mb-6">
        <p className="text-xs text-gray-400 mb-4">
          Verifiable Credentials <span className="text-gray-300">({company.credentials?.length || 0})</span>
        </p>

        {!company.credentials || company.credentials.length === 0 ? (
          <p className="text-center py-8 text-xs text-gray-300">No credentials issued</p>
        ) : (
          <div className="space-y-2">
            {company.credentials.map((cred) => (
              <div
                key={cred.id}
                onClick={() => setSelectedCred(cred)}
                className="flex items-center justify-between p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div>
                  <span className="text-xs font-medium text-gray-700">{cred.type}</span>
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    cred.status === 'active' ? 'text-emerald-500 bg-emerald-50' : 'text-gray-400 bg-white'
                  }`}>{cred.status}</span>
                  {cred.issuerName && <p className="text-[10px] text-gray-400 mt-0.5">{cred.issuerName}</p>}
                </div>
                <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OrgVC details */}
      {orgVC?.credentialSubject && (
        <div className="border border-gray-100 rounded-lg p-5">
          <p className="text-xs text-gray-400 mb-4">Organization Credential Details</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(orgVC.credentialSubject).map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded p-3">
                <p className="text-[10px] text-gray-400 capitalize mb-0.5">{k.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-xs text-gray-700 truncate">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credential Detail Modal */}
      {selectedCred && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCred(null)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedCred.type}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedCred.issuerName || 'Verifiable Credential'}</p>
              </div>
              <button onClick={() => setSelectedCred(null)} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
            </div>
            <div className="px-6 py-5">
              {selectedCred.credentialSubject && (
                <div className="space-y-0">
                  {Object.entries(selectedCred.credentialSubject).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="text-xs text-gray-700 font-medium text-right max-w-[200px]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
