import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ProtectedRoute, useAuthUser, createAuthAxios, ROLES, PortalTheme } from '@eu-jap-hack/auth'
import CredentialCard from './components/CredentialCard'
import ConsentModal from './components/ConsentModal'
import { useConsentPolling } from './hooks/useConsentPolling'
import DPPViewer from './pages/DPPViewer'

const API_BASE = 'http://localhost:8000/api'

function WalletHome() {
  const { userId, fullName, accessToken, logout } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [wallet, setWallet] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCred, setSelectedCred] = useState<Record<string, unknown> | null>(null)
  const [consentHistory, setConsentHistory] = useState<Record<string, unknown>[]>([])
  const { pendingConsent, clearConsent } = useConsentPolling(userId)
  const navigate = useNavigate()

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
              return (
                <CredentialCard
                  key={cred.id as string}
                  credential={cred}
                  onClick={() => setSelectedCred(cred)}
                  extra={
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/dpp/${subject?.vin}`) }}
                      className="mt-3 w-full text-xs text-[#4285F4] bg-[#E8F0FE] hover:bg-[#d2e3fc] border border-[#4285F4]/20 py-2 rounded-lg font-medium transition-colors"
                    >
                      View Digital Product Passport
                    </button>
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
              <div key={i} className="flex items-center justify-between py-2.5 px-4 bg-[#F8FAFD] rounded-lg border border-[#E5EAF0]">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${c.status === 'approved' ? 'bg-[#34A853]' : c.status === 'denied' ? 'bg-[#EA4335]' : 'bg-[#FBBC05]'}`}></div>
                  <div>
                    <p className="text-xs text-[#1F1F1F]">{c.requesterName as string}</p>
                    <p className="text-[10px] text-[#9AA0A6] font-mono">{c.vin as string}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  c.status === 'approved' ? 'text-[#34A853] bg-[#E6F4EA]' :
                  c.status === 'denied' ? 'text-[#EA4335] bg-[#FCE8E6]' : 'text-[#FBBC05] bg-[#FEF7E0]'
                }`}>{c.status as string}</span>
              </div>
            ))}
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
        </Routes>
      </ProtectedRoute>
    </div>
  )
}
