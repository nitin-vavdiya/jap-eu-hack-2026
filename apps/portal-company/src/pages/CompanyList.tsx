import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getApiBase, getPortalDataspaceUrl } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

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
  adminName?: string
  adminEmail?: string
  createdAt?: string
  credentials?: Array<{ type: string; status: string }>
  orgCredentials?: Array<{ id: string; verificationStatus?: string }>
  edcProvisioning?: { status: 'pending' | 'provisioning' | 'ready' | 'failed' }
}

export default function CompanyList() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    axios.get(`${API_BASE}/companies`).then(r => {
      setCompanies(r.data.companies || r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = companies.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.country.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Organization Directory</h1>
        <p className="text-sm text-gray-400 mt-1">All registered organizations with verified credentials</p>
        <div className="mt-4 flex gap-3 text-xs">
          <span className="border border-gray-200 text-gray-500 px-2.5 py-1 rounded-full">{companies.length} Organizations</span>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name or country..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-200 rounded px-3.5 py-2 text-sm focus:outline-none focus:border-slate-300"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-gray-400 mb-4">No organizations registered yet</p>
          <a href={getPortalDataspaceUrl()} target="_blank" rel="noopener noreferrer"
            className="bg-gray-900 text-white px-5 py-2 rounded text-sm hover:bg-gray-800">
            Register First Organization
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(company => {
            const vcStatus = company.orgCredentials?.[0]?.verificationStatus
            const edcStatus = company.edcProvisioning?.status
            const edcBadge: Record<string, { label: string; cls: string }> = {
              pending:      { label: 'EDC Pending',      cls: 'text-gray-400 bg-gray-50' },
              provisioning: { label: 'EDC Setting up…',  cls: 'text-blue-500 bg-blue-50' },
              ready:        { label: 'EDC Ready',         cls: 'text-green-600 bg-green-50' },
              failed:       { label: 'EDC Failed',        cls: 'text-red-500 bg-red-50' },
            }
            return (
              <div
                key={company.id}
                onClick={() => navigate(`/company/${company.id}`)}
                className="border border-gray-100 rounded-lg p-5 cursor-pointer hover:border-gray-200 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{company.country}</p>
                  {vcStatus === 'verified' && (
                    <span className="text-[10px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">Verified</span>
                  )}
                  {vcStatus === 'failed' && (
                    <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-medium">Failed</span>
                  )}
                  {(vcStatus === 'pending' || !vcStatus) && (
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">Pending</span>
                  )}
                </div>
                <h3 className="font-medium text-gray-900 mb-1">{company.name}</h3>
                <p className="text-xs text-gray-400 mb-3">{company.city ? `${company.city}, ` : ''}{company.country}</p>

                {company.did && (
                  <p className="font-mono text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded mb-3 truncate">{company.did}</p>
                )}

                <div className="flex flex-wrap gap-1 mb-3">
                  {company.vatId && <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">VAT</span>}
                  {company.eoriNumber && <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">EORI</span>}
                  {company.cin && <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">CIN</span>}
                  {company.gstNumber && <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">GST</span>}
                  {edcStatus && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${edcBadge[edcStatus].cls}`}>
                      {edcBadge[edcStatus].label}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-50">
                  <span>{company.adminName || 'N/A'}</span>
                  <span className="text-gray-400">View &rarr;</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
