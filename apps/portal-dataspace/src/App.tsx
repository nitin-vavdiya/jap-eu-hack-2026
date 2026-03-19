import { Routes, Route, NavLink } from 'react-router-dom'
import { ProtectedRoute, useAuthUser, ROLES, PortalTheme } from '@eu-jap-hack/auth'
import CompanyRegistration from './pages/CompanyRegistration'
import RegistrationSuccess from './pages/RegistrationSuccess'
import OrgCredentialsList from './pages/OrgCredentialsList'
import CreateOrgCredential from './pages/CreateOrgCredential'
import OrgCredentialDetail from './pages/OrgCredentialDetail'
import GaiaXHealth from './pages/GaiaXHealth'

const dataspaceTheme: PortalTheme = {
  portalName: 'EU APAC Dataspace',
  subtitle: 'Organization Registry & Credential Management',
  primaryColor: 'bg-[#4285F4]',
  primaryHover: 'hover:bg-[#3367D6]',
  accentGradient: 'bg-gradient-to-br from-[#4285F4] via-[#3367D6] to-[#1a47a0]',
  iconText: 'DS',
  iconBg: 'bg-[#4285F4]',
  description: 'Register your organization in the EU APAC Dataspace and manage verifiable credentials for cross-border digital trust.',
  features: [
    'Register organizations with VAT, EORI, or CIN identifiers',
    'Issue and manage Organizational Verifiable Credentials',
    'Gaia-X Loire trust framework compliance verification',
    'Built on EU digital trust framework standards',
  ],
  loginHint: 'Login as company-admin / company',
}

const navLinks = [
  { to: '/', label: 'Credentials' },
  { to: '/create', label: 'Create New' },
  { to: '/register', label: 'Register Org' },
  { to: '/gaiax-health', label: 'Gaia-X Status' },
]

export default function App() {
  const { fullName, logout } = useAuthUser()

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      <nav className="bg-white border-b border-[#E5EAF0] px-6 py-0 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 py-4">
              <div className="w-8 h-8 bg-[#4285F4] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">DS</span>
              </div>
              <div>
                <span className="font-semibold text-[#1F1F1F] text-sm">EU APAC Dataspace</span>
                <span className="text-[#9AA0A6] text-xs ml-2">Organization Registry</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {navLinks.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-4 text-xs font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-[#4285F4] text-[#4285F4]'
                        : 'border-transparent text-[#5F6368] hover:text-[#1F1F1F] hover:border-[#E5EAF0]'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9AA0A6]">{fullName}</span>
            <button onClick={() => logout()} className="text-xs text-[#9AA0A6] hover:text-[#5F6368] transition-colors">Logout</button>
          </div>
        </div>
      </nav>
      <ProtectedRoute role={ROLES.COMPANY_ADMIN} theme={dataspaceTheme}>
        <Routes>
          <Route path="/" element={<OrgCredentialsList />} />
          <Route path="/create" element={<CreateOrgCredential />} />
          <Route path="/credential/:id" element={<OrgCredentialDetail />} />
          <Route path="/register" element={<CompanyRegistration />} />
          <Route path="/success/:companyId" element={<RegistrationSuccess />} />
          <Route path="/gaiax-health" element={<GaiaXHealth />} />
        </Routes>
      </ProtectedRoute>
    </div>
  )
}
