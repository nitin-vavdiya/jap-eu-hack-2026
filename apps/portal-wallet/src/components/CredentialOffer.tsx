import { useState } from 'react'

interface Props {
  offer: {
    type: string
    issuer: string
    offerUrl?: string
  }
  onAccept: () => void
  onDecline: () => void
}

export default function CredentialOffer({ offer, onAccept, onDecline }: Props) {
  const [accepting, setAccepting] = useState(false)

  const handleAccept = async () => {
    setAccepting(true)
    onAccept()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-sm w-full shadow-xl">
        <div className="px-6 py-5 border-b border-gray-100">
          <p className="text-xs text-emerald-500 font-medium uppercase tracking-wide mb-1">Credential Offer</p>
          <p className="text-sm text-gray-500">A new verifiable credential is being offered to your wallet</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Credential Type</p>
            <p className="text-sm font-medium text-gray-900">{offer.type}</p>
          </div>

          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Issuer</p>
            <p className="text-xs text-gray-600">{offer.issuer}</p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <p className="text-[10px] text-emerald-600 font-medium">OID4VCI Credential Offer</p>
            <p className="text-[10px] text-emerald-500 mt-0.5">This credential will be issued using the OpenID for Verifiable Credential Issuance protocol.</p>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onDecline} disabled={accepting}
            className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            Decline
          </button>
          <button onClick={handleAccept} disabled={accepting}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded text-sm font-medium transition-colors disabled:opacity-50">
            {accepting ? 'Accepting...' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
