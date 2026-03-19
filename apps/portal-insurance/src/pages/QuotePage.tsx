import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios } from '@eu-jap-hack/auth'
import { calculatePremium } from '../lib/premiumCalculator'

const API_BASE = 'http://localhost:8000/api'

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

  useEffect(() => {
    axios.get(`${API_BASE}/cars/${vin}`).then(r => { setCar(r.data); setLoading(false) })
  }, [vin])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full"></div></div>
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
                    <p className="text-[11px] text-gray-400 mt-0.5">I consent to Digit Insurance accessing and using my vehicle's Digital Product Passport data — including damage history, condition ratings, and service records — for premium calculation and risk assessment.</p>
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
