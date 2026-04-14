import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute, useAuthUser, ROLES, PortalTheme, getPortalDataspaceUrl, HackathonBanner } from '@eu-jap-hack/auth'
import CarList from './pages/CarList'
import CarDPP from './pages/CarDPP'
import CreateCar from './pages/CreateCar'
import VehicleRegistry from './pages/VehicleRegistry'
import CaddePage from './pages/CaddePage'
import CompanyProfile from './pages/CompanyProfile'
import { CompanyProvider, useCompany } from './context/CompanyContext'

const adminTheme: PortalTheme = {
  portalName: 'Company Admin',
  subtitle: 'Fleet & DPP Management Console',
  primaryColor: 'bg-[#4285F4]',
  primaryHover: 'hover:bg-[#3367D6]',
  accentGradient: 'bg-gradient-to-br from-[#4285F4] via-[#3367D6] to-[#1a47a0]',
  iconText: 'CA',
  iconBg: 'bg-[#4285F4]',
  description: 'Manage your company fleet, create and edit Digital Product Passports, and oversee the full lifecycle of every asset in the dataspace.',
  features: [
    'Create and manage Digital Product Passports for every vehicle',
    'Full 10-section DPP hierarchy: identity, powertrain, emissions, materials',
    'Track service history, damage records, and condition ratings',
    'Issue verifiable credentials for vehicle provenance',
  ],
}

function OrgVerificationBanner() {
  const { isGaiaxVerified, loading } = useCompany()
  if (loading || isGaiaxVerified) return null

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

function AppShell() {
  const { fullName, logout } = useAuthUser()
  const { company } = useCompany()

  const companyName = company?.name ?? ''
  const initials = companyName
    ? companyName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : 'CA'

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      <HackathonBanner />
      <nav className="bg-white border-b border-[#E5EAF0] px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#4285F4] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">{initials}</span>
            </div>
            <div>
              <span className="font-semibold text-[#1F1F1F] text-sm">{companyName || 'Company Admin'}</span>
              <span className="text-[#9AA0A6] text-xs ml-2">DPP Management</span>
            </div>
          </a>
          <div className="flex items-center gap-4">
            <a href="/company" className="text-xs text-[#5F6368] hover:text-[#1F1F1F] font-medium transition-colors">
              Company Profile
            </a>
            <a href="/cadde" className="text-xs text-[#5F6368] hover:text-[#1F1F1F] font-medium transition-colors">
              CADDE
            </a>
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
      <Routes>
        <Route path="/" element={<CarList />} />
        <Route path="/car/:vin" element={<CarDPP />} />
        <Route path="/create" element={<CreateCar />} />
        <Route path="/registry" element={<VehicleRegistry />} />
        <Route path="/cadde" element={<CaddePage />} />
        <Route path="/company" element={<CompanyProfile />} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <ProtectedRoute role={ROLES.COMPANY_ADMIN} theme={adminTheme}>
      <CompanyProvider>
        <AppShell />
      </CompanyProvider>
    </ProtectedRoute>
  )
}
