import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

// Car images (Wikimedia Commons)
const carImages: Record<string, string> = {
  'TOYO2025BZ4X000001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/2026_Toyota_bZ4X_Auto_Zuerich_2025_DSC_3391.jpg/1280px-2026_Toyota_bZ4X_Auto_Zuerich_2025_DSC_3391.jpg',
  'TOYO2024RAV4HY0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/2024_Toyota_RAV4_2.5_LTD_HEV_in_White_Pearl_Crystal_Shine%2C_front_right%2C_06-09-2024.jpg/1280px-2024_Toyota_RAV4_2.5_LTD_HEV_in_White_Pearl_Crystal_Shine%2C_front_right%2C_06-09-2024.jpg',
  'TOYO2023CAMRYH0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/2022_Toyota_Camry_Hybrid_XLE_in_Midnight_Black_Metallic%2C_Front_Right%2C_12-25-2021.jpg/1280px-2022_Toyota_Camry_Hybrid_XLE_in_Midnight_Black_Metallic%2C_Front_Right%2C_12-25-2021.jpg',
  'TOYO2022LANDCR0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/2021_Toyota_Land_Cruiser_300_%28Russia%29_front_view.jpg/1280px-2021_Toyota_Land_Cruiser_300_%28Russia%29_front_view.jpg',
  'TOYO2020COROLL0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/2020_Toyota_Corolla_SE%2C_front_2.29.20.jpg/1280px-2020_Toyota_Corolla_SE%2C_front_2.29.20.jpg',
  'TOYO2025YARISCR001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/2024_Toyota_Yaris_Cross_GR_Sport_front.jpg/1280px-2024_Toyota_Yaris_Cross_GR_Sport_front.jpg',
  'TOYO2018PRIUSH0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/2019_Toyota_Prius_AWD-e_in_Super_White%2C_Front_Left%2C_08-21-2022.jpg/1280px-2019_Toyota_Prius_AWD-e_in_Super_White%2C_Front_Left%2C_08-21-2022.jpg',
  'TOYO2024CHRHYB0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Toyota_C-HR%2B_Auto_Zuerich_2025_DSC_3053.jpg/1280px-Toyota_C-HR%2B_Auto_Zuerich_2025_DSC_3053.jpg',
}

function renderDPPValue(value: unknown, depth: number = 0): JSX.Element {
  if (value === null || value === undefined) return <span className="text-gray-300">&mdash;</span>
  if (typeof value === 'boolean') return <span className={value ? 'text-emerald-600 font-medium' : 'text-red-400'}>{value ? 'Yes' : 'No'}</span>
  if (typeof value === 'number') return <span className="text-gray-800 font-medium">{value.toLocaleString()}</span>
  if (typeof value === 'string') return <span className="text-gray-700">{value}</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-300">None</span>
    if (typeof value[0] === 'string') {
      return <div className="flex flex-wrap gap-1">{value.map((v, i) => <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{v}</span>)}</div>
    }
    return (
      <div className="space-y-2 mt-1">
        {value.map((item, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-1.5">#{i + 1}</p>
            {typeof item === 'object' && item !== null ? (
              <div className="space-y-1">
                {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-[10px] text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="text-xs text-right">{renderDPPValue(v, depth + 1)}</div>
                  </div>
                ))}
              </div>
            ) : <span className="text-xs">{String(item)}</span>}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    return (
      <div className="bg-gray-50 rounded-lg p-3 mt-1 space-y-1.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <span className="text-[10px] text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
            <div className="text-xs text-right">{renderDPPValue(v, depth + 1)}</div>
          </div>
        ))}
      </div>
    )
  }
  return <span>{String(value)}</span>
}

export default function CarDetail() {
  const { vin } = useParams<{ vin: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, userId, fullName, login, accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [car, setCar] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [consentIdentity, setConsentIdentity] = useState(false)
  const [consentDPP, setConsentDPP] = useState(false)
  const [consentTerms, setConsentTerms] = useState(false)
  const [openSection, setOpenSection] = useState<number | null>(0)

  useEffect(() => {
    axios.get(`${API_BASE}/cars/${vin}`).then(r => { setCar(r.data); setLoading(false) })
  }, [vin])

  const handleBuy = async () => {
    if (!car) return
    if (!isAuthenticated) {
      login()
      return
    }
    setBuying(true)
    try {
      await api.post(`/purchases`, {
        userId, vin: car.vin,
        userInfo: { name: fullName, country: 'IT' }
      })
      navigate(`/buy-success/${vin}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error || 'Purchase failed')
      setBuying(false)
      setShowConfirm(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full"></div></div>
  if (!car) return <div className="p-8 text-center text-gray-400">Car not found</div>

  const dpp = car.dpp as Record<string, unknown> | undefined
  const stateOfHealth = dpp?.stateOfHealth as Record<string, unknown> | undefined
  const damageHistory = dpp?.damageHistory as Record<string, unknown> | undefined
  const serviceHistory = dpp?.serviceHistory as Record<string, unknown> | undefined

  const sectionGroups = [
    {
      label: 'Catena-X Digital Product Passport (CX-0143)',
      sections: [
        { title: 'Passport Metadata', key: 'metadata' },
        { title: 'Identification', key: 'identification' },
        { title: 'Operation', key: 'operation' },
        { title: 'Sustainability', key: 'sustainability' },
        { title: 'Materials', key: 'materials' },
        { title: 'Characteristics', key: 'characteristics' },
        { title: 'Commercial', key: 'commercial' },
      ],
    },
    {
      label: 'Vehicle Submodel',
      sections: [
        { title: 'Performance', key: 'performance' },
        { title: 'Emissions', key: 'emissions' },
        { title: 'State of Health', key: 'stateOfHealth' },
        { title: 'Service History', key: 'serviceHistory' },
        { title: 'Damage History', key: 'damageHistory' },
        { title: 'Ownership Chain', key: 'ownershipChain' },
        { title: 'Compliance', key: 'compliance' },
      ],
    },
    {
      label: 'Verifiable Credential',
      sections: [
        { title: 'Manufacturer Credential', key: 'credential' },
      ],
    },
  ]

  const allSections = sectionGroups.flatMap(g => g.sections)
  const displayName = isAuthenticated ? fullName : 'Guest'

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to showroom
      </button>

      {/* Header card */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-8">
        {carImages[String(car.vin)] && (
          <div className="h-56 bg-[#F6F8FA] overflow-hidden">
            <img
              src={carImages[String(car.vin)]}
              alt={`${String(car.make)} ${String(car.model)}`}
              className="w-full h-full object-cover object-center"
            />
          </div>
        )}
        <div className="p-8">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{String(car.year)} &middot; {String(car.variant)}</p>
              <h1 className="text-2xl font-semibold text-gray-900">{String(car.make)} {String(car.model)}</h1>
              <p className="text-xs text-gray-300 font-mono mt-2">{String(car.vin)}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-gray-900">&euro;{(car.price as number)?.toLocaleString()}</p>
              <span className={`inline-block mt-2 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ${
                car.status === 'available' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 bg-gray-50'
              }`}>{String(car.status)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-8">
            {[
              { label: 'Condition', value: `${(stateOfHealth?.overallRating as number)?.toFixed(1)}/10`, color: (stateOfHealth?.overallRating as number) >= 8 ? 'text-emerald-600' : (stateOfHealth?.overallRating as number) >= 6 ? 'text-amber-500' : 'text-red-400' },
              { label: 'Incidents', value: String(damageHistory?.totalIncidents ?? 0), color: (damageHistory?.totalIncidents as number) > 0 ? 'text-amber-500' : 'text-emerald-600' },
              { label: 'Service Records', value: String(serviceHistory?.totalServiceRecords ?? 0), color: 'text-gray-900' },
            ].map((s, i) => (
              <div key={i} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {car.status === 'available' && (
          <div className="px-8 pb-8">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3.5 rounded-lg font-medium transition-colors"
                >
                  Buy This Car &mdash; &euro;{(car.price as number)?.toLocaleString()}
                </button>
                <p className="text-center text-[11px] text-gray-300 mt-2">Purchase as {displayName}</p>
              </>
            ) : (
              <>
                <button
                  onClick={() => login()}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3.5 rounded-lg font-medium transition-colors"
                >
                  Login to Buy &mdash; &euro;{(car.price as number)?.toLocaleString()}
                </button>
                <p className="text-center text-[11px] text-gray-300 mt-2">Sign in with your account to purchase</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* DPP Sections */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Digital Product Passport</h2>
          <span className="text-[9px] bg-sky-50 text-sky-600 border border-sky-200 px-1.5 py-0.5 rounded font-medium">Catena-X Compliant (CX-0143)</span>
          <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded font-medium">AAS 3.0</span>
        </div>
        <div className="space-y-1">
          {sectionGroups.map((group, gi) => (
            <div key={gi}>
              <div className="flex items-center gap-2 mt-5 mb-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{group.label}</p>
                <div className="flex-1 border-t border-gray-100"></div>
              </div>
              {group.sections.map((section) => {
                const globalIdx = allSections.findIndex(s => s.key === section.key)
                const content = dpp?.[section.key]
                if (!content) return null
                const isVC = section.key === 'credential'
                return (
                  <div key={section.key} className={`border ${isVC ? 'border-indigo-200 bg-indigo-50/20' : 'border-gray-100'} rounded-xl overflow-hidden mb-1`}>
                    <button
                      onClick={() => setOpenSection(openSection === globalIdx ? null : globalIdx)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 font-medium">{section.title}</span>
                        {isVC && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">VC</span>}
                      </div>
                      <svg className={`w-4 h-4 text-gray-300 transition-transform ${openSection === globalIdx ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {openSection === globalIdx && (
                      <div className="px-5 pb-4">
                        {isVC && !!(content as Record<string, unknown>)?.legalParticipantId && (
                          <a
                            href={`${API_BASE.replace('/api', '')}/vc/${(content as Record<string, unknown>).legalParticipantId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 font-mono mb-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            View Legal Participant VC
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        )}
                        <div className={`${isVC ? 'bg-white border border-indigo-100' : 'bg-gray-50'} rounded-lg p-4`}>
                          {typeof content === 'object' && content !== null && !Array.isArray(content) ? (
                            <div className="space-y-2">
                              {Object.entries(content as Record<string, unknown>).map(([k, v]) => (
                                <div key={k} className="flex justify-between gap-4 py-1 border-b border-gray-50 last:border-0">
                                  <span className="text-xs text-gray-400 capitalize flex-shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <div className="text-xs text-right flex-1 max-w-[60%]">{renderDPPValue(v)}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs">{renderDPPValue(content)}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Purchase Consent & Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { if (!buying) { setShowConfirm(false); setConsentIdentity(false); setConsentDPP(false); setConsentTerms(false) } }}>
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-1">Consent &amp; Purchase</h3>
              <p className="text-xs text-gray-400 text-center mb-5">Please review and provide your consent before proceeding</p>

              <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Vehicle</span>
                  <span className="text-xs font-medium text-gray-800">{String(car.make)} {String(car.model)} ({String(car.year)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">VIN</span>
                  <span className="text-[10px] font-mono text-gray-500">{String(car.vin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Buyer</span>
                  <span className="text-xs font-medium text-gray-800">{displayName}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium text-gray-700">Total Price</span>
                  <span className="text-sm font-semibold text-gray-900">&euro;{(car.price as number)?.toLocaleString()}</span>
                </div>
              </div>

              {/* Consent checkboxes */}
              <div className="border border-gray-100 rounded-lg p-4 mb-5 space-y-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-1">Owner Consent Required</p>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={consentIdentity} onChange={e => setConsentIdentity(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium group-hover:text-gray-900">Identity Data Sharing</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">I consent to share my identity information (name, country) with Toyota Motor Corporation for ownership registration and Verifiable Credential issuance.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={consentDPP} onChange={e => setConsentDPP(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium group-hover:text-gray-900">Digital Product Passport Access</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">I consent to receive and store the vehicle's Digital Product Passport data in my SmartSense Wallet, including service history, damage records, and compliance certificates.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={consentTerms} onChange={e => setConsentTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium group-hover:text-gray-900">Terms &amp; Conditions</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">I agree to the purchase terms, including that an Ownership Verifiable Credential will be issued to my SmartSense Wallet and recorded on the trust registry.</p>
                  </div>
                </label>
              </div>

              {!(consentIdentity && consentDPP && consentTerms) && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-center">Please check all consent boxes above to proceed with the purchase.</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowConfirm(false); setConsentIdentity(false); setConsentDPP(false); setConsentTerms(false) }}
                  disabled={buying}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBuy}
                  disabled={buying || !(consentIdentity && consentDPP && consentTerms)}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buying ? 'Processing...' : 'Confirm Purchase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
