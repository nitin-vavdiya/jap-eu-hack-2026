import { ReactNode } from 'react'

const typeConfig: Record<string, { accentBg: string; accentText: string; borderColor: string; label: string; icon: ReactNode }> = {
  SelfVC: {
    accentBg: 'bg-[#E6F4EA]', accentText: 'text-[#34A853]', borderColor: 'border-l-[#34A853]',
    label: 'Identity Credential',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
  },
  OwnershipVC: {
    accentBg: 'bg-[#E8F0FE]', accentText: 'text-[#4285F4]', borderColor: 'border-l-[#4285F4]',
    label: 'Vehicle Ownership',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
  },
  InsuranceVC: {
    accentBg: 'bg-[#FEF7E0]', accentText: 'text-[#FBBC05]', borderColor: 'border-l-[#FBBC05]',
    label: 'Insurance Policy',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  },
  OrgVC: {
    accentBg: 'bg-[#E8F0FE]', accentText: 'text-[#4285F4]', borderColor: 'border-l-[#4285F4]',
    label: 'Organization',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
  },
}

interface Props {
  credential: Record<string, unknown>
  onClick: () => void
  extra?: ReactNode
}

export default function CredentialCard({ credential, onClick, extra }: Props) {
  const credType = credential.type as string
  const config = typeConfig[credType] || {
    accentBg: 'bg-[#F1F3F6]', accentText: 'text-[#5F6368]', borderColor: 'border-l-[#9AA0A6]',
    label: credType,
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  }
  const subject = credential.credentialSubject as Record<string, unknown> | undefined

  return (
    <div className={`bg-white border border-[#E5EAF0] border-l-4 ${config.borderColor} rounded-xl overflow-hidden hover:shadow-md transition-all`}>
      <div onClick={onClick} className="p-4 cursor-pointer">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 ${config.accentBg} ${config.accentText} rounded-xl flex items-center justify-center flex-shrink-0`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className={`font-semibold text-sm ${config.accentText}`}>{credType}</h3>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                credential.status === 'active' ? 'bg-[#E6F4EA] text-[#34A853]' : 'bg-[#F1F3F6] text-[#5F6368]'
              }`}>{credential.status as string}</span>
            </div>
            <p className="text-[11px] text-[#5F6368]">{config.label}</p>

            {/* Rich previews */}
            {credType === 'SelfVC' && subject && (
              <div className="mt-2 flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-[#1F1F1F]">{String(subject.name)}</p>
                  <p className="text-[10px] text-[#9AA0A6]">{String(subject.nationality)} &middot; {String(subject.email)}</p>
                </div>
              </div>
            )}
            {credType === 'OwnershipVC' && subject && (
              <div className="mt-2 bg-[#E8F0FE]/50 rounded-lg p-2.5">
                <p className="text-sm font-medium text-[#1F1F1F]">{String(subject.make)} {String(subject.model)} ({String(subject.year)})</p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-[10px] font-mono text-[#9AA0A6]">{String(subject.vin)}</p>
                  <p className="text-[10px] text-[#9AA0A6]">&euro;{Number(subject.purchasePrice).toLocaleString()}</p>
                </div>
              </div>
            )}
            {credType === 'InsuranceVC' && subject && (
              <div className="mt-2 bg-[#FEF7E0]/50 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1F1F1F]">Comprehensive</p>
                    <p className="text-[10px] text-[#9AA0A6]">Policy #{String(subject.policyNumber)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-[#FBBC05]">&euro;{String(subject.annualPremium)}</p>
                    <p className="text-[10px] text-[#9AA0A6]">/year</p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-[10px] text-[#9AA0A6] mt-2">Issued by {credential.issuerName as string} &middot; {new Date(credential.issuedAt as string).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
      {extra && <div className="px-4 pb-4">{extra}</div>}
    </div>
  )
}
