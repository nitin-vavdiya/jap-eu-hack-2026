import { useState, useEffect } from 'react'
import axios from 'axios'
import { getApiBase } from '@eu-jap-hack/auth'

const API = getApiBase()

interface EdcStep {
  step: number
  name: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  durationMs?: number
  details?: Record<string, unknown>
}

interface EdcTransaction {
  id: string
  vin: string
  consumer: { name: string; bpn: string }
  provider: { name: string; bpn: string; dspUrl: string }
  assetId?: string
  offerId?: string
  negotiationId?: string
  contractAgreementId?: string
  transferId?: string
  status: 'running' | 'completed' | 'failed'
  steps: EdcStep[]
  dataCategories: string[]
  consentId?: string
  requestedBy?: string
  startedAt: string
  completedAt?: string
  totalDurationMs?: number
  error?: string
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    running: 'bg-amber-50 text-amber-700 border-amber-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles[status] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
      {status === 'completed' ? 'Completed' : status === 'running' ? 'In Progress' : 'Failed'}
    </span>
  )
}

function NetworkMap({ transactions }: { transactions: EdcTransaction[] }) {
  const completed = transactions.filter(t => t.status === 'completed').length
  const totalData = transactions.filter(t => t.status === 'completed').reduce((acc, t) => acc + t.dataCategories.length, 0)
  const uniqueVins = new Set(transactions.map(t => t.vin)).size

  return (
    <div className="border border-gray-100 rounded-xl p-6 mb-6 bg-white">
      <h3 className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-5">Dataspace Network</h3>

      {/* Visual network */}
      <div className="flex items-center justify-center gap-4 mb-6">
        {/* Consumer node */}
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-lg shadow-amber-200/50">
            <span className="text-white font-bold text-lg">TM</span>
          </div>
          <p className="text-xs font-semibold text-gray-800">Tokio Marine</p>
          <p className="text-[10px] text-gray-400">Data Consumer</p>
          <p className="text-[9px] text-gray-300 font-mono mt-0.5">BPNL_CONSUMER</p>
        </div>

        {/* Connection line */}
        <div className="flex-1 max-w-xs relative">
          <div className="border-t-2 border-dashed border-gray-200 w-full absolute top-1/2" />
          <div className="flex items-center justify-center relative">
            <div className="bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm z-10">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                <span className="text-[10px] font-medium text-gray-600">{completed} exchanges</span>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-1 mt-2">
            <span className="text-[8px] text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">IDSA DSP</span>
            <span className="text-[8px] text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">ODRL</span>
            <span className="text-[8px] text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">EDC</span>
          </div>
        </div>

        {/* Provider node */}
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-lg shadow-blue-200/50">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <p className="text-xs font-semibold text-gray-800">Toyota</p>
          <p className="text-[10px] text-gray-400">Data Provider</p>
          <p className="text-[9px] text-gray-300 font-mono mt-0.5">{transactions[0]?.provider?.bpn || 'BPNL_PROVIDER'}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Exchanges', value: transactions.length, icon: '↔' },
          { label: 'Successful', value: completed, icon: '✓' },
          { label: 'Unique Vehicles', value: uniqueVins, icon: '🚗' },
          { label: 'Data Fields Shared', value: totalData, icon: '📋' },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
            <p className="text-[10px] text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TransactionDetail({ tx, onClose }: { tx: EdcTransaction; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Data Exchange Details</h3>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{tx.id}</p>
            </div>
            <StatusBadge status={tx.status} />
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-1">Consumer</p>
              <p className="text-xs font-semibold text-amber-900">{tx.consumer.name}</p>
              <p className="text-[10px] text-amber-600 font-mono">{tx.consumer.bpn}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-[10px] text-blue-600 uppercase tracking-wider font-medium mb-1">Provider</p>
              <p className="text-xs font-semibold text-blue-900">{tx.provider.name}</p>
              <p className="text-[10px] text-blue-600 font-mono">{tx.provider.bpn}</p>
            </div>
          </div>

          {/* Key Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-2">
            {[
              { label: 'VIN', value: tx.vin },
              { label: 'Asset ID', value: tx.assetId },
              { label: 'Contract Agreement', value: tx.contractAgreementId },
              { label: 'Transfer ID', value: tx.transferId },
              { label: 'Duration', value: tx.totalDurationMs ? `${(tx.totalDurationMs / 1000).toFixed(1)}s` : 'N/A' },
              { label: 'Started', value: new Date(tx.startedAt).toLocaleString() },
              { label: 'Requested By', value: tx.requestedBy || 'N/A' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-xs text-gray-400">{row.label}</span>
                <span className="text-xs font-medium text-gray-800 font-mono text-right max-w-[60%] truncate">{row.value || 'N/A'}</span>
              </div>
            ))}
          </div>

          {/* Data Categories */}
          <div className="mb-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-2">Data Categories Exchanged</p>
            <div className="flex flex-wrap gap-1.5">
              {tx.dataCategories.map((cat, i) => (
                <span key={i} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{cat}</span>
              ))}
            </div>
          </div>

          {/* Negotiation Steps */}
          <div className="mb-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">Negotiation Steps</p>
            <div className="space-y-1.5">
              {tx.steps.map((step, i) => (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${step.status === 'completed' ? 'bg-emerald-50/50' : step.status === 'failed' ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${step.status === 'completed' ? 'bg-emerald-500' : step.status === 'failed' ? 'bg-red-500' : 'bg-amber-400'}`}>
                    {step.status === 'completed' ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    ) : step.status === 'failed' ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-700">{step.name}</p>
                  </div>
                  {step.durationMs != null && (
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{(step.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sovereignty Proof */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-5">
            <p className="text-[10px] text-indigo-600 uppercase tracking-widest font-medium mb-2">Data Sovereignty Proof</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-indigo-800">Owner consent obtained before data access</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-indigo-800">ODRL contract negotiated between connectors</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-indigo-800">Data transferred via secure EDC data plane</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-indigo-800">Both organizations Gaia-X compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span className="text-indigo-800">Full audit trail with step-level timestamps</span>
              </div>
            </div>
          </div>

          <button onClick={onClose} className="w-full border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DataExchangeDashboard() {
  const [transactions, setTransactions] = useState<EdcTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTx, setSelectedTx] = useState<EdcTransaction | null>(null)

  useEffect(() => {
    axios.get(`${API}/edc/transactions`)
      .then(r => { setTransactions(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-5 h-5 border-2 border-[#4285F4] border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Data Exchange Dashboard</h1>
        <p className="text-xs text-gray-400">Transparent audit trail of all sovereign data exchanges via Eclipse Dataspace Connector</p>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">No data exchanges yet</p>
          <p className="text-xs text-gray-400">EDC transactions will appear here when insurance quotes are generated via the Insurance Portal</p>
        </div>
      ) : (
        <>
          <NetworkMap transactions={transactions} />

          {/* Transaction History */}
          <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs text-gray-400 uppercase tracking-widest font-medium">Exchange History</h3>
              <span className="text-[10px] text-gray-300">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {transactions.map(tx => (
                <button
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-[#FBBC05] rounded flex items-center justify-center">
                          <span className="text-white font-bold text-[7px]">TM</span>
                        </div>
                        <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        <div className="w-5 h-5 bg-[#1A47A0] rounded flex items-center justify-center">
                          <span className="text-white font-bold text-[7px]">T</span>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-800">VIN: {tx.vin}</span>
                      {tx.assetId && <span className="text-[10px] text-gray-400 font-mono">{tx.assetId}</span>}
                    </div>
                    <StatusBadge status={tx.status} />
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-gray-400">
                    <span>{new Date(tx.startedAt).toLocaleString()}</span>
                    {tx.totalDurationMs && <span>{(tx.totalDurationMs / 1000).toFixed(1)}s</span>}
                    <span>{tx.steps.filter(s => s.status === 'completed').length}/7 steps</span>
                    {tx.contractAgreementId && (
                      <span className="font-mono">Contract: {tx.contractAgreementId.slice(0, 12)}...</span>
                    )}
                  </div>
                  {/* Data category pills */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tx.dataCategories.map((cat, i) => (
                      <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{cat}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="mt-6 border border-gray-100 rounded-xl p-5 bg-white">
            <h3 className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-4">How Sovereign Data Exchange Works</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  title: 'Consent First',
                  desc: 'Vehicle owner explicitly approves data access in their wallet before any exchange begins.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
                },
                {
                  title: 'Contract Negotiated',
                  desc: 'EDC connectors negotiate ODRL-based contracts defining exactly what data can be shared and under what terms.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
                },
                {
                  title: 'Secure Transfer',
                  desc: 'Data flows through the EDC data plane with time-limited authorization tokens. No direct API access.',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
                },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className="w-10 h-10 bg-[#4285F4]/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <svg className="w-5 h-5 text-[#4285F4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">{item.icon}</svg>
                  </div>
                  <p className="text-xs font-medium text-gray-800 mb-1">{item.title}</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {selectedTx && <TransactionDetail tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  )
}
