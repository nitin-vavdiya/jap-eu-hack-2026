import { useState, useRef, useMemo } from 'react'
import { useAuthUser, getApiBase } from '@eu-jap-hack/auth'

interface StepData {
  step: number
  totalSteps: number
  name: string
  status: 'running' | 'completed' | 'failed'
  durationMs?: number
  details?: Record<string, unknown>
}

interface WellRecord {
  X: string
  Y: string
  TINWSF_IS_NUMBER: string
  WSID: string
  SystemName: string
  SystemType: string
  SystemStatus: string
  SystemPopulation: string
  FacilityName: string
  FacilityID: string
  FacilityStatus: string
  Availability: string
  WaterType: string
  ConstructedDate: string
  PermittedYield: string
  WellType: string
  Diameter_in: string
  WellDepth: string
  CasingDepth: string
  StaticWaterLevel: string
}

const STEP_LABELS = [
  { name: 'Query Partner Catalog', desc: 'Discovering available assets from partner connector' },
  { name: 'Initiate Contract Negotiation', desc: 'Proposing ODRL contract with provider' },
  { name: 'Wait for Agreement Finalization', desc: 'Awaiting mutual contract agreement via IDSA protocol' },
  { name: 'Initiate Data Transfer', desc: 'Requesting HttpData-PULL transfer' },
  { name: 'Get Transfer Process (EDR)', desc: 'Obtaining Endpoint Data Reference from connector' },
  { name: 'Obtain Authorization Token', desc: 'Retrieving secure data plane access token' },
  { name: 'Fetch Data from Data Plane', desc: 'Downloading data asset via data plane' },
]

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  A: { label: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  I: { label: 'Inactive', color: 'bg-gray-100 text-gray-600' },
  P: { label: 'Proposed', color: 'bg-blue-100 text-blue-700' },
}

const PAGE_SIZE = 25

function StepperView({ steps, error, done, totalDurationMs }: { steps: StepData[]; error: string; done: boolean; totalDurationMs: number }) {
  return (
    <div className="max-w-2xl mx-auto mb-8">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-[#4285F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">CADDE Data Exchange</h2>
        <p className="text-xs text-gray-400">Sovereign data transfer via EDC / CADDE protocol</p>
      </div>

      <div className="space-y-1">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const stepData = steps.find(s => s.step === stepNum)
          const status = stepData?.status || 'pending'
          const isActive = status === 'running'
          const isComplete = status === 'completed'
          const isFailed = status === 'failed'

          return (
            <div key={stepNum} className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-300 ${isActive ? 'bg-blue-50 border border-blue-200' : isComplete ? 'bg-emerald-50/50' : isFailed ? 'bg-red-50 border border-red-200' : 'opacity-40'}`}>
              <div className="flex-shrink-0 mt-0.5">
                {isActive ? (
                  <div className="w-6 h-6 rounded-full border-2 border-[#4285F4] flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#4285F4] rounded-full animate-pulse" />
                  </div>
                ) : isComplete ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </div>
                ) : isFailed ? (
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-200 flex items-center justify-center">
                    <span className="text-[9px] text-gray-300 font-semibold">{stepNum}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-medium ${isActive ? 'text-blue-800' : isComplete ? 'text-emerald-800' : isFailed ? 'text-red-800' : 'text-gray-400'}`}>
                    Step {stepNum}: {label.name}
                  </p>
                  {stepData?.durationMs != null && (
                    <span className="text-[10px] text-gray-400 font-mono ml-2 flex-shrink-0">{(stepData.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
                <p className={`text-[10px] mt-0.5 ${isActive ? 'text-blue-600' : isComplete ? 'text-emerald-600' : isFailed ? 'text-red-500' : 'text-gray-300'}`}>
                  {label.desc}
                </p>
                {isComplete && stepData?.details && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(stepData.details).map(([k, v]) => (
                      <span key={k} className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
                        {k}: {String(v).length > 24 ? String(v).slice(0, 24) + '...' : String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-2 mt-4">
        <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">IDSA Dataspace Protocol</span>
        <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">ODRL Policy</span>
        <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">HttpData-PULL</span>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600 font-medium">Transfer Failed</p>
          <p className="text-[10px] text-red-500 mt-1">{error}</p>
        </div>
      )}

      {done && (
        <div className="text-center mt-4">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-lg">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <span className="text-xs font-medium text-emerald-800">Data transfer completed in {(totalDurationMs / 1000).toFixed(1)}s</span>
          </div>
        </div>
      )}
    </div>
  )
}

function DataView({ data, onReset }: { data: WellRecord[]; onReset: () => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    let result = data
    if (statusFilter !== 'all') {
      result = result.filter(r => r.SystemStatus.trim() === statusFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.SystemName.toLowerCase().includes(q) ||
        r.WSID.toLowerCase().includes(q) ||
        r.FacilityName.toLowerCase().includes(q) ||
        r.WellType.toLowerCase().includes(q)
      )
    }
    return result
  }, [data, search, statusFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    data.forEach(r => {
      const s = r.SystemStatus.trim()
      counts[s] = (counts[s] || 0) + 1
    })
    return counts
  }, [data])

  const wellTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    data.forEach(r => {
      const t = r.WellType.trim() || 'Unknown'
      counts[t] = (counts[t] || 0) + 1
    })
    return counts
  }, [data])

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Total Records</p>
          <p className="text-2xl font-bold text-[#1F1F1F]">{data.length.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Active Systems</p>
          <p className="text-2xl font-bold text-emerald-600">{statusCounts['A'] || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Inactive Systems</p>
          <p className="text-2xl font-bold text-gray-400">{statusCounts['I'] || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Well Types</p>
          <p className="text-2xl font-bold text-[#4285F4]">{Object.keys(wellTypeCounts).length}</p>
        </div>
      </div>

      {/* Well type breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-medium text-gray-700 mb-3">Well Types</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(wellTypeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <span key={type} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full">
              {type}: <span className="font-semibold">{count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name, ID, facility, or type..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 w-72 focus:outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]/20"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#4285F4]"
          >
            <option value="all">All Status</option>
            <option value="A">Active</option>
            <option value="I">Inactive</option>
            <option value="P">Proposed</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`text-[10px] px-3 py-1.5 rounded-lg font-medium transition-colors ${viewMode === 'table' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={`text-[10px] px-3 py-1.5 rounded-lg font-medium transition-colors ${viewMode === 'json' ? 'bg-[#4285F4] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            JSON
          </button>
          <button onClick={onReset} className="text-[10px] text-[#4285F4] hover:underline ml-2">
            Run Again
          </button>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 mb-3">
        Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} records
        {filtered.length !== data.length && <span> (filtered from {data.length.toLocaleString()})</span>}
      </p>

      {viewMode === 'json' ? (
        <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[600px]">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
            {JSON.stringify(pageData, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">System</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">WSID</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Facility</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Well Type</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Population</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Water</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Depth</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Diameter</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Static Water Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageData.map((r, i) => {
                  const statusKey = r.SystemStatus.trim()
                  const statusInfo = STATUS_LABELS[statusKey] || { label: statusKey, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-[#1F1F1F] truncate max-w-[180px]">{r.SystemName.trim()}</p>
                        <p className="text-[10px] text-gray-400">#{r.TINWSF_IS_NUMBER}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono">{r.WSID}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-700 truncate max-w-[160px]">{r.FacilityName.trim()}</p>
                        <p className="text-[10px] text-gray-400">{r.FacilityID}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.WellType.trim() || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 text-right">{r.SystemPopulation || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.WaterType.trim() || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.WellDepth.trim() || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.Diameter_in ? `${r.Diameter_in}"` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.StaticWaterLevel.trim() || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) {
                pageNum = i + 1
              } else if (page <= 4) {
                pageNum = i + 1
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i
              } else {
                pageNum = page - 3 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`text-[10px] w-7 h-7 rounded-lg font-medium transition-colors ${page === pageNum ? 'bg-[#4285F4] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  {pageNum}
                </button>
              )
            })}
            {totalPages > 7 && page < totalPages - 3 && (
              <>
                <span className="text-gray-300 text-xs">...</span>
                <button onClick={() => setPage(totalPages)} className="text-[10px] w-7 h-7 rounded-lg text-gray-500 hover:bg-gray-100">{totalPages}</button>
              </>
            )}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default function CaddePage() {
  const { accessToken } = useAuthUser()
  const [started, setStarted] = useState(false)
  const [steps, setSteps] = useState<StepData[]>([])
  const stepsRef = useRef<StepData[]>([])
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<WellRecord[] | null>(null)
  const [totalDurationMs, setTotalDurationMs] = useState(0)

  async function handleTestCadde() {
    setStarted(true)
    setError('')
    setDone(false)
    setResult(null)
    setSteps([])
    stepsRef.current = []
    const startTime = Date.now()

    try {
      const response = await fetch(`${getApiBase()}/cadde/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ stream: true }),
      })

      if (!response.ok || !response.body) {
        const errBody = await response.json().catch(() => null)
        throw new Error(errBody?.error || errBody?.details || 'Failed to start CADDE transfer')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6))
              if (currentEvent === 'step') {
                const stepUpdate = data as StepData
                stepsRef.current = [...stepsRef.current.filter(s => !(s.step === stepUpdate.step && stepUpdate.status !== 'running')), stepUpdate]
                  .sort((a, b) => a.step - b.step)
                  .reduce<StepData[]>((acc, s) => {
                    const existing = acc.find(x => x.step === s.step)
                    if (existing) {
                      Object.assign(existing, s)
                    } else {
                      acc.push(s)
                    }
                    return acc
                  }, [])
                setSteps([...stepsRef.current])
              } else if (currentEvent === 'complete') {
                setTotalDurationMs(Date.now() - startTime)
                setResult(Array.isArray(data) ? data : [data])
                setDone(true)
              } else if (currentEvent === 'error') {
                setError(data.error || 'CADDE transfer failed')
              }
            } catch { /* incomplete data line, will retry when more chunks arrive */ }
            currentEvent = ''
          }
        }
      }
    } catch (e: any) {
      setError(e.message || 'CADDE transfer failed')
    }
  }

  function handleReset() {
    setStarted(false)
    setDone(false)
    setResult(null)
    setSteps([])
    setError('')
    setTotalDurationMs(0)
  }

  if (!started) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold text-[#1F1F1F] mb-2">CADDE</h1>
        <p className="text-sm text-[#5F6368] mb-8">Test data transfer via EDC / CADDE protocol</p>
        <button
          onClick={handleTestCadde}
          className="bg-[#4285F4] hover:bg-[#3367D6] text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
        >
          Test CADDE
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <StepperView steps={steps} error={error} done={done} totalDurationMs={totalDurationMs} />

      {error && !done && (
        <div className="text-center mt-4">
          <button onClick={handleReset} className="text-xs text-[#4285F4] hover:underline">
            Try Again
          </button>
        </div>
      )}

      {done && result && (
        <div className="mt-8">
          <DataView data={result} onReset={handleReset} />
        </div>
      )}
    </div>
  )
}
