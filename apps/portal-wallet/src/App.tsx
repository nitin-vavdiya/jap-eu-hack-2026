import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ProtectedRoute, useAuthUser, createAuthAxios, ROLES, PortalTheme, getApiBase, HackathonBanner } from '@eu-jap-hack/auth'
import CredentialCard from './components/CredentialCard'
import ConsentModal from './components/ConsentModal'
import { useConsentPolling } from './hooks/useConsentPolling'
import DPPViewer from './pages/DPPViewer'
import PresentationRequest from './pages/PresentationRequest'

const API_BASE = getApiBase()

function WalletHome() {
  const { userId, fullName, accessToken, logout } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [wallet, setWallet] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCred, setSelectedCred] = useState<Record<string, unknown> | null>(null)
  const [consentHistory, setConsentHistory] = useState<Record<string, unknown>[]>([])
  const { pendingConsent, clearConsent } = useConsentPolling(userId)
  const navigate = useNavigate()

  // VP Generation state
  const [vpGenerating, setVpGenerating] = useState<string | null>(null) // credential id being generated
  const [vpModal, setVpModal] = useState<{ vp: unknown; credId: string; vin: string } | null>(null)
  const [vpCopied, setVpCopied] = useState(false)
  const [vpFormCredId, setVpFormCredId] = useState<string | null>(null)
  const [vpFormVin, setVpFormVin] = useState('')
  const [vpChallenge, setVpChallenge] = useState('')
  const [vpDomain, setVpDomain] = useState('tokio-marine')

  const openVpForm = (credId: string, vin: string) => {
    setVpFormCredId(credId)
    setVpFormVin(vin)
    setVpChallenge('')
    setVpDomain('tokio-marine')
  }

  const handleGenerateVP = async () => {
    if (!vpFormCredId) return
    setVpGenerating(vpFormCredId)
    try {
      const resp = await axios.post(`${API_BASE}/wallet-vp/generate-vp`, {
        userId,
        credentialIds: [vpFormCredId],
        challenge: vpChallenge || undefined,
        domain: vpDomain || undefined,
      })
      setVpModal({ vp: resp.data.vp, credId: vpFormCredId, vin: vpFormVin })
      setVpFormCredId(null)
    } catch {
      alert('Failed to generate VP')
    } finally {
      setVpGenerating(null)
    }
  }

  const handleCopyVP = () => {
    if (!vpModal) return
    navigator.clipboard.writeText(JSON.stringify(vpModal.vp, null, 2)).then(() => {
      setVpCopied(true)
      setTimeout(() => setVpCopied(false), 2000)
    })
  }

  const fetchWallet = () => {
    api.get(`/wallet/${userId}`).then(r => {
      setWallet(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    if (!userId) return
    fetchWallet()
    api.get(`/consent/history/${userId}`).then(r => setConsentHistory(r.data)).catch(() => {})
  }, [userId])

  const handleConsentApprove = async (consentId: string) => {
    await api.put(`/consent/${consentId}/approve`)
    clearConsent()
    fetchWallet()
  }

  const handleConsentDeny = async (consentId: string) => {
    await api.put(`/consent/${consentId}/deny`)
    clearConsent()
  }

  const credentials = (wallet?.credentials as Record<string, unknown>[]) || []
  const selfCreds = credentials.filter(c => c.type === 'SelfVC')
  const ownershipCreds = credentials.filter(c => c.type === 'OwnershipVC')
  const insuranceCreds = credentials.filter(c => c.type === 'InsuranceVC')
  const otherCreds = credentials.filter(c => !['SelfVC', 'OwnershipVC', 'InsuranceVC'].includes(c.type as string))

  const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-[#E5EAF0] border-t-[#34A853] rounded-full"></div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {pendingConsent && (
        <div className="mb-6 border-l-4 border-[#FBBC05] bg-[#FEF7E0] rounded-r-xl px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-[#FBBC05]/20 rounded-full flex items-center justify-center flex-shrink-0">
            <div className="w-3 h-3 bg-[#FBBC05] rounded-full animate-pulse"></div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#1F1F1F]">New Data Access Request</p>
            <p className="text-xs text-[#5F6368] mt-0.5">{pendingConsent.requesterName as string} wants to access vehicle data for <span className="font-mono">{pendingConsent.vin as string}</span></p>
          </div>
          <button onClick={() => {}} className="text-xs text-[#FBBC05] font-medium border border-[#FBBC05]/30 px-3 py-1.5 rounded-lg hover:bg-[#FBBC05]/10">
            Review
          </button>
        </div>
      )}

      {/* Profile header */}
      <div className="flex items-center gap-5 mb-10">
        <div className="w-14 h-14 bg-gradient-to-br from-[#34A853] to-[#1e7e34] rounded-2xl flex items-center justify-center shadow-sm">
          <span className="text-white font-bold text-xl">{initials[0]}</span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-[#1F1F1F]">{fullName}</h1>
          <p className="text-xs text-[#9AA0A6] font-mono mt-0.5">did:smartsense:{userId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-semibold text-[#1F1F1F]">{credentials.length}</p>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide">Credentials</p>
          </div>
          <button onClick={fetchWallet} className="text-xs text-[#9AA0A6] border border-[#E5EAF0] px-3 py-2 rounded-lg hover:bg-[#F8FAFD] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>

      {/* Identity section */}
      {selfCreds.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-3">Identity</p>
          <div className="grid grid-cols-1 gap-3">
            {selfCreds.map(cred => (
              <CredentialCard key={cred.id as string} credential={cred} onClick={() => setSelectedCred(cred)} />
            ))}
          </div>
        </div>
      )}

      {/* Vehicles section */}
      {ownershipCreds.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-3">Vehicles</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ownershipCreds.map(cred => {
              const subject = cred.credentialSubject as Record<string, unknown>
              const vin = subject?.vin as string
              const carId = `${getApiBase()}/vehicle-registry/vehicles/${vin}`
              return (
                <CredentialCard
                  key={cred.id as string}
                  credential={cred}
                  onClick={() => setSelectedCred(cred)}
                  extra={
                    <div className="mt-3 space-y-2">
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <p className="text-[9px] text-blue-400 uppercase tracking-wide mb-0.5">Car ID (Resolvable)</p>
                        <p className="text-[10px] text-blue-700 font-mono break-all">{carId}</p>
                        <p className="text-[9px] text-blue-400 mt-0.5">Manufacturer-hosted, owner-controlled access</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/dpp/${vin}`) }}
                          className="flex-1 text-xs text-[#4285F4] bg-[#E8F0FE] hover:bg-[#d2e3fc] border border-[#4285F4]/20 py-2 rounded-lg font-medium transition-colors"
                        >
                          View DPP
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openVpForm(cred.id as string, vin) }}
                          className="flex-1 text-xs text-[#34A853] bg-[#E6F4EA] hover:bg-[#ceead6] border border-[#34A853]/20 py-2 rounded-lg font-medium transition-colors"
                        >
                          Generate VP
                        </button>
                      </div>
                    </div>
                  }
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Insurance section */}
      {insuranceCreds.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-3">Insurance</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insuranceCreds.map(cred => (
              <CredentialCard key={cred.id as string} credential={cred} onClick={() => setSelectedCred(cred)} />
            ))}
          </div>
        </div>
      )}

      {/* Other credentials */}
      {otherCreds.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-3">Other</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {otherCreds.map(cred => (
              <CredentialCard key={cred.id as string} credential={cred} onClick={() => setSelectedCred(cred)} />
            ))}
          </div>
        </div>
      )}

      {/* Consent History */}
      {consentHistory.length > 0 && (
        <div className="mt-10 pt-8 border-t border-[#E5EAF0]">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-3">Consent History</p>
          <div className="space-y-2">
            {consentHistory.slice(0, 5).map((c, i) => (
              <div key={i} className="py-2.5 px-4 bg-[#F8FAFD] rounded-lg border border-[#E5EAF0]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${c.status === 'approved' ? 'bg-[#34A853]' : c.status === 'denied' ? 'bg-[#EA4335]' : 'bg-[#FBBC05]'}`}></div>
                    <div>
                      <p className="text-xs text-[#1F1F1F]">{c.requesterName as string}</p>
                      <p className="text-[10px] text-[#9AA0A6]">{c.purpose as string}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    c.status === 'approved' ? 'text-[#34A853] bg-[#E6F4EA]' :
                    c.status === 'denied' ? 'text-[#EA4335] bg-[#FCE8E6]' : 'text-[#FBBC05] bg-[#FEF7E0]'
                  }`}>{c.status as string}</span>
                </div>
                <p className="text-[9px] text-blue-500 font-mono mt-1 ml-5 break-all">
                  {`${getApiBase()}/vehicle-registry/vehicles/${c.vin as string}`}
                </p>
                {(c.dataRequested as string[])?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-5">
                    {(c.dataRequested as string[]).map((d, j) => (
                      <span key={j} className="text-[8px] bg-gray-100 text-[#9AA0A6] px-1.5 py-0.5 rounded">{d}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VP Generation Form Modal */}
      {vpFormCredId && !vpModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setVpFormCredId(null)}>
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#E5EAF0]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#1F1F1F]">Generate Verifiable Presentation</h2>
                  <p className="text-xs text-[#9AA0A6] mt-0.5 font-mono">{vpFormVin}</p>
                </div>
                <button onClick={() => setVpFormCredId(null)} className="text-[#9AA0A6] hover:text-[#5F6368] text-xl leading-none p-1">&times;</button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-1.5">
                  Challenge / Nonce <span className="normal-case tracking-normal text-[#FBBC05]">(from verifier request)</span>
                </label>
                <input
                  type="text"
                  value={vpChallenge}
                  onChange={e => setVpChallenge(e.target.value)}
                  placeholder="Paste the nonce from the presentation request"
                  className="w-full border border-[#E5EAF0] rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#34A853] focus:ring-1 focus:ring-[#34A853]/20 transition-all"
                />
                <p className="text-[10px] text-[#9AA0A6] mt-1">Copy from the insurance portal's request details. Required for VP validation.</p>
              </div>
              <div>
                <label className="block text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium mb-1.5">Domain</label>
                <input
                  type="text"
                  value={vpDomain}
                  onChange={e => setVpDomain(e.target.value)}
                  placeholder="e.g. tokio-marine"
                  className="w-full border border-[#E5EAF0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#34A853] focus:ring-1 focus:ring-[#34A853]/20 transition-all"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setVpFormCredId(null)}
                className="flex-1 border border-[#E5EAF0] text-[#5F6368] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F8FAFD] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateVP}
                disabled={vpGenerating !== null}
                className="flex-1 bg-[#34A853] hover:bg-[#1e7e34] text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {vpGenerating ? 'Generating...' : 'Generate & Sign VP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VP Generated Modal */}
      {vpModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setVpModal(null); setVpCopied(false) }}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#34A853] to-[#1e7e34] px-6 py-5 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Verifiable Presentation</h2>
                    <p className="text-xs text-white/70">VIN: {vpModal.vin}</p>
                  </div>
                </div>
                <button onClick={() => { setVpModal(null); setVpCopied(false) }} className="text-white/70 hover:text-white text-xl leading-none p-1">&times;</button>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-[#9AA0A6] uppercase tracking-widest font-medium">VP Token (JSON)</p>
                <button
                  onClick={handleCopyVP}
                  className="flex items-center gap-1.5 text-xs text-[#34A853] hover:text-[#1e7e34] font-medium border border-[#34A853]/20 bg-[#E6F4EA] px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  {vpCopied ? 'Copied!' : 'Copy VP'}
                </button>
              </div>
              <pre className="bg-[#F8FAFD] border border-[#E5EAF0] rounded-lg p-4 text-[10px] font-mono text-[#5F6368] overflow-auto max-h-[400px] whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(vpModal.vp, null, 2)}
              </pre>
              <p className="text-[10px] text-[#9AA0A6] mt-3">
                This VP is cryptographically signed with your private key (RS256). Copy and paste it into a verifier to prove ownership.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Credential Detail Modal */}
      {selectedCred && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCred(null)}>
          <div className="bg-white rounded-xl max-w-md w-full max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#E5EAF0] flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[#1F1F1F]">{selectedCred.type as string}</h2>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    selectedCred.status === 'active' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#F1F3F6] text-[#5F6368]'
                  }`}>{selectedCred.status as string}</span>
                </div>
                <p className="text-xs text-[#9AA0A6] mt-1">Issued by {selectedCred.issuerName as string}</p>
                <p className="text-[10px] text-[#9AA0A6] font-mono mt-0.5">{selectedCred.id as string}</p>
              </div>
              <button onClick={() => setSelectedCred(null)} className="text-[#9AA0A6] hover:text-[#5F6368] text-xl leading-none p-1">&times;</button>
            </div>
            <div className="px-6 py-5">
              {Object.entries((selectedCred.credentialSubject as Record<string, unknown>) || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between py-3 border-b border-[#F1F3F6] last:border-0">
                  <span className="text-xs text-[#9AA0A6] capitalize pr-4">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className="text-xs text-[#1F1F1F] font-medium text-right max-w-[220px] break-words">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingConsent && (
        <ConsentModal
          consent={pendingConsent}
          onApprove={() => handleConsentApprove(pendingConsent.id as string)}
          onDeny={() => handleConsentDeny(pendingConsent.id as string)}
        />
      )}
    </div>
  )
}

const walletTheme: PortalTheme = {
  portalName: 'SmartSense Wallet',
  subtitle: 'Your Digital Identity & Credentials',
  primaryColor: 'bg-[#34A853]',
  primaryHover: 'hover:bg-[#1e7e34]',
  accentGradient: 'bg-gradient-to-br from-[#34A853] via-[#1e7e34] to-[#0d5c22]',
  iconText: 'SS',
  iconBg: 'bg-[#34A853]',
  description: 'Access your verifiable credentials — identity, vehicle ownership, insurance — all in one secure, consent-driven digital wallet.',
  features: [
    'Store and manage your Verifiable Credentials securely',
    'Control who accesses your vehicle data with granular consent',
    'View your Digital Product Passports and ownership history',
    'Receive and approve data access requests in real-time',
  ],
  loginHint: 'Login as mario-sanchez / mario',
}

export default function App() {
  const { fullName, logout } = useAuthUser()
  const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      <HackathonBanner />
      <nav className="bg-white border-b border-[#E5EAF0] px-6 py-4 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#34A853] to-[#1e7e34] rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xs">SS</span>
            </div>
            <div>
              <span className="font-semibold text-[#1F1F1F] text-sm">SmartSense Wallet</span>
            </div>
          </a>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#9AA0A6]">{fullName}</span>
            <div className="w-8 h-8 bg-[#F1F3F6] rounded-full flex items-center justify-center">
              <span className="text-[#5F6368] text-xs font-medium">{initials}</span>
            </div>
            <button onClick={() => logout()} className="text-xs text-[#9AA0A6] hover:text-[#5F6368] transition-colors">
              Logout
            </button>
          </div>
        </div>
      </nav>
      <ProtectedRoute role={ROLES.CUSTOMER} theme={walletTheme}>
        <Routes>
          <Route path="/" element={<WalletHome />} />
          <Route path="/dpp/:vin" element={<DPPViewer />} />
          <Route path="/present/:requestId" element={<PresentationRequest />} />
        </Routes>
      </ProtectedRoute>
    </div>
  )
}
