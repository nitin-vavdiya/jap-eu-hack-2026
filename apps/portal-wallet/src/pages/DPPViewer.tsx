import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

const sectionGroups = [
  {
    label: 'Catena-X Digital Product Passport (CX-0143)',
    sections: [
      { key: 'metadata', title: 'Passport Metadata', icon: 'MT' },
      { key: 'identification', title: 'Identification', icon: 'ID' },
      { key: 'operation', title: 'Operation', icon: 'OP' },
      { key: 'sustainability', title: 'Sustainability', icon: 'SU' },
      { key: 'materials', title: 'Materials', icon: 'MA' },
      { key: 'characteristics', title: 'Characteristics', icon: 'CH' },
      { key: 'commercial', title: 'Commercial', icon: 'CM' },
    ],
  },
  {
    label: 'Vehicle Submodel',
    sections: [
      { key: 'performance', title: 'Performance', icon: 'PF' },
      { key: 'emissions', title: 'Emissions', icon: 'EM' },
      { key: 'stateOfHealth', title: 'State of Health', icon: 'SH' },
      { key: 'serviceHistory', title: 'Service History', icon: 'SV' },
      { key: 'damageHistory', title: 'Damage History', icon: 'DH' },
      { key: 'ownershipChain', title: 'Ownership Chain', icon: 'OC' },
      { key: 'compliance', title: 'Compliance', icon: 'CP' },
    ],
  },
  {
    label: 'Verifiable Credential',
    sections: [
      { key: 'manufacturerCredential', title: 'Manufacturer Credential', icon: 'VC' },
    ],
  },
]

const allSectionMeta = sectionGroups.flatMap(g => g.sections)

function renderValue(value: unknown, depth: number = 0): JSX.Element {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>
  if (typeof value === 'boolean') return <span className={value ? 'text-emerald-600' : 'text-red-400'}>{value ? 'Yes' : 'No'}</span>
  if (typeof value === 'number') return <span className="text-gray-800 font-medium">{value.toLocaleString()}</span>
  if (typeof value === 'string') return <span className="text-gray-700">{value}</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-300">None</span>
    if (typeof value[0] === 'string') {
      return <div className="flex flex-wrap gap-1">{value.map((v, i) => <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{String(v)}</span>)}</div>
    }
    return (
      <div className="space-y-2 mt-1">
        {value.map((item, i) => (
          <div key={i} className={`${depth < 1 ? 'bg-white border border-gray-100' : 'bg-gray-50'} rounded-lg p-3`}>
            <p className="text-[10px] text-gray-400 mb-2">#{i + 1}</p>
            {typeof item === 'object' && item !== null ? (
              <div className="space-y-1.5">
                {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-[10px] text-gray-400 capitalize flex-shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="text-xs text-right">{renderValue(v, depth + 1)}</div>
                  </div>
                ))}
              </div>
            ) : <span className="text-xs text-gray-600">{String(item)}</span>}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') {
    return (
      <div className={`${depth < 1 ? 'bg-white border border-gray-100' : 'bg-gray-50'} rounded-lg p-3 mt-1`}>
        <div className="space-y-1.5">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-[10px] text-gray-400 capitalize flex-shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <div className="text-xs text-right">{renderValue(v, depth + 1)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return <span className="text-gray-600">{String(value)}</span>
}

export default function DPPViewer() {
  const { vin } = useParams<{ vin: string }>()
  const navigate = useNavigate()
  const [car, setCar] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['identification', 'manufacturerCredential']))

  useEffect(() => {
    axios.get(`${API_BASE}/cars/${vin}`).then(r => { setCar(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [vin])

  const toggle = (key: string) => {
    setOpenSections(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"></div></div>
  if (!car) return <div className="p-8 text-center text-gray-400">Car not found</div>

  const dpp = car.dpp as Record<string, unknown>
  const stateOfHealth = dpp?.stateOfHealth as Record<string, unknown> | undefined
  const damage = dpp?.damageHistory as Record<string, unknown> | undefined
  const performance = dpp?.performance as Record<string, unknown> | undefined

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Wallet
      </button>

      {/* Car header */}
      <div className="border border-gray-100 rounded-xl p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">Digital Product Passport</p>
              <span className="text-[9px] bg-sky-50 text-sky-600 border border-sky-200 px-1.5 py-0.5 rounded font-medium">Catena-X (CX-0143)</span>
              <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded font-medium">AAS 3.0</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">{String(car.make)} {String(car.model)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{String(car.year)} &middot; {String(car.variant)}</p>
            <p className="text-xs text-gray-300 font-mono mt-2">{String(car.vin)}</p>
            {dpp?.semanticId ? (
              <p className="text-[10px] text-gray-300 font-mono mt-1">Semantic ID: {String(dpp.semanticId)}</p>
            ) : null}
            {(car as Record<string, unknown>).aas ? (
              <p className="text-[10px] text-gray-300 font-mono mt-0.5">Global Asset ID: {String(((car as Record<string, unknown>).aas as Record<string, unknown>).globalAssetId)}</p>
            ) : null}
            {(dpp?.metadata as Record<string, unknown>)?.economicOperatorId ? (
              <p className="text-[10px] text-gray-300 font-mono mt-0.5">BPNL: {String((dpp.metadata as Record<string, unknown>).economicOperatorId)}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">Verified Owner</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-6">
          {[
            { label: 'Condition', value: `${(stateOfHealth?.overallRating as number)?.toFixed(1) || 'N/A'}/10`, color: (stateOfHealth?.overallRating as number) >= 8 ? 'text-emerald-600' : (stateOfHealth?.overallRating as number) >= 6 ? 'text-amber-500' : 'text-red-400' },
            { label: 'Incidents', value: String(damage?.totalIncidents ?? 0), color: (damage?.totalIncidents as number) > 0 ? 'text-amber-500' : 'text-emerald-600' },
            { label: 'Battery', value: stateOfHealth?.batteryHealthPercent ? `${stateOfHealth.batteryHealthPercent}%` : 'N/A', color: 'text-gray-800' },
            { label: 'Motor', value: performance?.motorType ? String(performance.motorType) : 'N/A', color: 'text-gray-800' },
          ].map((s, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* DPP Sections */}
      <div className="space-y-2">
        {sectionGroups.map((group, gi) => (
          <div key={gi}>
            <div className="flex items-center gap-2 mt-5 mb-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{group.label}</p>
              <div className="flex-1 border-t border-gray-100"></div>
            </div>
            {group.sections.map((section) => {
              const data = dpp?.[section.key]
              if (!data) return null
              const isOpen = openSections.has(section.key)
              const isVC = section.key === 'manufacturerCredential'

              return (
                <div key={section.key} className={`border ${isVC ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100'} rounded-xl overflow-hidden mb-2`}>
                  <button
                    onClick={() => toggle(section.key)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${isVC ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'} rounded-lg flex items-center justify-center text-[10px] font-bold`}>
                        {section.icon}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{section.title}</span>
                      {isVC && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">Verified</span>}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5">
                      <div className={`${isVC ? 'bg-white border border-indigo-100' : 'bg-gray-50'} rounded-lg p-4`}>
                        {typeof data === 'object' && data !== null && !Array.isArray(data) ? (
                          <div className="space-y-2">
                            {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
                                <span className="text-xs text-gray-400 capitalize flex-shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <div className="text-xs text-right flex-1 max-w-[60%]">{renderValue(v)}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs">{renderValue(data)}</div>
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
  )
}
