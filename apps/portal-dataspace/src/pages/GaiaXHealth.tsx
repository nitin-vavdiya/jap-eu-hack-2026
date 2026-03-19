import { useState, useEffect } from 'react'
import { useAuthUser, createAuthAxios } from '@eu-jap-hack/auth'

const API = 'http://localhost:8000/api'

interface EndpointHealth {
  endpointSet: string
  compliance: { healthy: boolean; latencyMs: number; error?: string }
  registry: { healthy: boolean; latencyMs: number; error?: string }
  notary: { healthy: boolean; latencyMs: number; error?: string }
  overall: boolean; checkedAt: string
}

export default function GaiaXHealth() {
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [health, setHealth] = useState<{ endpointSets: EndpointHealth[]; selectedEndpointSet: string | null; mockMode: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)
  const [testing, setTesting] = useState(false)

  const check = () => { setLoading(true); api.get(`${API}/gaiax/health`).then(r => { setHealth(r.data); setLoading(false) }).catch(() => setLoading(false)) }
  useEffect(() => { check() }, [])

  const runTest = async () => {
    setTesting(true); setTestResult(null)
    try { const r = await api.post(`${API}/org-credentials/test-verification`, {}); setTestResult(r.data) }
    catch (e: unknown) { const err = e as { response?: { data?: Record<string, unknown> } }; setTestResult(err.response?.data || { success: false, error: 'Failed' }) }
    setTesting(false)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-xl font-semibold text-[#1F1F1F]">Gaia-X Endpoint Status</h1><p className="text-sm text-[#5F6368] mt-1">Health checks for Loire trust framework</p></div>
        <div className="flex gap-2">
          <button onClick={check} className="border border-[#E5EAF0] text-[#5F6368] hover:bg-[#F1F3F6] px-4 py-2 rounded-lg text-sm font-medium transition-colors">Refresh</button>
          <button onClick={runTest} disabled={testing} className="bg-[#4285F4] hover:bg-[#3367D6] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all">{testing ? 'Running...' : 'Test Verification'}</button>
        </div>
      </div>

      {health?.mockMode && (
        <div className="bg-[#FEF7E0] border border-[#FBBC05]/30 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-[#F59E0B]">Mock Mode Active</p>
          <p className="text-xs text-[#5F6368] mt-0.5">Set GAIAX_MOCK_MODE=false to use live endpoints</p>
        </div>
      )}

      {loading ? <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full animate-spin" /></div> : health?.endpointSets?.map((ep, i) => (
        <div key={i} className={`bg-white border rounded-xl p-5 mb-4 ${health.selectedEndpointSet === ep.endpointSet ? 'border-[#4285F4] shadow-sm' : 'border-[#E5EAF0]'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${ep.overall ? 'bg-[#34A853]' : 'bg-[#EA4335]'}`} />
              <div>
                <p className="text-sm font-semibold text-[#1F1F1F]">{ep.endpointSet}</p>
                {health.selectedEndpointSet === ep.endpointSet && <span className="text-[10px] text-[#4285F4] font-medium bg-[#E8F0FE] px-2 py-0.5 rounded-full">Selected</span>}
              </div>
            </div>
            <span className="text-[10px] text-[#9AA0A6]">{new Date(ep.checkedAt).toLocaleTimeString()}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Compliance', ...ep.compliance }, { label: 'Registry', ...ep.registry }, { label: 'Notary', ...ep.notary }].map((svc, j) => (
              <div key={j} className={`p-3 rounded-lg border ${svc.healthy ? 'bg-[#E6F4EA] border-[#34A853]/20' : 'bg-[#FCE8E6] border-[#EA4335]/20'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#1F1F1F]">{svc.label}</span>
                  <span className={`text-[10px] font-mono ${svc.healthy ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{svc.latencyMs}ms</span>
                </div>
                {svc.error && <p className="text-[10px] text-[#EA4335] mt-1 truncate">{svc.error}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {testResult && (
        <div className={`mt-6 rounded-xl border p-5 ${testResult.success ? 'bg-[#E6F4EA] border-[#34A853]/30' : 'bg-[#FCE8E6] border-[#EA4335]/30'}`}>
          <p className={`text-sm font-semibold ${testResult.success ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>Test {testResult.success ? 'Passed' : 'Failed'}</p>
          <pre className="mt-2 text-xs font-mono text-[#5F6368] overflow-auto max-h-48">{JSON.stringify(testResult, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
