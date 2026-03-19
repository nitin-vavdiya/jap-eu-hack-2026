import { useParams, useNavigate } from 'react-router-dom'

export default function BuySuccess() {
  const { vin } = useParams()
  const navigate = useNavigate()

  return (
    <div className="max-w-md mx-auto mt-24 px-6 text-center">
      <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Purchase Successful</h1>
      <p className="text-sm text-gray-400 mb-1">VIN <span className="font-mono text-gray-500">{vin}</span></p>
      <p className="text-sm text-gray-400 mb-8">An Ownership Credential has been issued to Mario Sanchez's wallet.</p>

      <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
        <p className="text-xs font-medium text-gray-500 mb-2">Next steps</p>
        <div className="space-y-1.5 text-sm text-gray-500">
          <p>Ownership VC added to SmartSense Wallet (port 3004)</p>
          <p>Car DPP now linked to your identity</p>
          <p>Get insurance at Digit Insurance Portal (port 3005)</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
          Back to Showroom
        </button>
        <a href="http://localhost:3004" target="_blank" rel="noopener noreferrer"
          className="flex-1 bg-gray-900 text-white py-2.5 rounded text-sm font-medium hover:bg-gray-800 text-center transition-colors">
          Open Wallet
        </a>
      </div>
    </div>
  )
}
