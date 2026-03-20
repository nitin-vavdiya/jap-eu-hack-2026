import { useParams, useNavigate } from 'react-router-dom'
import { getPortalCompanyUrl } from '@eu-jap-hack/auth'

export default function RegistrationSuccess() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="max-w-md mx-auto mt-24 px-6 text-center">
      <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Organization Registered</h1>
      <p className="text-sm text-gray-400 mb-8">Your OrgVC has been issued and is now verifiable on the EU APAC Dataspace.</p>

      <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Company ID</p>
        <p className="font-mono text-xs text-gray-600">{companyId}</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
        <p className="text-xs font-medium text-gray-500 mb-2">What was issued</p>
        <div className="space-y-1.5 text-sm text-gray-500">
          <p>Organization Credential (OrgVC) minted</p>
          <p>DID registered on EU APAC Dataspace</p>
          <p>Verifiable by all dataspace participants</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate('/')} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded text-sm font-medium hover:bg-gray-50 transition-colors">
          Register Another
        </button>
        <a href={getPortalCompanyUrl()} target="_blank" rel="noopener noreferrer"
          className="flex-1 bg-gray-900 text-white py-2.5 rounded text-sm font-medium hover:bg-gray-800 text-center transition-colors">
          Company Portal
        </a>
      </div>
    </div>
  )
}
