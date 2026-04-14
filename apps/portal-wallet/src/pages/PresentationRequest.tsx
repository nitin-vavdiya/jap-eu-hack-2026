import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

type Screen = 'loading' | 'review' | 'generating' | 'success' | 'declined' | 'error'

interface PresentationRequestData {
  id: string
  verifierName: string
  verifierDid: string
  purpose: string
  expectedCredentialTypes: string[]
  nonce: string
  expiresAt: string
}

interface CredentialData {
  id: string
  type: string
  status: string
  issuerName: string
  issuerId: string
  issuedAt: string
  credentialSubject: {
    vin?: string
    make?: string
    model?: string
    year?: string | number
    [key: string]: unknown
  }
}

interface GeneratedVP {
  vp: Record<string, unknown>
  holder: string
  credentialTypes: string[]
  issuer: string
  vin: string
  proofType: string
  proofCreated: string
}

export default function PresentationRequest() {
  const { requestId } = useParams<{ requestId: string }>()
  const navigate = useNavigate()
  const { userId, accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)

  const [screen, setScreen] = useState<Screen>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [request, setRequest] = useState<PresentationRequestData | null>(null)
  const [credentials, setCredentials] = useState<CredentialData[]>([])
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null)
  const [generatedVP, setGeneratedVP] = useState<GeneratedVP | null>(null)
  const [vpExpanded, setVpExpanded] = useState(false)
  const [debugExpanded, setDebugExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')

  // Fetch presentation request on mount
  useEffect(() => {
    if (!requestId) {
      setErrorMessage('No request ID provided.')
      setScreen('error')
      return
    }

    axios
      .get(`${API_BASE}/verifier/presentation-request/${requestId}`)
      .then((res) => {
        const data = res.data as PresentationRequestData
        const expiry = new Date(data.expiresAt)
        if (expiry.getTime() < Date.now()) {
          setErrorMessage('This presentation request has expired.')
          setScreen('error')
          return
        }
        setRequest(data)
        setScreen('review')
      })
      .catch(() => {
        setErrorMessage('Presentation request not found or could not be loaded.')
        setScreen('error')
      })
  }, [requestId])

  // Fetch matching credentials once request is loaded (authenticated — route requires auth)
  useEffect(() => {
    if (!request || !userId) return

    api
      .get(`${API_BASE}/wallet-vp/credentials/${userId}/ownership`)
      .then((res) => {
        const creds = res.data as CredentialData[]
        setCredentials(creds)
        if (creds.length === 1) {
          setSelectedCredId(creds[0].id)
        }
      })
      .catch(() => {
        setCredentials([])
      })
  }, [request, userId])

  // Expiry countdown
  useEffect(() => {
    if (!request) return

    const updateCountdown = () => {
      const now = Date.now()
      const expiry = new Date(request.expiresAt).getTime()
      const diff = expiry - now

      if (diff <= 0) {
        setTimeLeft('Expired')
        return
      }

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)

      if (minutes > 60) {
        const hours = Math.floor(minutes / 60)
        const remainingMins = minutes % 60
        setTimeLeft(`${hours}h ${remainingMins}m`)
      } else {
        setTimeLeft(`${minutes}m ${seconds.toString().padStart(2, '0')}s`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [request])

  const handleCreatePresentation = useCallback(async () => {
    if (!selectedCredId || !request || !userId) return

    setSubmitting(true)
    setScreen('generating')

    try {
      // Step 1: Generate VP
      const generateRes = await api.post(`${API_BASE}/wallet-vp/generate-vp`, {
        userId,
        credentialIds: [selectedCredId],
        challenge: request.nonce,
        domain: 'tokio-marine',
      })

      const vpData = generateRes.data as GeneratedVP
      setGeneratedVP(vpData)

      // Step 2: Auto-submit VP
      await api.post(`${API_BASE}/wallet-vp/submit-vp`, {
        requestId: request.id,
        vpToken: vpData.vp,
      })

      setScreen('success')
    } catch {
      setErrorMessage('Failed to generate or submit the Verifiable Presentation. Please try again.')
      setScreen('error')
    } finally {
      setSubmitting(false)
    }
  }, [selectedCredId, request, userId])

  const handleDecline = useCallback(async () => {
    if (!request) return

    try {
      await axios.post(`${API_BASE}/verifier/decline`, { requestId: request.id })
    } catch {
      // Decline best-effort
    }

    setScreen('declined')
  }, [request])

  const handleCopyVP = useCallback(() => {
    if (!generatedVP) return
    navigator.clipboard.writeText(JSON.stringify(generatedVP.vp, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [generatedVP])

  // --- Loading Screen ---
  if (screen === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="animate-spin w-8 h-8 border-2 border-[#E5EAF0] border-t-[#34A853] rounded-full"></div>
          <p className="text-sm text-[#9AA0A6]">Loading presentation request...</p>
        </div>
      </div>
    )
  }

  // --- Error Screen ---
  if (screen === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white border border-[#E5EAF0] rounded-xl p-8 text-center">
          <div className="w-14 h-14 bg-[#FCE8E6] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#EA4335]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#1F1F1F] mb-2">Request Error</h2>
          <p className="text-sm text-[#5F6368] mb-6">{errorMessage}</p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-[#4285F4] hover:text-[#3367D6] font-medium"
          >
            Back to Wallet
          </button>
        </div>
      </div>
    )
  }

  // --- Declined Screen ---
  if (screen === 'declined') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white border border-[#E5EAF0] rounded-xl p-8 text-center">
          <div className="w-14 h-14 bg-[#F1F3F6] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#5F6368]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#1F1F1F] mb-2">Presentation Declined</h2>
          <p className="text-sm text-[#5F6368] mb-6">
            You have declined this presentation request. No credentials were shared.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-[#34A853] hover:bg-[#1e7e34] text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Back to Wallet
          </button>
        </div>
      </div>
    )
  }

  // --- Success Screen ---
  if (screen === 'success' && generatedVP) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden">
          {/* Success header */}
          <div className="bg-gradient-to-r from-[#34A853] to-[#1e7e34] px-6 py-6 text-center">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Presentation Sent</h2>
            <p className="text-sm text-white/80 mt-1">
              Successfully sent to {request?.verifierName}
            </p>
          </div>

          {/* VP Preview */}
          <div className="px-6 py-5">
            <button
              onClick={() => setVpExpanded(!vpExpanded)}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#E6F4EA] text-[#34A853] rounded-lg flex items-center justify-center text-[10px] font-bold">
                  VP
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F]">Verifiable Presentation</p>
                  <p className="text-[10px] text-[#9AA0A6]">Click to view details</p>
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-[#9AA0A6] transition-transform ${vpExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {vpExpanded && (
              <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4 mb-4 space-y-2.5">
                <div className="flex justify-between py-1.5 border-b border-[#E5EAF0]">
                  <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">Holder DID</span>
                  <span className="text-xs text-[#1F1F1F] font-mono text-right max-w-[280px] break-all">{generatedVP.holder}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E5EAF0]">
                  <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">Credential Types</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {generatedVP.credentialTypes.map((t, i) => (
                      <span key={i} className="text-[10px] bg-[#E8F0FE] text-[#4285F4] px-2 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E5EAF0]">
                  <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">Issuer</span>
                  <span className="text-xs text-[#1F1F1F]">{generatedVP.issuer}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E5EAF0]">
                  <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">VIN</span>
                  <span className="text-xs text-[#1F1F1F] font-mono">{generatedVP.vin}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#E5EAF0]">
                  <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">Proof Type</span>
                  <span className="text-xs text-[#1F1F1F]">{generatedVP.proofType}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">Proof Created</span>
                  <span className="text-xs text-[#1F1F1F]">{new Date(generatedVP.proofCreated).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Advanced / Debug */}
            <div className="border-t border-[#E5EAF0] pt-4 mt-2">
              <button
                onClick={() => setDebugExpanded(!debugExpanded)}
                className="flex items-center gap-2 text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium hover:text-[#5F6368] transition-colors"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${debugExpanded ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced / Debug
              </button>

              {debugExpanded && (
                <div className="mt-3">
                  <button
                    onClick={handleCopyVP}
                    className="flex items-center gap-2 text-xs text-[#4285F4] hover:text-[#3367D6] font-medium border border-[#4285F4]/20 bg-[#E8F0FE] px-3 py-2 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copied ? 'Copied!' : 'Copy VP Token'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <button
              onClick={() => navigate('/')}
              className="w-full bg-[#34A853] hover:bg-[#1e7e34] text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Back to Wallet
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Generating Screen ---
  if (screen === 'generating') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white border border-[#E5EAF0] rounded-xl p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#E5EAF0] border-t-[#34A853] rounded-full mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-[#1F1F1F] mb-2">Generating Presentation</h2>
          <p className="text-sm text-[#5F6368]">Creating and submitting your Verifiable Presentation...</p>
        </div>
      </div>
    )
  }

  // --- Review Screen ---
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <button
        onClick={() => navigate('/')}
        className="text-sm text-[#9AA0A6] hover:text-[#5F6368] mb-6 inline-flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Wallet
      </button>

      {/* Request header */}
      <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden mb-4">
        <div className="px-6 py-5 border-b border-[#E5EAF0]">
          <p className="text-[10px] text-[#4285F4] font-medium uppercase tracking-widest mb-2">Presentation Request</p>
          <h1 className="text-xl font-semibold text-[#1F1F1F]">Credential Verification Request</h1>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Verifier info */}
          <div className="flex items-center gap-3 bg-[#E8F0FE] border border-[#4285F4]/20 rounded-lg p-3">
            <div className="w-10 h-10 bg-[#4285F4] rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {request!.verifierName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1F1F1F]">{request!.verifierName}</p>
              <p className="text-[10px] text-[#9AA0A6] font-mono truncate">{request!.verifierDid}</p>
            </div>
            <span className="ml-auto text-[10px] text-[#4285F4] bg-white border border-[#4285F4]/20 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              Verifier
            </span>
          </div>

          {/* Purpose */}
          <div>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-1">Purpose</p>
            <p className="text-sm text-[#5F6368]">{request!.purpose}</p>
          </div>

          {/* Expected credential types */}
          <div>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-1.5">Expected Credentials</p>
            <div className="flex flex-wrap gap-1.5">
              {request!.expectedCredentialTypes.map((type, i) => (
                <span key={i} className="text-[10px] text-[#4285F4] bg-[#E8F0FE] border border-[#4285F4]/20 px-2.5 py-1 rounded-lg font-medium">
                  {type}
                </span>
              ))}
            </div>
          </div>

          {/* Nonce and expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-0.5">Nonce</p>
              <p className="text-xs text-[#5F6368] font-mono break-all">{request!.nonce}</p>
            </div>
            <div className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-3">
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-0.5">Expires In</p>
              <p className={`text-xs font-medium ${timeLeft === 'Expired' ? 'text-[#EA4335]' : 'text-[#FBBC05]'}`}>
                {timeLeft}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Matching credentials */}
      <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-[#E5EAF0]">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium">
            Matching Credentials in Your Wallet
          </p>
        </div>

        <div className="px-6 py-4">
          {credentials.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-[#FEF7E0] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#FBBC05]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-sm text-[#5F6368] font-medium">No matching credentials found in your wallet</p>
              <p className="text-xs text-[#9AA0A6] mt-1">You need a matching credential to respond to this request.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {credentials.map((cred) => {
                const isSelected = selectedCredId === cred.id
                const subject = cred.credentialSubject

                return (
                  <label
                    key={cred.id}
                    className={`block border rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#34A853] bg-[#E6F4EA]/30 shadow-sm'
                        : 'border-[#E5EAF0] hover:border-[#9AA0A6] hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected ? 'border-[#34A853]' : 'border-[#E5EAF0]'
                          }`}
                        >
                          {isSelected && <div className="w-2.5 h-2.5 bg-[#34A853] rounded-full"></div>}
                        </div>
                        <input
                          type="radio"
                          name="credential"
                          value={cred.id}
                          checked={isSelected}
                          onChange={() => setSelectedCredId(cred.id)}
                          className="sr-only"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-[#4285F4]">{cred.type}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                            cred.status === 'active' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#F1F3F6] text-[#5F6368]'
                          }`}>
                            {cred.status}
                          </span>
                        </div>

                        {subject?.vin && (
                          <div className="bg-[#E8F0FE]/50 rounded-lg p-2.5 mt-2">
                            <p className="text-sm font-medium text-[#1F1F1F]">
                              {subject.make} {subject.model} ({subject.year})
                            </p>
                            <p className="text-[10px] font-mono text-[#9AA0A6] mt-1">{subject.vin}</p>
                          </div>
                        )}

                        <p className="text-[10px] text-[#9AA0A6] mt-2">
                          Issued by {cred.issuerName} &middot; {new Date(cred.issuedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDecline}
          className="flex-1 border border-[#E5EAF0] text-[#5F6368] py-3 rounded-xl text-sm font-medium hover:bg-[#F8FAFD] transition-colors"
        >
          Decline
        </button>
        <button
          onClick={handleCreatePresentation}
          disabled={!selectedCredId || submitting || timeLeft === 'Expired'}
          className="flex-1 bg-[#34A853] hover:bg-[#1e7e34] text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Presentation
        </button>
      </div>
    </div>
  )
}
