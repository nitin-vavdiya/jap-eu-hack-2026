import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'
import { calculatePremium } from '../lib/premiumCalculator'

interface StepData {
  step: number
  totalSteps: number
  name: string
  status: 'running' | 'completed' | 'failed'
  durationMs?: number
  details?: Record<string, unknown>
}

const STEP_LABELS = [
  { name: 'Query Partner Catalog', desc: 'Discovering available assets from Toyota connector' },
  { name: 'Initiate Contract Negotiation', desc: 'Proposing ODRL contract with provider' },
  { name: 'Wait for Agreement Finalization', desc: 'Awaiting mutual contract agreement via IDSA protocol' },
  { name: 'Initiate Data Transfer', desc: 'Requesting HttpData-PULL transfer' },
  { name: 'Get Transfer Process (EDR)', desc: 'Obtaining Endpoint Data Reference from connector' },
  { name: 'Obtain Authorization Token', desc: 'Retrieving secure data plane access token' },
  { name: 'Fetch DPP Data from Data Plane', desc: 'Downloading Digital Product Passport via data plane' },
]

function EdcNegotiationStepper({ steps, error, done, onContinue }: { steps: StepData[]; error: string; done: boolean; onContinue?: () => void }) {
  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">EDC Data Exchange</h2>
        <p className="text-xs text-gray-400">Sovereign data negotiation between Tokio Marine &amp; Toyota</p>
      </div>

      {/* Party badges */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
          <div className="w-5 h-5 bg-[#FBBC05] rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-[8px]">TM</span>
          </div>
          <span className="text-[10px] font-medium text-amber-800">Tokio Marine</span>
          <span className="text-[9px] text-amber-500">Consumer</span>
        </div>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <div className="w-5 h-5 bg-[#1A47A0] rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-[8px]">T</span>
          </div>
          <span className="text-[10px] font-medium text-blue-800">Toyota</span>
          <span className="text-[9px] text-blue-500">Provider</span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-1">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const stepData = steps.find(s => s.step === stepNum)
          const status = stepData?.status || 'pending'
          const isActive = status === 'running'
          const isComplete = status === 'completed'
          const isFailed = status === 'failed'

          return (
            <div key={stepNum} className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-300 ${isActive ? 'bg-orange-50 border border-orange-200' : isComplete ? 'bg-emerald-50/50' : isFailed ? 'bg-red-50 border border-red-200' : 'opacity-40'}`}>
              {/* Step indicator */}
              <div className="flex-shrink-0 mt-0.5">
                {isActive ? (
                  <div className="w-6 h-6 rounded-full border-2 border-orange-400 flex items-center justify-center">
                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
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

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-medium ${isActive ? 'text-orange-800' : isComplete ? 'text-emerald-800' : isFailed ? 'text-red-800' : 'text-gray-400'}`}>
                    Step {stepNum}: {label.name}
                  </p>
                  {stepData?.durationMs != null && (
                    <span className="text-[10px] text-gray-400 font-mono ml-2 flex-shrink-0">{(stepData.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
                <p className={`text-[10px] mt-0.5 ${isActive ? 'text-orange-600' : isComplete ? 'text-emerald-600' : isFailed ? 'text-red-500' : 'text-gray-300'}`}>
                  {label.desc}
                </p>
                {/* Show key details */}
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

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600 font-medium">Negotiation Failed</p>
          <p className="text-[10px] text-red-500 mt-1">{error}</p>
        </div>
      )}

      {/* Protocol badge */}
      <div className="mt-6 flex items-center justify-center gap-2">
        <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">IDSA Dataspace Protocol</span>
        <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">ODRL Policy</span>
        <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">HttpData-PULL</span>
      </div>

      {/* Success + Continue */}
      {done && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-lg mb-4">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <span className="text-xs font-medium text-emerald-800">Sovereign data exchange completed successfully</span>
          </div>
          <br />
          <button
            onClick={onContinue}
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-lg text-sm font-medium transition-colors"
          >
            View Insurance Quote &rarr;
          </button>
        </div>
      )}
    </div>
  )
}

export default function QuotePage() {
  const { vin } = useParams<{ vin: string }>()
  const navigate = useNavigate()
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [car, setCar] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [issuing, setIssuing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [consentDPP, setConsentDPP] = useState(false)
  const [consentPremium, setConsentPremium] = useState(false)
  const [consentTerms, setConsentTerms] = useState(false)
  const [edcError, setEdcError] = useState('')
  const [steps, setSteps] = useState<StepData[]>([])
  const stepsRef = useRef<StepData[]>([])
  const [showStepper, setShowStepper] = useState(true)
  const [negotiationDone, setNegotiationDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function negotiate() {
      try {
        // Use SSE streaming for real-time step updates
        const response = await fetch(`${getApiBase()}/edc/negotiate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ vin, stream: true, dspUrl: 'https://tata-motors-protocol.tx.the-sense.io/api/v1/dsp', bpnl: 'BPNL00000000024R' }),
        })

        if (!response.ok || !response.body) {
          throw new Error('Failed to start EDC negotiation stream')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentEvent = ''
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
                    // Deduplicate: keep latest status per step
                    .reduce<StepData[]>((acc, s) => {
                      const existing = acc.find(x => x.step === s.step)
                      if (existing) {
                        Object.assign(existing, s)
                      } else {
                        acc.push(s)
                      }
                      return acc
                    }, [])
                  if (!cancelled) setSteps([...stepsRef.current])
                } else if (currentEvent === 'complete') {
                  if (!cancelled) {
                    setCar(data)
                    setNegotiationDone(true)
                  }
                } else if (currentEvent === 'error') {
                  if (!cancelled) {
                    setEdcError(data.error || 'EDC negotiation failed')
                    setLoading(false)
                    setShowStepper(false)
                  }
                }
              } catch { /* ignore parse errors */ }
              currentEvent = ''
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          // Fallback to non-streaming if SSE fails
          try {
            const r = await api.post('/edc/negotiate', { vin, dspUrl: 'https://tata-motors-protocol.tx.the-sense.io/api/v1/dsp', bpnl: 'BPNL00000000024R' })
            if (!cancelled) { setCar(r.data); setLoading(false); setShowStepper(false) }
          } catch (fallbackErr: any) {
            if (!cancelled) {
              const err = fallbackErr as { response?: { data?: { error?: string; details?: string } } }
              setEdcError(err.response?.data?.details || err.response?.data?.error || 'EDC negotiation failed')
              setLoading(false)
            }
          }
        }
      }
    }

    negotiate()
    return () => { cancelled = true }
  }, [vin])

  if (showStepper) return (
    <EdcNegotiationStepper
      steps={steps}
      error={edcError}
      done={negotiationDone}
      onContinue={() => { setShowStepper(false); setLoading(false) }}
    />
  )
  if (edcError) return (
    <div className="max-w-sm mx-auto mt-24 px-6 text-center">
      <p className="text-sm text-red-500 mb-4">EDC Negotiation Failed</p>
      <p className="text-xs text-gray-400 mb-6">{edcError}</p>
      <button onClick={() => navigate('/')} className="text-sm text-orange-500 hover:underline">Try Again</button>
    </div>
  )
  if (!car) return <div className="p-8 text-center text-gray-400">Car not found</div>

  const dpp = car.dpp as Record<string, unknown> | null | undefined
  const premium = calculatePremium(dpp, car.year as number)
  const condition = dpp?.stateOfHealth as Record<string, unknown> | undefined
  const damages = dpp?.damageHistory as Record<string, unknown> | undefined
  const incidents = damages?.incidents as Array<Record<string, unknown>> | undefined
  const carOwnerId = car.ownerId as string || 'mario-sanchez'
  const ownerName = (dpp?.ownershipChain as Record<string, unknown>)?.currentOwner
    ? ((dpp?.ownershipChain as Record<string, unknown>)?.currentOwner as Record<string, unknown>)?.ownerName as string
    : 'Vehicle Owner'

  const handleIssuePolicy = async () => {
    setIssuing(true)
    try {
      const r = await api.post(`/insurance`, {
        userId: carOwnerId, vin,
        coverageType: 'Comprehensive', premiumBreakdown: premium
      })
      navigate(`/policy-success/${(r.data.policy as Record<string, unknown>).policyNumber}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error || 'Failed to issue policy')
      setIssuing(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        New Quote
      </button>

      {/* EDC Exchange badge */}
      <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <div>
          <p className="text-xs font-medium text-emerald-800">Data Obtained via Sovereign EDC Exchange</p>
          <p className="text-[10px] text-emerald-600">Vehicle DPP transferred from Toyota connector using IDSA Dataspace Protocol with ODRL contract agreement</p>
        </div>
      </div>

      {/* Vehicle header */}
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{String(car.year)} &middot; {String(car.variant)}</p>
            <h1 className="text-xl font-semibold text-gray-900">{String(car.make)} {String(car.model)}</h1>
            <p className="text-xs text-gray-300 font-mono mt-1">{String(car.vin)}</p>
            <span className="inline-block mt-2 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">Consent Approved</span>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold text-gray-900">&euro;{premium.total}</p>
            <p className="text-xs text-gray-400">/year</p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-100 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-3 font-medium">Vehicle Condition</p>
          <div className="space-y-2.5">
            {[
              { label: 'Overall', value: (condition?.overallRating as number)?.toFixed(1), color: (condition?.overallRating as number) >= 8 ? 'text-emerald-600' : (condition?.overallRating as number) >= 6 ? 'text-amber-500' : 'text-red-400' },
              { label: 'Exterior', value: (condition?.exteriorCondition as number)?.toFixed(1), color: 'text-gray-700' },
              { label: 'Interior', value: (condition?.interiorCondition as number)?.toFixed(1), color: 'text-gray-700' },
              { label: 'Mechanical', value: (condition?.mechanicalCondition as number)?.toFixed(1), color: 'text-gray-700' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-xs text-gray-400">{row.label}</span>
                <span className={`text-xs font-semibold ${row.color}`}>{row.value}/10</span>
              </div>
            ))}
            {condition?.batteryHealthPercent ? (
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">Battery</span>
                <span className="text-xs font-semibold text-gray-700">{String(condition.batteryHealthPercent)}%</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-3 font-medium">Damage History</p>
          <p className="text-3xl font-semibold text-gray-900">{String(damages?.totalIncidents || 0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">incident{(damages?.totalIncidents as number || 0) !== 1 ? 's' : ''}</p>
          {incidents && incidents.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {incidents.slice(0, 3).map((inc, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    inc.severity === 'Major' ? 'bg-red-100 text-red-500' :
                    inc.severity === 'Moderate' ? 'bg-amber-100 text-amber-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{String(inc.severity)}</span>
                  <span className="text-[10px] text-gray-500">{String(inc.type)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Premium Breakdown */}
      <div className="border border-gray-100 rounded-xl p-5 mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-4">Premium Breakdown</p>
        {[
          { label: 'Base Premium', value: premium.basePremium },
          { label: `Damage (${damages?.totalIncidents || 0} incidents x \u20AC120)`, value: premium.damageAdjustment },
          { label: 'Age Adjustment', value: premium.ageAdjustment },
          { label: `Condition (${(condition?.overallRating as number)?.toFixed(1)}/10)`, value: premium.conditionAdjustment },
          ...(condition?.batteryHealthPercent ? [{ label: `Battery Health (${String(condition.batteryHealthPercent)}%)`, value: premium.batteryHealthAdjustment }] : []),
        ].map((item, i) => (
          <div key={i} className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
            <span className="text-xs text-gray-500">{item.label}</span>
            <span className={`text-xs font-semibold ${item.value > 0 ? 'text-red-500' : item.value < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
              {item.value > 0 ? '+' : ''}&euro;{Math.abs(item.value)}
            </span>
          </div>
        ))}
        <div className="flex justify-between pt-4 mt-2 border-t border-gray-200">
          <span className="text-sm font-semibold text-gray-900">Annual Premium</span>
          <span className="text-lg font-bold text-orange-500">&euro;{premium.total}</span>
        </div>
      </div>

      <button
        onClick={() => setShowConfirm(true)}
        className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3.5 rounded-lg text-sm font-medium transition-colors"
      >
        Get Comprehensive Coverage &mdash; &euro;{premium.total}/year
      </button>
      <p className="text-center text-[10px] text-gray-300 mt-2">Insurance VC issued to {ownerName}'s wallet</p>

      {/* Consent & Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { if (!issuing) { setShowConfirm(false); setConsentDPP(false); setConsentPremium(false); setConsentTerms(false) } }}>
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-1">Consent &amp; Insurance</h3>
              <p className="text-xs text-gray-400 text-center mb-5">Please review and provide your consent before proceeding</p>

              <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Vehicle</span>
                  <span className="text-xs font-medium text-gray-800">{String(car.make)} {String(car.model)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Coverage</span>
                  <span className="text-xs font-medium text-gray-800">Comprehensive</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Duration</span>
                  <span className="text-xs font-medium text-gray-800">1 Year</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium text-gray-700">Annual Premium</span>
                  <span className="text-sm font-bold text-orange-500">&euro;{premium.total}</span>
                </div>
              </div>

              {/* Consent checkboxes */}
              <div className="border border-gray-100 rounded-lg p-4 mb-5 space-y-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-1">Owner Consent Required</p>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={consentDPP} onChange={e => setConsentDPP(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium group-hover:text-gray-900">DPP Data Usage for Risk Assessment</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">I consent to Tokio Marine accessing and using my vehicle's Digital Product Passport data — including damage history, condition ratings, and service records — for premium calculation and risk assessment.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={consentPremium} onChange={e => setConsentPremium(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium group-hover:text-gray-900">Premium &amp; Payment Authorization</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">I authorize the annual premium of &euro;{premium.total} and acknowledge that the premium was calculated transparently from the vehicle's DPP data. I understand this amount may change at renewal.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" checked={consentTerms} onChange={e => setConsentTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                  <div>
                    <p className="text-xs text-gray-700 font-medium group-hover:text-gray-900">Credential Issuance &amp; Terms</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">I agree to the policy terms and consent to an Insurance Verifiable Credential being issued to my SmartSense Wallet, which may be shared with authorized third parties for verification purposes.</p>
                  </div>
                </label>
              </div>

              {!(consentDPP && consentPremium && consentTerms) && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-center">Please check all consent boxes above to proceed with insurance.</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setShowConfirm(false); setConsentDPP(false); setConsentPremium(false); setConsentTerms(false) }} disabled={issuing}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleIssuePolicy} disabled={issuing || !(consentDPP && consentPremium && consentTerms)}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {issuing ? 'Issuing...' : 'Confirm & Issue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
