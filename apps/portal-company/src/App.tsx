import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute, useAuthUser, ROLES, PortalTheme, getPortalDataspaceUrl, HackathonBanner } from '@eu-jap-hack/auth'
import CompanyList from './pages/CompanyList'
import CompanyDetail from './pages/CompanyDetail'

const companyTheme: PortalTheme = {
  portalName: 'Company Registry',
  subtitle: 'Organization Directory & Credentials',
  primaryColor: 'bg-slate-700',
  primaryHover: 'hover:bg-slate-800',
  accentGradient: 'bg-gradient-to-br from-slate-600 via-slate-700 to-gray-900',
  iconText: 'CR',
  iconBg: 'bg-slate-600',
  description: 'Browse registered organizations, view their verifiable credentials, and verify organizational trust across the dataspace network.',
  features: [
    'Browse all registered organizations in the dataspace',
    'View organizational Verifiable Credentials and trust status',
    'Verify company registration details (VAT, EORI, CIN, GST)',
    'Cross-reference organizational credentials for supply chain trust',
  ],
}

export default function App() {
  const { fullName, logout } = useAuthUser()

  return (
    <div className="min-h-screen bg-white">
      <HackathonBanner />
      <nav className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-slate-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-[9px]">CR</span>
            </div>
            <div>
              <span className="font-semibold text-gray-900 text-sm">Company Registry</span>
              <span className="text-gray-300 text-xs ml-2">Organization Directory</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={getPortalDataspaceUrl()} target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors">
              + Register
            </a>
            <span className="text-xs text-gray-400">{fullName}</span>
            <button onClick={() => logout()} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Logout</button>
          </div>
        </div>
      </nav>
      <ProtectedRoute role={ROLES.COMPANY_ADMIN} theme={companyTheme}>
        <Routes>
          <Route path="/" element={<CompanyList />} />
          <Route path="/company/:id" element={<CompanyDetail />} />
        </Routes>
      </ProtectedRoute>
    </div>
  )
}
