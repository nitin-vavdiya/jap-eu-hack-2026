import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

interface DPPSection {
  title: string
  key: string
  statusFn?: (data: Record<string, unknown>) => { label: string; color: string }
  groupHeader?: string
}

const sections: DPPSection[] = [
  // Catena-X Passport (CX-0143)
  { title: 'Metadata', key: 'metadata', groupHeader: 'Catena-X Passport (CX-0143)',
    statusFn: (d) => {
      const status = (d as Record<string, unknown> | null)?.status as string
      return status ? { label: status, color: 'text-blue-500 bg-blue-50' } : { label: 'Draft', color: 'text-gray-400 bg-gray-50' }
    }
  },
  { title: 'Identification', key: 'identification',
    statusFn: () => ({ label: 'Complete', color: 'text-emerald-500 bg-emerald-50' }) },
  { title: 'Operation', key: 'operation',
    statusFn: () => ({ label: 'Verified', color: 'text-emerald-500 bg-emerald-50' }) },
  { title: 'Sustainability', key: 'sustainability',
    statusFn: (d) => {
      const status = (d as Record<string, unknown> | null)?.status as string
      return status ? { label: status, color: 'text-emerald-500 bg-emerald-50' } : { label: 'Pending', color: 'text-amber-500 bg-amber-50' }
    }
  },
  { title: 'Materials', key: 'materials',
    statusFn: () => ({ label: 'Documented', color: 'text-emerald-500 bg-emerald-50' }) },
  { title: 'Characteristics', key: 'characteristics',
    statusFn: () => ({ label: 'Recorded', color: 'text-blue-500 bg-blue-50' }) },
  { title: 'Commercial', key: 'commercial',
    statusFn: () => ({ label: 'Active', color: 'text-emerald-500 bg-emerald-50' }) },
  { title: 'Handling', key: 'handling',
    statusFn: (d) => {
      const applicable = (d as Record<string, unknown> | null)?.applicable as boolean
      return applicable ? { label: 'Applicable', color: 'text-amber-500 bg-amber-50' } : { label: 'N/A', color: 'text-gray-400 bg-gray-50' }
    }
  },
  { title: 'Sources', key: 'sources',
    statusFn: (d) => {
      if (Array.isArray(d)) return { label: `${d.length} Source${d.length !== 1 ? 's' : ''}`, color: 'text-blue-500 bg-blue-50' }
      return { label: '0 Sources', color: 'text-gray-400 bg-gray-50' }
    }
  },
  { title: 'Additional Data', key: 'additionalData',
    statusFn: (d) => {
      if (Array.isArray(d)) return { label: `${d.length} Item${d.length !== 1 ? 's' : ''}`, color: 'text-blue-500 bg-blue-50' }
      if (d && typeof d === 'object') {
        const count = Object.keys(d).length
        return { label: `${count} Item${count !== 1 ? 's' : ''}`, color: 'text-blue-500 bg-blue-50' }
      }
      return { label: '0 Items', color: 'text-gray-400 bg-gray-50' }
    }
  },

  // Vehicle Submodel
  { title: 'Performance', key: 'performance', groupHeader: 'Vehicle Submodel',
    statusFn: (d) => {
      const motorType = (d as Record<string, unknown> | null)?.motorType as string
      if (motorType === 'BEV') return { label: 'BEV', color: 'text-emerald-500 bg-emerald-50' }
      if (motorType === 'ICE') return { label: 'ICE', color: 'text-amber-500 bg-amber-50' }
      return motorType ? { label: motorType, color: 'text-blue-500 bg-blue-50' } : { label: 'N/A', color: 'text-gray-400 bg-gray-50' }
    }
  },
  { title: 'Emissions', key: 'emissions',
    statusFn: () => ({ label: 'Compliant', color: 'text-emerald-500 bg-emerald-50' }) },
  { title: 'State of Health', key: 'stateOfHealth',
    statusFn: (d) => {
      const rating = (d as Record<string, unknown> | null)?.overallRating as number
      if (!rating) return { label: 'N/A', color: 'text-gray-400 bg-gray-50' }
      return rating >= 8 ? { label: `${rating.toFixed(1)} Excellent`, color: 'text-emerald-500 bg-emerald-50' }
        : rating >= 6 ? { label: `${rating.toFixed(1)} Good`, color: 'text-amber-500 bg-amber-50' }
        : { label: `${rating.toFixed(1)} Poor`, color: 'text-red-400 bg-red-50' }
    }
  },
  { title: 'Service History', key: 'serviceHistory',
    statusFn: (d) => {
      const records = (d as Record<string, unknown> | null)?.totalServiceRecords as number
      return records > 0 ? { label: `${records} Records`, color: 'text-blue-500 bg-blue-50' } : { label: 'None', color: 'text-gray-400 bg-gray-50' }
    }
  },
  { title: 'Damage History', key: 'damageHistory',
    statusFn: (d) => {
      const incidents = (d as Record<string, unknown> | null)?.totalIncidents as number
      return incidents > 0 ? { label: `${incidents} Incidents`, color: 'text-amber-500 bg-amber-50' } : { label: 'Clean', color: 'text-emerald-500 bg-emerald-50' }
    }
  },
  { title: 'Ownership Chain', key: 'ownershipChain',
    statusFn: (d) => {
      const owners = (d as Record<string, unknown> | null)?.totalOwners as number
      return owners ? { label: `${owners} Owner${owners !== 1 ? 's' : ''}`, color: 'text-blue-500 bg-blue-50' } : { label: 'Recorded', color: 'text-emerald-500 bg-emerald-50' }
    }
  },
  { title: 'Compliance', key: 'compliance',
    statusFn: () => ({ label: 'Certified', color: 'text-emerald-500 bg-emerald-50' }) },

  // Verifiable Credential
  { title: 'Manufacturer Credential', key: 'credential', groupHeader: 'Verifiable Credential',
    statusFn: (d) => d ? { label: 'Issued', color: 'text-indigo-500 bg-indigo-50' } : { label: 'Missing', color: 'text-red-400 bg-red-50' } },
]

function renderValue(value: unknown): JSX.Element {
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
          <div key={i} className="bg-white border border-gray-100 rounded p-3">
            <p className="text-[10px] text-gray-400 mb-1">#{i + 1}</p>
            {typeof item === 'object' && item !== null ? (
              <div className="space-y-1">
                {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-[10px] text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="text-xs text-right">{renderValue(v)}</div>
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
      <div className="bg-white border border-gray-100 rounded p-3 mt-1 space-y-1.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <span className="text-[10px] text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
            <div className="text-xs text-right">{renderValue(v)}</div>
          </div>
        ))}
      </div>
    )
  }
  return <span>{String(value)}</span>
}

export default function CarDPP() {
  const { vin } = useParams<{ vin: string }>()
  const navigate = useNavigate()
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [car, setCar] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Set<number>>(new Set(Array.from({ length: sections.length }, (_, i) => i)))

  useEffect(() => {
    api.get(`${API_BASE}/cars/${vin}`).then(r => { setCar(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [vin])

  const toggleSection = (i: number) => {
    setOpenSections(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next })
  }
  const expandAll = () => setOpenSections(new Set(Array.from({ length: sections.length }, (_, i) => i)))
  const collapseAll = () => setOpenSections(new Set())

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div></div>
  if (!car) return <div className="p-8 text-center text-gray-400">Car not found</div>

  const dpp = car.dpp as Record<string, unknown> | undefined
  const aas = car.aas as Record<string, unknown> | undefined

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-block">&larr; Back to Fleet</button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{String(car.year)} &middot; {String(car.variant)}</p>
            <h1 className="text-2xl font-semibold text-gray-900">{String(car.make)} {String(car.model)}</h1>
            <p className="text-xs text-gray-300 font-mono mt-1">{String(car.vin)}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">&euro;{(car.price as number)?.toLocaleString()}</p>
            <span className={`inline-block mt-1 text-[10px] font-medium uppercase px-2 py-0.5 rounded ${
              car.status === 'available' ? 'text-emerald-500 bg-emerald-50' : 'text-gray-400 bg-gray-50'
            }`}>{String(car.status)}</span>
            {car.ownerId ? <p className="text-[10px] text-gray-400 mt-1">Owner: {String(car.ownerId)}</p> : null}
            <button
              onClick={() => navigate('/create', { state: { duplicateFrom: car } })}
              className="mt-2 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Duplicate DPP
            </button>
          </div>
        </div>

        {/* AAS Info */}
        {aas && (
          <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] text-indigo-400 uppercase tracking-wide">AAS Global Asset ID</p>
                <p className="text-xs text-indigo-700 font-mono">{String((aas as Record<string, unknown>).globalAssetId || 'N/A')}</p>
              </div>
              <div>
                <p className="text-[10px] text-indigo-400 uppercase tracking-wide">BPNL</p>
                <p className="text-xs text-indigo-700 font-mono">{String((aas as Record<string, unknown>).specificAssetIds ? ((aas.specificAssetIds as Array<Record<string, unknown>>)?.find(a => a.name === 'manufacturerId')?.value || 'N/A') : (aas as Record<string, unknown>).bpnl || 'N/A')}</p>
              </div>
            </div>
            <span className="text-[10px] text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded font-medium">Asset Administration Shell</span>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mt-6">
          {[
            { label: 'Condition', value: `${((dpp?.stateOfHealth as Record<string, unknown> | undefined)?.overallRating as number)?.toFixed(1) || 'N/A'}/10` },
            { label: 'Incidents', value: String((dpp?.damageHistory as Record<string, unknown> | undefined)?.totalIncidents ?? 0) },
            { label: 'Services', value: String((dpp?.serviceHistory as Record<string, unknown> | undefined)?.totalServiceRecords ?? 0) },
            { label: 'Motor', value: ((dpp?.performance as Record<string, unknown> | undefined)?.motorType as string) || 'ICE' },
          ].map((s, i) => (
            <div key={i} className="bg-gray-50 rounded p-3 text-center">
              <p className="text-sm font-medium text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* DPP Sections */}
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-500">Digital Product Passport</p>
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-[10px] text-blue-500 hover:text-blue-700">Expand All</button>
            <button onClick={collapseAll} className="text-[10px] text-gray-400 hover:text-gray-600">Collapse All</button>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {sections.map((section, i) => {
            const sectionData = dpp?.[section.key] as Record<string, unknown> | undefined
            const status = section.statusFn ? section.statusFn(sectionData as Record<string, unknown>) : null
            const isOpen = openSections.has(i)

            return (
              <div key={i}>
                {/* Group Header */}
                {section.groupHeader && (
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{section.groupHeader}</p>
                  </div>
                )}

                <button
                  onClick={() => toggleSection(i)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-700">{i + 1}. {section.title}</span>
                    {status && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${status.color}`}>{status.label}</span>}
                  </div>
                  <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                {isOpen && sectionData && (
                  <div className="px-5 pb-4">
                    <div className="bg-gray-50 rounded p-4 space-y-2">
                      {typeof sectionData === 'object' && !Array.isArray(sectionData) ? (
                        Object.entries(sectionData).map(([k, v]) => (
                          <div key={k} className="flex gap-4">
                            <span className="text-[10px] text-gray-400 w-40 flex-shrink-0 pt-0.5 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <div className="text-xs text-gray-600 flex-1">
                              {renderValue(v)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-gray-600">{renderValue(sectionData)}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
