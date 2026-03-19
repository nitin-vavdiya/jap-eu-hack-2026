import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthUser, createAuthAxios } from '@eu-jap-hack/auth'

const API_BASE = 'http://localhost:8000/api'

export default function VinLookup() {
  const { userId, accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [vin, setVin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLookup = async () => {
    if (!vin.trim()) return
    setLoading(true)
    setError('')

    try {
      const carResp = await axios.get(`${API_BASE}/cars/${vin.trim()}`)
      const car = carResp.data

      if (!car.ownerId) {
        setError('This vehicle has no registered owner. The customer must buy the car first at the TATA Public Portal (port 3003).')
        setLoading(false)
        return
      }

      const carOwnerId = car.ownerId

      const checkResp = await axios.get(`${API_BASE}/consent/check`, {
        params: { userId: carOwnerId, vin: vin.trim(), requesterId: userId }
      })

      if (checkResp.data.exists) {
        navigate(`/quote/${vin.trim()}`)
        return
      }

      const consentResp = await api.post(`/consent/request`, {
        requesterId: userId,
        requesterName: 'Digit Insurance',
        userId: carOwnerId,
        vin: vin.trim(),
        purpose: 'Insurance premium calculation based on vehicle condition and history',
        dataRequested: ['Vehicle Identity', 'Current Condition', 'Damage History', 'Service History', 'Ownership Chain'],
        dataExcluded: ['Personal Financial Data', 'Medical Records', 'Location History']
      })

      navigate(`/consent-wait/${vin.trim()}/${consentResp.data.id}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err.response?.data?.error || 'Vehicle not found. Please check the VIN.')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-sm mx-auto mt-24 px-6">
      <div className="text-center mb-10">
        <h1 className="text-xl font-semibold text-[#1F1F1F]">Get Insurance Quote</h1>
        <p className="text-sm text-[#9AA0A6] mt-1">Enter a VIN to get a quote based on its DPP</p>
      </div>

      <div>
        <label className="block text-xs text-[#9AA0A6] mb-1.5">Vehicle Identification Number</label>
        <input
          type="text"
          value={vin}
          onChange={e => { setVin(e.target.value.toUpperCase()); setError('') }}
          placeholder="e.g. TATA2023NEXON0001"
          className="w-full border border-[#E5EAF0] rounded-lg px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-[#FBBC05] focus:ring-1 focus:ring-[#FBBC05]/20 transition-all"
          onKeyDown={e => e.key === 'Enter' && handleLookup()}
        />

        {error && (
          <p className="mt-2 text-xs text-[#EA4335]">{error}</p>
        )}

        <button
          onClick={handleLookup}
          disabled={loading || !vin.trim()}
          className="w-full mt-4 bg-[#FBBC05] hover:bg-[#F59E0B] disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          {loading ? 'Checking...' : 'Get Quote'}
        </button>

        <div className="mt-6 pt-4 border-t border-[#E5EAF0]">
          <p className="text-[10px] text-[#9AA0A6] uppercase tracking-wide mb-2">Demo VINs</p>
          <div className="space-y-1">
            {['TATA2023NEXON0001', 'TATA2015HARR0002', 'TATA2020TIGO0003'].map(v => (
              <button key={v} onClick={() => setVin(v)} className="block text-xs font-mono text-[#9AA0A6] hover:text-[#FBBC05] transition-colors">
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
