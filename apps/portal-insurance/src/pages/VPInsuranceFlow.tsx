import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios, getApiBase, getPortalWalletUrl } from '@eu-jap-hack/auth'
import { calculatePremium } from '../lib/premiumCalculator'

const API_BASE = getApiBase()

type Screen = 'start' | 'present' | 'verify' | 'quote'

interface SessionStep {
  step: number
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  description?: string
  durationMs?: number
  details?: Record<string, unknown>
}

interface SessionData {
  sessionId: string
  requestId: string
  status: 'waiting' | 'processing' | 'completed' | 'failed'
  steps?: SessionStep[]
  vehicleData?: Record<string, unknown>
  error?: string
  verifierName?: string
  nonce?: string
  expectedCredentialTypes?: string[]
  purpose?: string
  expiresAt?: string
  issuerDid?: string
}

const VP_STEP_LABELS = [
  { name: 'VP Received & Parsed', desc: 'Decoding and parsing the Verifiable Presentation token' },
  { name: 'Credentials Extracted from VP', desc: 'Identifying credential types, issuer, and vehicle reference' },
  { name: 'VP Signature & Structure Validated', desc: 'Validating proof signature, challenge nonce, and credential freshness' },
  { name: 'Issuer DID Resolved', desc: 'Resolving issuer DID document from decentralized registry' },
  { name: 'DataService Endpoint Discovered', desc: 'Finding EDC DataService entry in issuer DID document' },
  { name: 'DSP URL & Provider BPNL Extracted', desc: 'Parsing DSP protocol URL and Business Partner Number from DID' },
  { name: 'EDC Catalog Queried', desc: 'Querying provider connector catalog for vehicle asset' },
  { name: 'Contract Negotiation Initiated', desc: 'Proposing ODRL contract with provider via IDSA protocol' },
  { name: 'Agreement Finalized', desc: 'Mutual contract agreement reached between consumer and provider' },
  { name: 'Data Transfer via EDC', desc: 'HttpData-PULL transfer, EDR retrieval, and auth token obtained' },
  { name: 'Vehicle DPP Data Received', desc: 'Digital Product Passport data received through EDC data plane' },
]

export default function VPInsuranceFlow() {
  const navigate = useNavigate()
  const { accessToken, userId } = useAuthUser()
  const api = createAuthAxios(() => accessToken)

  const [screen, setScreen] = useState<Screen>('start')

  // Screen 1 state
  const [vinInput, setVinInput] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')

  // Screen 2 state
  const [requestId, setRequestId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [qrData, setQrData] = useState('')
  const [verifierName, setVerifierName] = useState('Digit Insurance')
  const [nonce, setNonce] = useState('')
  const [expectedTypes, setExpectedTypes] = useState<string[]>([])
  const [purpose, setPurpose] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [showDebug, setShowDebug] = useState(false)
  const [manualVP, setManualVP] = useState('')
  const [submittingVP, setSubmittingVP] = useState(false)
  const [vpSubmitError, setVpSubmitError] = useState('')
  const [vpSubmitSuccess, setVpSubmitSuccess] = useState(false)

  // Screen 3 state
  const [steps, setSteps] = useState<SessionStep[]>([])
  const [sessionStatus, setSessionStatus] = useState<string>('waiting')
  const [sessionError, setSessionError] = useState('')
  const [issuerDid, setIssuerDid] = useState('')

  // Quote state
  const [car, setCar] = useState<Record<string, unknown> | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [consentDPP, setConsentDPP] = useState(false)
  const [consentPremium, setConsentPremium] = useState(false)
  const [consentTerms, setConsentTerms] = useState(false)

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [expiryCountdown, setExpiryCountdown] = useState('')

  // Extract VIN from Car ID URL or use as-is
  const extractVin = (input: string): string => {
    const trimmed = input.trim()
    const match = trimmed.match(/\/vehicles\/([A-Z0-9]+)$/i)
    if (match) return match[1]
    return trimmed
  }

  // Screen 1: Request presentation
  const handleRequestProof = async () => {
    if (!vinInput.trim()) return
    setRequesting(true)
    setRequestError('')

    const vin = extractVin(vinInput)

    try {
      const resp = await api.post('/verifier/presentation-request', { vin })
      const data = resp.data

      setRequestId(data.id || data.requestId || data.request_id || '')
      setSessionId(data.sessionId || data.session_id || '')
      setQrData(data.qrData || data.qr_data || '')
      setVerifierName(data.verifierName || data.verifier_name || 'Digit Insurance')
      setNonce(data.nonce || '')
      setExpectedTypes(data.expectedCredentialTypes || data.expected_credential_types || ['VehicleOwnershipCredential'])
      setPurpose(data.purpose || 'Insurance premium calculation based on vehicle condition and history')
      setExpiresAt(data.expiresAt || data.expires_at || '')

      setScreen('present')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; details?: string } } }
      setRequestError(err.response?.data?.details || err.response?.data?.error || 'Failed to create presentation request.')
    }
    setRequesting(false)
  }

  // Submit pasted VP
  const handleSubmitVP = async () => {
    if (!manualVP.trim()) return
    setSubmittingVP(true)
    setVpSubmitError('')
    setVpSubmitSuccess(false)
    try {
      let vpToken: unknown
      try {
        vpToken = JSON.parse(manualVP.trim())
      } catch {
        vpToken = manualVP.trim() // treat as JWT string
      }
      await axios.post(`${API_BASE}/verifier/callback`, {
        requestId,
        vpToken,
      })
      setVpSubmitSuccess(true)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setVpSubmitError(err.response?.data?.error || err.message || 'Failed to submit VP')
    }
    setSubmittingVP(false)
  }

  // Poll session
  const pollSession = useCallback(async () => {
    if (!sessionId) return
    try {
      const resp = await api.get(`/verifier/session/${sessionId}`)
      const data: SessionData = resp.data

      setSessionStatus(data.status)

      if (data.steps) {
        setSteps(data.steps)
      }

      if (data.issuerDid) {
        setIssuerDid(data.issuerDid)
      }

      if (data.error) {
        setSessionError(data.error)
      }

      // Transition from present to verify when processing starts
      if (screen === 'present' && (data.status === 'processing' || data.status === 'completed' || data.status === 'failed')) {
        setScreen('verify')
      }

      // If completed, store vehicle data
      if (data.status === 'completed' && data.vehicleData) {
        setCar(data.vehicleData)
      }

      // Stop polling when done
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch {
      // ignore polling errors
    }
  }, [sessionId, screen, api])

  useEffect(() => {
    if ((screen === 'present' || screen === 'verify') && sessionId) {
      pollRef.current = setInterval(pollSession, 1500)
      // Also poll immediately
      pollSession()
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }
  }, [screen, sessionId, pollSession])

  // Expiry countdown timer
  useEffect(() => {
    if (!expiresAt || screen !== 'present') {
      setExpiryCountdown('')
      return
    }

    const updateCountdown = () => {
      const now = Date.now()
      const expiry = new Date(expiresAt).getTime()
      const diff = expiry - now

      if (diff <= 0) {
        setExpiryCountdown('Expired')
        return
      }

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setExpiryCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [expiresAt, screen])

  // Issue policy handler
  const handleIssuePolicy = async () => {
    if (!car) return
    setIssuing(true)
    try {
      const vin = (car.vin as string) || extractVin(vinInput)
      const carOwnerId = (car.ownerId as string) || userId || 'mario-sanchez'
      const dpp = car.dpp as Record<string, unknown> | null | undefined
      const premium = calculatePremium(dpp, car.year as number)

      const r = await api.post('/insurance', {
        userId: carOwnerId,
        vin,
        coverageType: 'Comprehensive',
        premiumBreakdown: premium,
      })
      navigate(`/policy-success/${(r.data.policy as Record<string, unknown>).policyNumber}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error || 'Failed to issue policy')
      setIssuing(false)
      setShowConfirm(false)
    }
  }

  // ===== SCREEN 1: Start =====
  if (screen === 'start') {
    return (
      <div className="max-w-2xl mx-auto mt-12 px-6">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Prove Vehicle Ownership</h1>
          <p className="text-sm text-gray-400 mt-1">Enter a VIN or Car ID to request a Verifiable Presentation from the vehicle owner</p>
        </div>

        <div className="max-w-md mx-auto mb-8">
          <label className="block text-xs text-gray-400 mb-1.5">VIN or Car ID URL</label>
          <input
            type="text"
            value={vinInput}
            onChange={e => { setVinInput(e.target.value); setRequestError('') }}
            placeholder={`e.g. TATA2024NEXONEV001 or ${API_BASE}/vehicle-registry/vehicles/TATA2024NEXONEV001`}
            className="w-full border border-[#E5EAF0] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#FBBC05] focus:ring-1 focus:ring-[#FBBC05]/20 transition-all"
            onKeyDown={e => e.key === 'Enter' && handleRequestProof()}
          />

          {requestError && <p className="mt-2 text-xs text-red-500">{requestError}</p>}

          <button
            onClick={handleRequestProof}
            disabled={requesting || !vinInput.trim()}
            className="w-full mt-3 bg-[#FBBC05] hover:bg-[#F59E0B] disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            {requesting ? 'Creating Request...' : 'Request Ownership Proof'}
          </button>

          <div className="mt-4 pt-3 border-t border-[#E5EAF0]">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Demo Car IDs</p>
            <div className="space-y-1">
              {['TATA2024NEXONEV001', 'TATA2024HARRIER001', 'TATA2024PUNCHEV001'].map(v => (
                <button key={v} onClick={() => setVinInput(`${API_BASE}/vehicle-registry/vehicles/${v}`)} className="block text-[11px] font-mono text-gray-400 hover:text-[#FBBC05] transition-colors truncate max-w-full">
                  {`${API_BASE}/vehicle-registry/vehicles/${v}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Protocol info */}
        <div className="max-w-md mx-auto">
          <div className="border border-gray-100 rounded-xl p-5 bg-white">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">How It Works</p>
            <div className="space-y-2.5">
              {[
                { num: '1', text: 'A presentation request is created using OpenID4VP protocol' },
                { num: '2', text: 'The vehicle owner scans or opens the request in SmartSense Wallet' },
                { num: '3', text: 'Owner presents their Vehicle Ownership Credential as a VP' },
                { num: '4', text: 'Digit Insurance verifies the VP and retrieves vehicle data from the manufacturer' },
              ].map(item => (
                <div key={item.num} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-orange-50 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-orange-500">{item.num}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== SCREEN 2: Present Credential =====
  if (screen === 'present') {
    return (
      <div className="max-w-lg mx-auto px-6 py-10">
        <button onClick={() => { setScreen('start'); if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Present Your Credential</h2>
          <p className="text-xs text-gray-400">Use your SmartSense Wallet to present a Verifiable Presentation</p>
        </div>

        {/* Wallet scan card */}
        <div className="border-2 border-dashed border-[#34A853]/40 bg-emerald-50/30 rounded-xl p-6 mb-6 text-center">
          <div className="w-12 h-12 bg-[#34A853] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-800 mb-1">Scan with SmartSense Wallet</p>
          <p className="text-[10px] text-gray-400 mb-3">or open the link directly on the wallet device</p>

          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 mb-4 inline-block">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Request ID</p>
            <p className="text-sm font-mono font-semibold text-gray-800">{requestId}</p>
          </div>

          <div>
            <a
              href={`${getPortalWalletUrl()}/present/${requestId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#34A853] hover:bg-[#2d9249] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              Open in Wallet
            </a>
          </div>
        </div>

        {/* Request metadata */}
        <div className="border border-gray-100 rounded-xl p-5 bg-white mb-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">Request Details</p>
          <div className="space-y-2">
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-[11px] text-gray-400">Verifier</span>
              <span className="text-[11px] text-gray-800 font-medium">{verifierName}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
              <span className="text-[11px] text-gray-400">Nonce</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-800 font-mono">{nonce || 'N/A'}</span>
                {nonce && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(nonce); }}
                    className="text-[9px] text-gray-400 hover:text-[#FBBC05] transition-colors"
                    title="Copy nonce"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-[11px] text-gray-400">Expected Credentials</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {expectedTypes.map((t, i) => (
                  <span key={i} className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-[11px] text-gray-400">Purpose</span>
              <span className="text-[11px] text-gray-800 max-w-[240px] text-right">{purpose}</span>
            </div>
            {expiryCountdown && (
              <div className="flex justify-between py-1.5">
                <span className="text-[11px] text-gray-400">Expires In</span>
                <span className={`text-[11px] font-mono font-semibold ${expiryCountdown === 'Expired' ? 'text-red-500' : 'text-orange-600'}`}>{expiryCountdown}</span>
              </div>
            )}
          </div>
        </div>

        {/* OR divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">or paste VP directly</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Paste VP section */}
        <div className="border border-gray-100 rounded-xl bg-white p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-[#FBBC05]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <p className="text-xs font-medium text-gray-700">Paste Verifiable Presentation</p>
          </div>
          <p className="text-[10px] text-gray-400 mb-2">Copy a VP from your wallet and paste it here to submit directly.</p>
          <textarea
            value={manualVP}
            onChange={e => setManualVP(e.target.value)}
            rows={6}
            placeholder='{"@context": [...], "type": ["VerifiablePresentation"], "holder": "did:smartsense:...", ...}'
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-700 focus:outline-none focus:border-[#FBBC05] focus:ring-1 focus:ring-[#FBBC05]/20 resize-none"
          />
          <button
            onClick={handleSubmitVP}
            disabled={submittingVP || !manualVP.trim()}
            className="mt-3 w-full bg-[#FBBC05] hover:bg-[#F59E0B] disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {submittingVP ? 'Submitting VP...' : 'Submit VP'}
          </button>
          {vpSubmitError && (
            <p className="mt-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{vpSubmitError}</p>
          )}
          {vpSubmitSuccess && (
            <p className="mt-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">VP submitted successfully! Processing will begin shortly...</p>
          )}
        </div>

        {/* Polling indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
          <p className="text-[11px] text-gray-400">Waiting for wallet response...</p>
        </div>

        {/* Debug info */}
        <div className="border border-gray-100 rounded-xl bg-white overflow-hidden">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Debug Info</span>
            <svg className={`w-4 h-4 text-gray-300 transition-transform ${showDebug ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDebug && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-1">
              <p className="text-[10px] text-gray-400">Session ID: <span className="font-mono text-gray-600">{sessionId}</span></p>
              <p className="text-[10px] text-gray-400">Request ID: <span className="font-mono text-gray-600">{requestId}</span></p>
              {qrData && <p className="text-[10px] text-gray-400">QR Data: <span className="font-mono text-gray-600 break-all">{qrData.length > 80 ? qrData.slice(0, 80) + '...' : qrData}</span></p>}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== SCREEN 3: VP Verification Stepper =====
  if (screen === 'verify') {
    const isCompleted = sessionStatus === 'completed'
    const isFailed = sessionStatus === 'failed'

    return (
      <div className="max-w-lg mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">VP Verification</h2>
          <p className="text-xs text-gray-400">Verifying presentation and retrieving vehicle data via sovereign EDC exchange</p>
        </div>

        {/* Party badges */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 bg-[#FBBC05] rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">D</span>
            </div>
            <span className="text-[10px] font-medium text-amber-800">Digit Insurance</span>
            <span className="text-[9px] text-amber-500">Verifier</span>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h12M8 17h12" /></svg>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 bg-[#34A853] rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">W</span>
            </div>
            <span className="text-[10px] font-medium text-emerald-800">SmartSense Wallet</span>
            <span className="text-[9px] text-emerald-500">Holder</span>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h12M8 17h12" /></svg>
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 bg-[#1A47A0] rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">T</span>
            </div>
            <span className="text-[10px] font-medium text-blue-800">TATA Motors</span>
            <span className="text-[9px] text-blue-500">Issuer</span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-1">
          {VP_STEP_LABELS.map((label, i) => {
            const stepNum = i + 1
            const stepData = steps.find(s => s.step === stepNum)
            const status = stepData?.status || 'pending'
            const isActive = status === 'running'
            const isComplete = status === 'completed'
            const isStepFailed = status === 'failed'

            return (
              <div key={stepNum} className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-300 ${isActive ? 'bg-orange-50 border border-orange-200' : isComplete ? 'bg-emerald-50/50' : isStepFailed ? 'bg-red-50 border border-red-200' : 'opacity-40'}`}>
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
                  ) : isStepFailed ? (
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
                    <p className={`text-xs font-medium ${isActive ? 'text-orange-800' : isComplete ? 'text-emerald-800' : isStepFailed ? 'text-red-800' : 'text-gray-400'}`}>
                      Step {stepNum}: {label.name}
                    </p>
                    {stepData?.durationMs != null && (
                      <span className="text-[10px] text-gray-400 font-mono ml-2 flex-shrink-0">{(stepData.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  <p className={`text-[10px] mt-0.5 ${isActive ? 'text-orange-600' : isComplete ? 'text-emerald-600' : isStepFailed ? 'text-red-500' : 'text-gray-300'}`}>
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

        {/* Error */}
        {isFailed && sessionError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600 font-medium">Verification Failed</p>
            <p className="text-[10px] text-red-500 mt-1">{sessionError}</p>
            <button onClick={() => { setScreen('start'); setSteps([]); setSessionStatus('waiting'); setSessionError('') }} className="mt-3 text-xs text-red-600 hover:underline">
              Try Again
            </button>
          </div>
        )}

        {/* Protocol badges */}
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">OpenID4VP</span>
          <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">W3C Verifiable Presentations</span>
          <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">DID Resolution</span>
          <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">IDSA Dataspace Protocol</span>
          <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">ODRL Policy</span>
          <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded">HttpData-PULL</span>
        </div>

        {/* Success + Continue */}
        {isCompleted && (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-lg mb-4">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <span className="text-xs font-medium text-emerald-800">VP verified and vehicle data retrieved via EDC sovereign exchange</span>
            </div>
            <br />
            <button
              onClick={() => setScreen('quote')}
              className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-lg text-sm font-medium transition-colors"
            >
              View Insurance Quote &rarr;
            </button>
          </div>
        )}
      </div>
    )
  }

  // ===== SCREEN 4: Quote =====
  if (screen === 'quote' && car) {
    const quoteCar = car
    const dpp = quoteCar.dpp as Record<string, unknown> | null | undefined
    const premium = calculatePremium(dpp, quoteCar.year as number)
    const condition = dpp?.stateOfHealth as Record<string, unknown> | undefined
    const damages = dpp?.damageHistory as Record<string, unknown> | undefined
    const incidents = damages?.incidents as Array<Record<string, unknown>> | undefined
    const carOwnerId = (quoteCar.ownerId as string) || 'mario-sanchez'
    const ownerName = (dpp?.ownershipChain as Record<string, unknown>)?.currentOwner
      ? ((dpp?.ownershipChain as Record<string, unknown>)?.currentOwner as Record<string, unknown>)?.ownerName as string
      : 'Vehicle Owner'

    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={() => setScreen('verify')} className="text-sm text-gray-400 hover:text-gray-600 mb-8 inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Verification
        </button>

        {/* VP Exchange badge */}
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-800">Data Verified via OpenID4VP + EDC Sovereign Exchange</p>
            <p className="text-[10px] text-emerald-600">Issuer DID: {issuerDid || 'did:web:tata-motors.smartsense.co'}</p>
          </div>
        </div>

        {/* Vehicle header */}
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{String(quoteCar.year || '')} &middot; {String(quoteCar.variant || '')}</p>
              <h1 className="text-xl font-semibold text-gray-900">{String(quoteCar.make || '')} {String(quoteCar.model || '')}</h1>
              <p className="text-xs text-gray-300 font-mono mt-1">{String(quoteCar.vin || extractVin(vinInput))}</p>
              <span className="inline-block mt-2 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">OpenID4VP + EDC Verified</span>
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
                    <span className="text-xs font-medium text-gray-800">{String(quoteCar.make || '')} {String(quoteCar.model || '')}</span>
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

  // Fallback if on quote screen but no car data
  if (screen === 'quote' && !car) {
    return (
      <div className="max-w-sm mx-auto mt-24 px-6 text-center">
        <p className="text-sm text-gray-500 mb-4">No vehicle data available</p>
        <button onClick={() => setScreen('start')} className="text-sm text-orange-500 hover:underline">Start Over</button>
      </div>
    )
  }

  return null
}
