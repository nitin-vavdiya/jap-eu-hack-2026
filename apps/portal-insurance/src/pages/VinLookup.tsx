import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

interface ResolutionDoc {
  carId: string
  vin: string
  status: string
  manufacturer: { name: string; did: string; verificationStatus: string; registryEndpoint: string }
  vehicle: { make: string; model: string; year: number; variant: string; fuelType: string }
  ownership: { isSold: boolean; ownerWallet: string | null }
  dppReference: { semanticId: string; endpoint: string; accessLevel: string }
  serviceEndpoints: Record<string, string>
  supportedDataCategories: Array<{ category: string; accessLevel: string }>
}

interface PublicSummary {
  make: string; model: string; year: number; variant: string; fuelType: string; color: string; status: string
  manufacturer: { name: string; country: string; did: string }
  sustainability: Record<string, string>
  trustIndicators: { hasDPP: boolean; hasManufacturerVC: boolean; isOwnershipTracked: boolean; manufacturerVerified: boolean }
  protectedDataAvailable: string[]
}

export default function VinLookup() {
  const { userId, accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [carId, setCarId] = useState('')
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')
  const [resolution, setResolution] = useState<ResolutionDoc | null>(null)
  const [publicSummary, setPublicSummary] = useState<PublicSummary | null>(null)
  const navigate = useNavigate()

  // Extract VIN from Car ID URL or use as-is
  const extractVin = (input: string): string => {
    const trimmed = input.trim()
    // If it's a full URL, extract VIN from the path
    const match = trimmed.match(/\/vehicles\/([A-Z0-9]+)$/i)
    if (match) return match[1]
    return trimmed
  }

  const handleResolve = async () => {
    if (!carId.trim()) return
    setResolving(true)
    setError('')
    setResolution(null)
    setPublicSummary(null)

    const vin = extractVin(carId)

    try {
      // Step 1: Resolve Car ID
      const resolveResp = await axios.get(`${API_BASE}/vehicle-registry/vehicles/${vin}`)
      setResolution(resolveResp.data)

      // Step 2: Fetch public summary
      const summaryResp = await axios.get(`${API_BASE}/vehicle-registry/vehicles/${vin}/public-summary`)
      setPublicSummary(summaryResp.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'Could not resolve Car ID. Vehicle not found in manufacturer registry.')
    }
    setResolving(false)
  }

  const handleRequestAccess = async () => {
    if (!resolution) return
    setLoading(true)
    setError('')

    try {
      const vin = resolution.vin
      const carResp = await axios.get(`${API_BASE}/cars/${vin}`)
      const car = carResp.data

      if (!car.ownerId) {
        setError('This vehicle has no registered owner. The customer must purchase the car first.')
        setLoading(false)
        return
      }

      // Check if consent already exists
      const checkResp = await axios.get(`${API_BASE}/consent/check`, {
        params: { userId: car.ownerId, vin, requesterId: userId }
      })

      if (checkResp.data.exists) {
        navigate(`/quote/${vin}`)
        return
      }

      // Create consent request
      const consentResp = await api.post(`/consent/request`, {
        requesterId: userId,
        requesterName: 'Tokio Marine',
        userId: car.ownerId,
        vin,
        purpose: 'Insurance premium calculation based on vehicle condition and history',
        dataRequested: ['Vehicle Identity', 'Current Condition', 'Damage History', 'Service History', 'Ownership Chain'],
        dataExcluded: ['Personal Financial Data', 'Medical Records', 'Location History']
      })

      navigate(`/consent-wait/${vin}/${consentResp.data.id}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'Failed to request access.')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 px-6">
      <div className="text-center mb-10">
        <h1 className="text-xl font-semibold text-[#1F1F1F]">Get Insurance Quote</h1>
        <p className="text-sm text-[#9AA0A6] mt-1">Enter a Car ID or VIN to resolve the vehicle from the manufacturer's registry</p>
      </div>

      {/* Input */}
      <div className="max-w-md mx-auto mb-8">
        <label className="block text-xs text-[#9AA0A6] mb-1.5">Car ID or VIN</label>
        <input
          type="text"
          value={carId}
          onChange={e => { setCarId(e.target.value); setError(''); setResolution(null); setPublicSummary(null) }}
          placeholder={`e.g. ${API_BASE}/vehicle-registry/vehicles/TOYO2025BZ4X000001`}
          className="w-full border border-[#E5EAF0] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#FBBC05] focus:ring-1 focus:ring-[#FBBC05]/20 transition-all"
          onKeyDown={e => e.key === 'Enter' && handleResolve()}
        />

        {error && <p className="mt-2 text-xs text-[#EA4335]">{error}</p>}

        <button
          onClick={handleResolve}
          disabled={resolving || !carId.trim()}
          className="w-full mt-3 bg-[#FBBC05] hover:bg-[#F59E0B] disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          {resolving ? 'Resolving...' : 'Resolve Car ID'}
        </button>

        <div className="mt-4 pt-3 border-t border-[#E5EAF0]">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Demo Car IDs</p>
          <div className="space-y-1">
            {['TOYO2025BZ4X000001', 'TOYO2022LANDCR0001', 'TOYO2018PRIUSH0001', 'TOYO2020COROLL0001'].map(v => (
              <button key={v} onClick={() => setCarId(`${API_BASE}/vehicle-registry/vehicles/${v}`)} className="block text-[11px] font-mono text-[#9AA0A6] hover:text-[#FBBC05] transition-colors truncate max-w-full">
                {`${API_BASE}/vehicle-registry/vehicles/${v}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resolution Result */}
      {resolution && (
        <div className="space-y-4">
          {/* Manufacturer verification badge */}
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="w-10 h-10 bg-[#1A47A0] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-blue-900">{resolution.manufacturer.name}</p>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                  resolution.manufacturer.verificationStatus === 'verified'
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}>
                  {resolution.manufacturer.verificationStatus === 'verified' ? 'Gaia-X Verified' : 'Registered'}
                </span>
              </div>
              <p className="text-[10px] text-blue-600 font-mono mt-0.5">{resolution.manufacturer.did}</p>
              <p className="text-[10px] text-blue-500 mt-0.5">Manufacturer-authoritative vehicle registry</p>
            </div>
          </div>

          {/* Public Summary */}
          {publicSummary && (
            <div className="border border-gray-100 rounded-xl p-5 bg-white">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">Public Vehicle Summary</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  { label: 'Make / Model', value: `${publicSummary.make} ${publicSummary.model}` },
                  { label: 'Year / Variant', value: `${publicSummary.year} ${publicSummary.variant}` },
                  { label: 'Energy Type', value: publicSummary.sustainability?.energyType || publicSummary.fuelType },
                  { label: 'Color', value: publicSummary.color },
                  { label: 'Status', value: publicSummary.status },
                  ...(publicSummary.sustainability?.range ? [{ label: 'Range', value: publicSummary.sustainability.range }] : []),
                  ...(publicSummary.sustainability?.batteryCapacity ? [{ label: 'Battery', value: publicSummary.sustainability.batteryCapacity }] : []),
                  { label: 'Plant', value: publicSummary.sustainability?.manufacturingPlant || 'N/A' },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-50">
                    <span className="text-[11px] text-gray-400">{row.label}</span>
                    <span className="text-[11px] text-gray-800 font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
              {/* Trust indicators */}
              <div className="mt-4 flex flex-wrap gap-2">
                {publicSummary.trustIndicators.hasDPP && (
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">DPP Available</span>
                )}
                {publicSummary.trustIndicators.hasManufacturerVC && (
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Manufacturer VC</span>
                )}
                {publicSummary.trustIndicators.isOwnershipTracked && (
                  <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">Owner Registered</span>
                )}
                {publicSummary.trustIndicators.manufacturerVerified && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">Manufacturer Verified</span>
                )}
              </div>
            </div>
          )}

          {/* Data Categories & Access Levels */}
          <div className="border border-gray-100 rounded-xl p-5 bg-white">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">Available Data &amp; Access Levels</p>
            <div className="space-y-1.5">
              {resolution.supportedDataCategories.map((cat, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-[11px] text-gray-700">{cat.category}</span>
                  <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                    cat.accessLevel === 'public'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : cat.accessLevel === 'insurer_allowed_with_consent'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-orange-50 text-orange-700 border border-orange-200'
                  }`}>
                    {cat.accessLevel === 'public' ? 'Public' : cat.accessLevel === 'insurer_allowed_with_consent' ? 'Insurer + Consent' : 'Consent Required'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Service Endpoints */}
          <div className="border border-gray-100 rounded-xl p-5 bg-white">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">Service Endpoints</p>
            <div className="space-y-1.5">
              {Object.entries(resolution.serviceEndpoints).slice(0, 6).map(([key, url]) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <span className="text-[11px] text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="text-[9px] text-gray-400 font-mono truncate max-w-[300px]">{url}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Car ID */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-1">Resolved Car ID</p>
            <p className="text-xs text-gray-800 font-mono break-all">{resolution.carId}</p>
            <p className="text-[10px] text-gray-400 mt-1">VIN: {resolution.vin}</p>
          </div>

          {/* Request Access Button */}
          {resolution.ownership.isSold ? (
            <button
              onClick={handleRequestAccess}
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white py-3.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Requesting...' : 'Request Owner Approval for Protected Data'}
            </button>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400">This vehicle has no registered owner yet. Insurance quotes require an owner.</p>
            </div>
          )}

          <p className="text-center text-[10px] text-gray-300">
            Protected data will be fetched from manufacturer-authoritative source after owner consent
          </p>
        </div>
      )}
    </div>
  )
}
