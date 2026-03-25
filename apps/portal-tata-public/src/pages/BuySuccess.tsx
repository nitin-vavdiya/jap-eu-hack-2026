import { useParams, useNavigate } from 'react-router-dom'
import { getApiBase, getPortalWalletUrl } from '@eu-jap-hack/auth'

export default function BuySuccess() {
  const { vin } = useParams()
  const navigate = useNavigate()
  const carId = `${getApiBase()}/vehicle-registry/vehicles/${vin}`

  return (
    <div className="max-w-md mx-auto mt-24 px-6 text-center">
      <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Purchase Successful</h1>
      <p className="text-sm text-gray-400 mb-1">VIN <span className="font-mono text-gray-500">{vin}</span></p>
      <p className="text-sm text-gray-400 mb-6">An Ownership Credential has been issued to Mario Sanchez's wallet.</p>

      {/* Car ID */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-[#1A47A0] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[10px]">T</span>
          </div>
          <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">Your Car ID</p>
        </div>
        <p className="text-[11px] text-blue-800 font-mono break-all">{carId}</p>
        <p className="text-[10px] text-blue-500 mt-2">
          This is your vehicle's resolvable identifier in the Toyota Motor Corporation Vehicle Asset Registry.
          Third parties (like insurers) will use this Car ID to look up your vehicle — but protected data
          requires your explicit consent in the SmartSense Wallet.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-[8px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">Manufacturer-Hosted</span>
          <span className="text-[8px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">HTTPS Resolvable</span>
          <span className="text-[8px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">Owner-Controlled Access</span>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
        <p className="text-xs font-medium text-gray-500 mb-2">Next steps</p>
        <div className="space-y-1.5 text-sm text-gray-500">
          <p>Ownership VC added to SmartSense Wallet (port 3004)</p>
          <p>Car DPP now linked to your identity</p>
          <p>Get insurance at Tokio Marine Insurance Portal (port 3005)</p>
          <p>Share your Car ID with insurers to start a quote</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
          Back to Showroom
        </button>
        <a href={getPortalWalletUrl()} target="_blank" rel="noopener noreferrer"
          className="flex-1 bg-gray-900 text-white py-2.5 rounded text-sm font-medium hover:bg-gray-800 text-center transition-colors">
          Open Wallet
        </a>
      </div>
    </div>
  )
}
