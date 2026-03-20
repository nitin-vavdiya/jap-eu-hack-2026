import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute, useAuthUser, createAuthAxios, ROLES, PortalTheme, getApiBase, getPortalDataspaceUrl } from '@eu-jap-hack/auth'
import CarList from './pages/CarList'
import CarDPP from './pages/CarDPP'
import CreateCar from './pages/CreateCar'
import VehicleRegistry from './pages/VehicleRegistry'

const API = getApiBase()

const adminTheme: PortalTheme = {
  portalName: 'TATA Motors Admin',
  subtitle: 'Fleet & DPP Management Console',
  primaryColor: 'bg-[#4285F4]',
  primaryHover: 'hover:bg-[#3367D6]',
  accentGradient: 'bg-gradient-to-br from-[#4285F4] via-[#3367D6] to-[#1a47a0]',
  iconText: 'T',
  iconBg: 'bg-[#4285F4]',
  description: 'Manage your vehicle fleet, create and edit Digital Product Passports, and oversee the full lifecycle of every car in the TATA Motors ecosystem.',
  features: [
    'Create and manage Digital Product Passports for every vehicle',
    'Full 10-section DPP hierarchy: identity, powertrain, emissions, materials',
    'Track service history, damage records, and condition ratings',
    'Issue verifiable credentials for vehicle provenance',
  ],
  loginHint: 'Login as tata-admin / tata-admin',
}

function OrgVerificationBanner() {
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [status, setStatus] = useState<'loading' | 'verified' | 'unverified' | 'error'>('loading')

  useEffect(() => {
    api.get(`${API}/org-credentials`).then(r => {
      const creds = r.data as { verificationStatus: string; complianceResult?: { status: string; issuedCredential?: unknown } }[]
      const hasCompliant = creds.some(c => c.verificationStatus === 'verified' && c.complianceResult?.status === 'compliant' && c.complianceResult?.issuedCredential)
      setStatus(hasCompliant ? 'verified' : 'unverified')
    }).catch(() => setStatus('error'))
  }, [])

  if (status === 'loading' || status === 'verified') return null

  return (
    <div className="bg-[#FEF7E0] border-b border-[#FBBC05]/30">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-[#FBBC05] animate-pulse" />
        <p className="text-xs text-[#5F6368]">
          <span className="font-medium text-[#F59E0B]">Organization not verified.</span>
          {' '}Register and verify your organization credential in the{' '}
          <a href={getPortalDataspaceUrl()} className="text-[#4285F4] font-medium hover:underline">Dataspace Portal</a>
          {' '}to unlock full functionality.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { fullName, logout } = useAuthUser()

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      <nav className="bg-white border-b border-[#E5EAF0] px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#4285F4] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <div>
              <span className="font-semibold text-[#1F1F1F] text-sm">TATA Motors Admin</span>
              <span className="text-[#9AA0A6] text-xs ml-2">DPP Management</span>
            </div>
          </a>
          <div className="flex items-center gap-4">
            <a href="/" className="text-xs text-[#5F6368] hover:text-[#1F1F1F] font-medium transition-colors">
              Fleet
            </a>
            <a href="/registry" className="text-xs text-[#5F6368] hover:text-[#1F1F1F] font-medium transition-colors">
              Vehicle Registry
            </a>
            <a href="/create" className="text-xs text-white bg-[#4285F4] hover:bg-[#3367D6] px-4 py-2 rounded-lg font-medium transition-colors">
              + Create New Car
            </a>
            <span className="text-xs text-[#9AA0A6]">{fullName}</span>
            <button onClick={() => logout()} className="text-xs text-[#9AA0A6] hover:text-[#5F6368] transition-colors">
              Logout
            </button>
          </div>
        </div>
      </nav>
      <OrgVerificationBanner />
      <ProtectedRoute role={ROLES.ADMIN} theme={adminTheme}>
        <Routes>
          <Route path="/" element={<CarList />} />
          <Route path="/car/:vin" element={<CarDPP />} />
          <Route path="/create" element={<CreateCar />} />
          <Route path="/registry" element={<VehicleRegistry />} />
        </Routes>
      </ProtectedRoute>
    </div>
  )
}
