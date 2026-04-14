import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

interface RegistryVehicle {
  carId: string
  vin: string
  make: string
  model: string
  year: number
  variant: string
  fuelType: string
  status: string
  isSold: boolean
  manufacturerVerified: boolean
}

interface AuditEntry {
  id: string
  vin: string
  action: string
  actor: string
  timestamp: string
  details?: Record<string, unknown>
}

interface AccessSession {
  id: string
  vin: string
  requesterId: string
  requesterName: string
  consentId: string
  status: string
  createdAt: string
  expiresAt: string
  isExpired: boolean
}

export default function VehicleRegistry() {
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [vehicles, setVehicles] = useState<RegistryVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedVin, setSelectedVin] = useState<string | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [sessions, setSessions] = useState<AccessSession[]>([])
  const [detailTab, setDetailTab] = useState<'resolve' | 'audit' | 'sessions' | 'policies'>('resolve')
  const [resolution, setResolution] = useState<Record<string, unknown> | null>(null)
  const [policies, setPolicies] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get(`${API_BASE}/vehicle-registry/vehicles`).then(r => {
      setVehicles(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const selectVehicle = async (vin: string) => {
    setSelectedVin(vin)
    setLoadingDetail(true)
    setDetailTab('resolve')

    try {
      const [resolveResp, auditResp, sessionsResp, policiesResp] = await Promise.all([
        api.get(`${API_BASE}/vehicle-registry/vehicles/${vin}`),
        api.get(`${API_BASE}/vehicle-registry/vehicles/${vin}/audit-log`),
        api.get(`${API_BASE}/vehicle-registry/vehicles/${vin}/access-sessions`),
        api.get(`${API_BASE}/vehicle-registry/vehicles/${vin}/policies`),
      ])
      setResolution(resolveResp.data)
      setAuditLog(auditResp.data)
      setSessions(sessionsResp.data)
      setPolicies(policiesResp.data)
    } catch { /* ignore */ }
    setLoadingDetail(false)
  }

  const filtered = vehicles.filter(v =>
    !search ||
    v.vin.toLowerCase().includes(search.toLowerCase()) ||
    v.model.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total: vehicles.length,
    sold: vehicles.filter(v => v.isSold).length,
    available: vehicles.filter(v => !v.isSold).length,
    verified: vehicles.filter(v => v.manufacturerVerified).length,
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-[#1F1F1F]">Vehicle Asset Registry</h1>
          <p className="text-xs text-[#9AA0A6] mt-0.5">Manufacturer-hosted registry of resolvable Car IDs</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
            Gaia-X Compliant
          </span>
          <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
            HTTPS Resolvable
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Registered', value: String(stats.total) },
          { label: 'Sold (Owner)', value: String(stats.sold) },
          { label: 'Available', value: String(stats.available) },
          { label: 'Verified', value: String(stats.verified) },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[#E5EAF0] rounded-xl p-4 text-center hover:shadow-sm transition-shadow">
            <p className="text-xl font-semibold text-[#1F1F1F]">{s.value}</p>
            <p className="text-[11px] text-[#9AA0A6] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Vehicle List */}
        <div className="col-span-2">
          <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5EAF0] flex items-center justify-between">
              <p className="text-xs font-medium text-[#1F1F1F]">Registry Entries</p>
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border border-[#E5EAF0] rounded-lg px-3 py-1.5 text-xs w-36 focus:outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]/20"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin w-5 h-5 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full" />
              </div>
            ) : (
              <div className="divide-y divide-[#F1F3F6] max-h-[600px] overflow-y-auto">
                {filtered.map(v => (
                  <button
                    key={v.vin}
                    onClick={() => selectVehicle(v.vin)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#F8FAFD] transition-colors ${
                      selectedVin === v.vin ? 'bg-blue-50 border-l-2 border-l-[#4285F4]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#1F1F1F]">{v.make} {v.model}</p>
                        <p className="text-[10px] text-[#9AA0A6] font-mono mt-0.5">{v.vin}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                          v.isSold ? 'text-[#9AA0A6] bg-[#F1F3F6]' : 'text-[#34A853] bg-[#E6F4EA]'
                        }`}>
                          {v.isSold ? 'Sold' : 'Available'}
                        </span>
                        {v.manufacturerVerified && (
                          <span className="text-[8px] text-emerald-600">Verified</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#9AA0A6] mt-1 truncate">{v.carId}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="col-span-3">
          {!selectedVin ? (
            <div className="bg-white border border-[#E5EAF0] rounded-xl flex items-center justify-center h-96">
              <div className="text-center">
                <p className="text-sm text-[#9AA0A6]">Select a vehicle to view registry details</p>
                <p className="text-[10px] text-[#C4C9D0] mt-1">Resolve preview, audit logs, access sessions, and policies</p>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="bg-white border border-[#E5EAF0] rounded-xl flex items-center justify-center h-96">
              <div className="animate-spin w-6 h-6 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Car ID Banner */}
              {resolution && (
                <div className="bg-gradient-to-r from-[#4285F4] to-[#3367D6] rounded-xl p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] opacity-70 uppercase tracking-wide">Resolvable Car ID</p>
                      <p className="text-xs font-mono mt-1 break-all">{resolution.carId as string}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(resolution.manufacturer as any)?.verificationStatus === 'verified' && (
                        <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full">Gaia-X Verified</span>
                      )}
                      <button
                        onClick={() => navigate(`/car/${selectedVin}`)}
                        className="text-[10px] bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
                      >
                        View DPP
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden">
                <div className="flex border-b border-[#E5EAF0]">
                  {([
                    { key: 'resolve', label: 'Resolution Document' },
                    { key: 'policies', label: 'Data Policies' },
                    { key: 'sessions', label: `Access Sessions (${sessions.length})` },
                    { key: 'audit', label: `Audit Log (${auditLog.length})` },
                  ] as const).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key)}
                      className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                        detailTab === tab.key
                          ? 'text-[#4285F4] border-b-2 border-[#4285F4]'
                          : 'text-[#9AA0A6] hover:text-[#5F6368]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* Resolve Tab */}
                  {detailTab === 'resolve' && resolution && (
                    <div className="space-y-4">
                      {/* Manufacturer */}
                      <div>
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Manufacturer</p>
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <div className="w-8 h-8 bg-[#1A47A0] rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-xs">T</span>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-blue-900">{(resolution.manufacturer as any)?.name}</p>
                            <p className="text-[10px] text-blue-600 font-mono">{(resolution.manufacturer as any)?.did}</p>
                          </div>
                          <span className={`ml-auto text-[9px] font-medium px-2 py-0.5 rounded-full ${
                            (resolution.manufacturer as any)?.verificationStatus === 'verified'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {(resolution.manufacturer as any)?.verificationStatus === 'verified' ? 'Verified' : 'Unverified'}
                          </span>
                        </div>
                      </div>

                      {/* Vehicle Info */}
                      <div>
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Vehicle</p>
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries((resolution.vehicle as Record<string, unknown>) || {}).map(([k, v]) => (
                            <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                              <p className="text-[10px] text-[#9AA0A6] capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                              <p className="text-xs text-[#1F1F1F] font-medium">{String(v)}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Ownership */}
                      <div>
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Ownership</p>
                        <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
                          <span className="text-xs text-[#5F6368]">
                            {(resolution.ownership as any)?.isSold ? 'Sold — Owner registered' : 'Not sold — No owner'}
                          </span>
                          {(resolution.ownership as any)?.ownerWallet && (
                            <span className="text-[10px] text-blue-600 font-mono">{(resolution.ownership as any).ownerWallet}</span>
                          )}
                        </div>
                      </div>

                      {/* DPP Reference */}
                      <div>
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">DPP Reference</p>
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[10px] text-[#9AA0A6]">Semantic ID</span>
                            <span className="text-[10px] text-[#5F6368] font-mono">{(resolution.dppReference as any)?.semanticId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[10px] text-[#9AA0A6]">Endpoint</span>
                            <span className="text-[10px] text-blue-600 font-mono">{(resolution.dppReference as any)?.endpoint}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[10px] text-[#9AA0A6]">Access</span>
                            <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              {(resolution.dppReference as any)?.accessLevel}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Service Endpoints */}
                      <div>
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Service Endpoints</p>
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                          {Object.entries((resolution.serviceEndpoints as Record<string, string>) || {}).map(([key, url]) => (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-[10px] text-[#9AA0A6] capitalize w-28">{key.replace(/([A-Z])/g, ' $1')}</span>
                              <span className="text-[9px] text-[#5F6368] font-mono truncate max-w-[350px]">{url}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Data Categories */}
                      <div>
                        <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Supported Data Categories</p>
                        <div className="space-y-1">
                          {((resolution.supportedDataCategories as any[]) || []).map((cat, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded">
                              <span className="text-[11px] text-[#5F6368]">{cat.category}</span>
                              <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                                cat.accessLevel === 'public'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : cat.accessLevel === 'insurer_allowed_with_consent'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-orange-50 text-orange-700 border border-orange-200'
                              }`}>
                                {cat.accessLevel === 'public' ? 'Public' : cat.accessLevel === 'insurer_allowed_with_consent' ? 'Insurer + Consent' : 'Consent Required'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Policies Tab */}
                  {detailTab === 'policies' && policies && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-[#5F6368]">Data access policies define who can access what data and under which conditions.</p>
                        <span className="text-[9px] bg-gray-100 text-[#5F6368] px-2 py-0.5 rounded">v{policies.policyVersion}</span>
                      </div>
                      {policies.dataCategories?.map((cat: any, i: number) => (
                        <div key={i} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-[#1F1F1F]">{cat.category}</p>
                            <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                              cat.accessLevel === 'public'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : cat.accessLevel === 'insurer_allowed_with_consent'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-orange-50 text-orange-700 border border-orange-200'
                            }`}>
                              {cat.accessLevel.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#9AA0A6] mb-2">{cat.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {cat.fields?.map((f: string) => (
                              <span key={f} className="text-[9px] bg-gray-100 text-[#5F6368] px-1.5 py-0.5 rounded font-mono">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="bg-gray-50 rounded-lg p-3 mt-3">
                        <p className="text-[10px] text-[#9AA0A6] mb-1">Consent Configuration</p>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="flex justify-between">
                            <span className="text-[#9AA0A6]">Consent Expiry</span>
                            <span className="text-[#5F6368]">{policies.consentExpiryHours}h</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#9AA0A6]">Session Duration</span>
                            <span className="text-[#5F6368]">{policies.accessSessionDurationMinutes}min</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sessions Tab */}
                  {detailTab === 'sessions' && (
                    <div>
                      {sessions.length === 0 ? (
                        <p className="text-center text-sm text-[#9AA0A6] py-8">No access sessions for this vehicle</p>
                      ) : (
                        <div className="space-y-2">
                          {sessions.map(s => (
                            <div key={s.id} className={`border rounded-lg p-3 ${
                              s.isExpired ? 'border-gray-100 bg-gray-50' : 'border-emerald-200 bg-emerald-50'
                            }`}>
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-medium text-[#1F1F1F]">{s.requesterName || s.requesterId}</p>
                                <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                                  s.isExpired
                                    ? 'bg-gray-100 text-[#9AA0A6]'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {s.isExpired ? 'Expired' : 'Active'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px] mt-2">
                                <div>
                                  <span className="text-[#9AA0A6]">Requester ID: </span>
                                  <span className="text-[#5F6368] font-mono">{s.requesterId}</span>
                                </div>
                                <div>
                                  <span className="text-[#9AA0A6]">Session: </span>
                                  <span className="text-[#5F6368] font-mono">{s.id.slice(0, 8)}...</span>
                                </div>
                                <div>
                                  <span className="text-[#9AA0A6]">Created: </span>
                                  <span className="text-[#5F6368]">{new Date(s.createdAt).toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="text-[#9AA0A6]">Expires: </span>
                                  <span className="text-[#5F6368]">{new Date(s.expiresAt).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Audit Tab */}
                  {detailTab === 'audit' && (
                    <div>
                      {auditLog.length === 0 ? (
                        <p className="text-center text-sm text-[#9AA0A6] py-8">No audit events for this vehicle</p>
                      ) : (
                        <div className="space-y-1.5">
                          {auditLog.map(entry => (
                            <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                entry.action.includes('approve') || entry.action.includes('created') ? 'bg-emerald-400' :
                                entry.action.includes('denied') ? 'bg-red-400' :
                                entry.action.includes('protected') ? 'bg-amber-400' :
                                'bg-blue-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] text-[#1F1F1F] font-medium">
                                    {entry.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                  </p>
                                  <span className="text-[9px] text-[#9AA0A6]">
                                    {new Date(entry.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-[10px] text-[#9AA0A6]">Actor: {entry.actor}</p>
                                {entry.details && Object.keys(entry.details).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(entry.details).map(([k, v]) => (
                                      <span key={k} className="text-[8px] bg-gray-100 text-[#9AA0A6] px-1.5 py-0.5 rounded font-mono">
                                        {k}: {String(v).slice(0, 20)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
