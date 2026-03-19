import { Routes, Route } from 'react-router-dom'
import { useAuthUser, LoginPage, PortalTheme } from '@eu-jap-hack/auth'
import CarGrid from './pages/CarGrid'
import CarDetail from './pages/CarDetail'
import BuySuccess from './pages/BuySuccess'

const publicTheme: PortalTheme = {
  portalName: 'TATA Motors',
  subtitle: 'Digital Showroom & Car Marketplace',
  primaryColor: 'bg-[#4285F4]',
  primaryHover: 'hover:bg-[#3367D6]',
  accentGradient: 'bg-gradient-to-br from-[#4285F4] via-[#3367D6] to-[#1a47a0]',
  iconText: 'T',
  iconBg: 'bg-[#4285F4]',
  description: 'Browse the TATA Motors lineup with full Digital Product Passport transparency. View specifications, history, and buy with confidence.',
  features: [
    'Browse all TATA Motors vehicles with full specifications',
    'View Digital Product Passports — emissions, materials, service history',
    'Purchase vehicles and receive Ownership Verifiable Credentials',
    'Transparent vehicle data powered by the EU Digital Trust Framework',
  ],
  loginHint: 'Login as mario-sanchez / mario',
}

export default function App() {
  const { isAuthenticated, fullName, login, logout } = useAuthUser()

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      <nav className="bg-white border-b border-[#E5EAF0] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#4285F4] rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <span className="font-semibold text-[#1F1F1F]">TATA Motors</span>
            <span className="text-[#E5EAF0]">|</span>
            <span className="text-[#9AA0A6] text-sm">Digital Showroom</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9AA0A6]">Powered by Digital Product Passports</span>
            {isAuthenticated ? (
              <>
                <span className="text-xs text-[#5F6368]">{fullName}</span>
                <button onClick={() => logout()} className="text-xs text-[#9AA0A6] hover:text-[#5F6368] transition-colors">Logout</button>
              </>
            ) : (
              <a href="/login" className="text-xs text-[#4285F4] hover:text-[#3367D6] font-medium transition-colors">Login</a>
            )}
          </div>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<CarGrid />} />
        <Route path="/car/:vin" element={<CarDetail />} />
        <Route path="/buy-success/:vin" element={<BuySuccess />} />
        <Route path="/login" element={<LoginPage theme={publicTheme} />} />
      </Routes>
    </div>
  )
}
