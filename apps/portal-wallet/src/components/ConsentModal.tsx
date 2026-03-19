interface Props {
  consent: Record<string, unknown>
  onApprove: () => void
  onDeny: () => void
}

export default function ConsentModal({ consent, onApprove, onDeny }: Props) {
  const dataRequested = consent.dataRequested as string[] | undefined
  const dataExcluded = consent.dataExcluded as string[] | undefined

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full shadow-xl">
        <div className="px-6 py-5 border-b border-[#E5EAF0]">
          <p className="text-xs text-[#FBBC05] font-medium uppercase tracking-wide mb-1">Data Access Request</p>
          <p className="text-sm text-[#5F6368]">Someone is requesting access to your vehicle data</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-0.5">Requester</p>
            <p className="text-sm font-medium text-[#1F1F1F]">{consent.requesterName as string}</p>
          </div>

          <div>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-0.5">Vehicle</p>
            <p className="text-xs font-mono text-[#5F6368] bg-[#F8FAFD] border border-[#E5EAF0] px-2.5 py-1.5 rounded-lg inline-block">{consent.vin as string}</p>
          </div>

          <div>
            <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-0.5">Purpose</p>
            <p className="text-xs text-[#5F6368]">{consent.purpose as string}</p>
          </div>

          {dataRequested && dataRequested.length > 0 && (
            <div>
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-1.5">Data Requested</p>
              <div className="flex flex-wrap gap-1">
                {dataRequested.map((d: string, i: number) => (
                  <span key={i} className="text-[10px] text-[#5F6368] bg-[#F1F3F6] px-2 py-0.5 rounded">{d}</span>
                ))}
              </div>
            </div>
          )}

          {dataExcluded && dataExcluded.length > 0 && (
            <div>
              <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-1.5">Excluded</p>
              <div className="flex flex-wrap gap-1">
                {dataExcluded.map((d: string, i: number) => (
                  <span key={i} className="text-[10px] text-[#9AA0A6] bg-[#FCE8E6] px-2 py-0.5 rounded line-through">{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onDeny} className="flex-1 border border-[#E5EAF0] text-[#5F6368] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F8FAFD] transition-colors">
            Deny
          </button>
          <button onClick={onApprove} className="flex-1 bg-[#34A853] hover:bg-[#1e7e34] text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
