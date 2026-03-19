import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

interface Car {
  id: string
  vin: string
  make: string
  model: string
  variant: string
  year: number
  price: number
  imageUrl?: string
  status: string
  dpp: {
    performance?: {
      motorType?: string
    }
    damageHistory?: {
      totalIncidents?: number
    }
    stateOfHealth?: {
      overallRating?: number
    }
  }
}

const modelGradients: Record<string, string> = {
  'Nexon EV Max': 'from-[#E8F0FE] to-[#F8FAFD]',
  'Harrier': 'from-[#FEF7E0] to-[#F8FAFD]',
  'Tigor EV': 'from-[#E6F4EA] to-[#F8FAFD]',
  'Safari': 'from-[#F1F3F6] to-[#FEF7E0]',
  'Punch EV': 'from-[#E6F4EA] to-[#F8FAFD]',
  'Curvv EV': 'from-[#E8F0FE] to-[#F1F3F6]',
  'Altroz': 'from-[#FCE8E6] to-[#F8FAFD]',
  'Tiago EV': 'from-[#E8F0FE] to-[#E6F4EA]',
  'Nexon': 'from-[#E8F0FE] to-[#F8FAFD]',
  'Sierra EV': 'from-[#F1F3F6] to-[#F8FAFD]',
  'Avinya': 'from-[#E8F0FE] to-[#F1F3F6]',
  'Punch': 'from-[#FEF7E0] to-[#F8FAFD]',
  'Tiago': 'from-[#E6F4EA] to-[#E8F0FE]',
  'Tigor': 'from-[#E8F0FE] to-[#F8FAFD]',
}

const modelIcons: Record<string, string> = {
  'BEV': '\u26A1',
  'ICE': '\u2699\uFE0F',
  'Hybrid': '\u267B\uFE0F',
}

function getGradient(model: string): string {
  return modelGradients[model] || 'from-[#F1F3F6] to-[#F8FAFD]'
}

export default function CarGrid() {
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    axios.get(`${API_BASE}/cars`).then(r => {
      setCars(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full"></div>
    </div>
  )

  return (
    <div>
      <div className="bg-white border-b border-[#E5EAF0] py-16 px-8 text-center">
        <h1 className="text-3xl font-semibold text-[#1F1F1F] mb-2">Find Your Perfect Car</h1>
        <p className="text-[#9AA0A6] text-sm">Every vehicle comes with a verified Digital Product Passport</p>
        <div className="mt-5 flex justify-center gap-3 text-xs">
          <span className="border border-[#E5EAF0] text-[#5F6368] px-3 py-1 rounded-full">{cars.filter(c => c.status === 'available').length} Available</span>
          <span className="border border-[#E5EAF0] text-[#5F6368] px-3 py-1 rounded-full">{cars.length} Total</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {cars.map(car => (
            <div key={car.vin} className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden hover:shadow-md hover:border-[#4285F4]/30 transition-all group">
              <div className={`h-44 bg-gradient-to-br ${getGradient(car.model)} flex flex-col items-center justify-center relative`}>
                <span className="text-4xl mb-1">{modelIcons[car.dpp?.performance?.motorType || 'ICE'] || '\u{1F697}'}</span>
                <span className="text-sm font-semibold text-[#5F6368]">{car.make} {car.model}</span>
                <span className="text-[10px] text-[#9AA0A6] mt-0.5">{car.variant}</span>
                <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase ${
                  car.status === 'available' ? 'bg-[#E6F4EA] text-[#34A853] border border-[#34A853]/20' : 'bg-[#F1F3F6] text-[#9AA0A6] border border-[#E5EAF0]'
                }`}>
                  {car.status}
                </div>
                {(car.dpp?.damageHistory?.totalIncidents || 0) > 0 && (
                  <div className="absolute top-3 left-3 bg-[#FBBC05] text-white px-2 py-0.5 rounded-full text-[10px] font-medium">
                    {car.dpp.damageHistory!.totalIncidents} Damage{car.dpp.damageHistory!.totalIncidents! > 1 ? 's' : ''}
                  </div>
                )}
                {car.dpp?.stateOfHealth?.overallRating && (
                  <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    car.dpp.stateOfHealth.overallRating >= 8 ? 'bg-[#34A853] text-white' :
                    car.dpp.stateOfHealth.overallRating >= 6 ? 'bg-[#FBBC05] text-white' : 'bg-[#EA4335] text-white'
                  }`}>
                    {car.dpp.stateOfHealth.overallRating.toFixed(1)}/10
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-[11px] text-[#9AA0A6] mb-0.5">{car.year} &middot; {car.variant}</p>
                <h3 className="font-medium text-[#1F1F1F]">{car.make} {car.model}</h3>
                <p className="text-[#4285F4] font-semibold text-lg mt-1">&euro;{car.price?.toLocaleString()}</p>
                <p className="text-[10px] text-[#9AA0A6] font-mono mt-1">{car.vin}</p>

                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-[10px] text-[#5F6368] border border-[#E5EAF0] px-1.5 py-0.5 rounded">DPP</span>
                  {car.dpp?.performance?.motorType === 'BEV' && (
                    <span className="text-[10px] text-[#34A853] border border-[#34A853]/20 px-1.5 py-0.5 rounded">EV</span>
                  )}
                </div>

                {car.status === 'available' ? (
                  <button
                    onClick={() => navigate(`/car/${car.vin}`)}
                    className="w-full mt-4 bg-[#1F1F1F] hover:bg-[#333] text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    View &amp; Buy
                  </button>
                ) : (
                  <button disabled className="w-full mt-4 bg-[#F1F3F6] text-[#9AA0A6] py-2 rounded-lg text-sm font-medium cursor-not-allowed">
                    Sold
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
