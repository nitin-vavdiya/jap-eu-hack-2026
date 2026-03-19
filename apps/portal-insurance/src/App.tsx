import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute, useAuthUser, ROLES, PortalTheme } from '@eu-jap-hack/auth'
import VinLookup from './pages/VinLookup'
import ConsentWait from './pages/ConsentWait'
import QuotePage from './pages/QuotePage'
import PolicySuccess from './pages/PolicySuccess'

const insuranceTheme: PortalTheme = {
  portalName: 'Digit Insurance',
  subtitle: 'Smart Vehicle Coverage Portal',
  primaryColor: 'bg-[#FBBC05]',
  primaryHover: 'hover:bg-[#F59E0B]',
  accentGradient: 'bg-gradient-to-br from-[#FBBC05] via-[#F59E0B] to-[#EA4335]',
  iconText: 'D',
  iconBg: 'bg-[#FBBC05]',
  description: 'Look up any vehicle by VIN, request DPP access with owner consent, and generate transparent, data-driven insurance quotes instantly.',
  features: [
    'VIN-based vehicle lookup with Digital Product Passport data',
    'Consent-driven data access — owners approve in their wallet',
    'Transparent premium calculation from DPP damage & condition data',
    'Instant policy issuance with Verifiable Credential delivery',
  ],
  loginHint: 'Login as digit-agent / digit',
}

export default function App() {
  const { fullName, logout } = useAuthUser()

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      <nav className="bg-white border-b border-[#E5EAF0] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#FBBC05] rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">D</span>
            </div>
            <div>
              <span className="font-semibold text-[#1F1F1F] text-sm">Digit Insurance</span>
              <span className="text-[#9AA0A6] text-xs ml-2">Smart Vehicle Coverage</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9AA0A6]">{fullName}</span>
            <button onClick={() => logout()} className="text-xs text-[#9AA0A6] hover:text-[#5F6368] transition-colors">Logout</button>
          </div>
        </div>
      </nav>
      <ProtectedRoute role={ROLES.INSURANCE_AGENT} theme={insuranceTheme}>
        <Routes>
          <Route path="/" element={<VinLookup />} />
          <Route path="/consent-wait/:vin/:consentId" element={<ConsentWait />} />
          <Route path="/quote/:vin" element={<QuotePage />} />
          <Route path="/policy-success/:policyNumber" element={<PolicySuccess />} />
        </Routes>
      </ProtectedRoute>
    </div>
  )
}
