import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

export default function ConsentWait() {
  const { vin, consentId } = useParams<{ vin: string; consentId: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState('pending')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API_BASE}/consent/${consentId}`)
        setStatus(r.data.status)
        if (r.data.status === 'approved') {
          clearInterval(intervalRef.current!)
          navigate(`/quote/${vin}`)
        } else if (r.data.status === 'denied') {
          clearInterval(intervalRef.current!)
        }
      } catch {
        // ignore
      }
    }, 2000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [consentId, vin, navigate])

  return (
    <div className="max-w-sm mx-auto mt-24 px-6 text-center">
      {status === 'denied' ? (
        <>
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Consent Denied</h1>
          <p className="text-sm text-gray-400 mb-6">The vehicle owner denied access. Quote cannot be generated.</p>
          <button onClick={() => navigate('/')} className="bg-gray-900 text-white px-6 py-2 rounded text-sm font-medium">Try Another VIN</button>
        </>
      ) : (
        <>
          <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></div>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Waiting for Consent</h1>
          <p className="text-sm text-gray-400 mb-1">A request has been sent to the vehicle owner's wallet.</p>
          <p className="text-xs text-gray-300 font-mono mb-8">{vin}</p>

          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <p className="text-xs font-medium text-gray-500 mb-2">Waiting for the owner to:</p>
            <ol className="space-y-1 text-xs text-gray-400">
              <li>1. Open SmartSense Wallet (port 3004)</li>
              <li>2. Review the consent request</li>
              <li>3. Click Approve</li>
            </ol>
          </div>

          <div className="mt-8 flex items-center justify-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </>
      )}
    </div>
  )
}
