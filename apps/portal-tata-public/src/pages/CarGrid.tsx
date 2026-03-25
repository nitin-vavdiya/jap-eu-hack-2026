import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

interface Car {
  id: string
  vin: string
  make: string
  model: string
  variant: string
  year: number
  price: number
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
      mileageKm?: number
    }
    ownershipChain?: {
      previousOwners?: unknown[]
    }
  }
}

// Car images mapped by VIN (Wikimedia Commons)
const carImages: Record<string, string> = {
  'TOYO2025BZ4X000001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/2026_Toyota_bZ4X_Auto_Zuerich_2025_DSC_3391.jpg/1280px-2026_Toyota_bZ4X_Auto_Zuerich_2025_DSC_3391.jpg',
  'TOYO2024RAV4HY0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/2024_Toyota_RAV4_2.5_LTD_HEV_in_White_Pearl_Crystal_Shine%2C_front_right%2C_06-09-2024.jpg/1280px-2024_Toyota_RAV4_2.5_LTD_HEV_in_White_Pearl_Crystal_Shine%2C_front_right%2C_06-09-2024.jpg',
  'TOYO2023CAMRYH0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/2022_Toyota_Camry_Hybrid_XLE_in_Midnight_Black_Metallic%2C_Front_Right%2C_12-25-2021.jpg/1280px-2022_Toyota_Camry_Hybrid_XLE_in_Midnight_Black_Metallic%2C_Front_Right%2C_12-25-2021.jpg',
  'TOYO2022LANDCR0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/2021_Toyota_Land_Cruiser_300_%28Russia%29_front_view.jpg/1280px-2021_Toyota_Land_Cruiser_300_%28Russia%29_front_view.jpg',
  'TOYO2020COROLL0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/2020_Toyota_Corolla_SE%2C_front_2.29.20.jpg/1280px-2020_Toyota_Corolla_SE%2C_front_2.29.20.jpg',
  'TOYO2025YARISCR001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/2024_Toyota_Yaris_Cross_GR_Sport_front.jpg/1280px-2024_Toyota_Yaris_Cross_GR_Sport_front.jpg',
  'TOYO2018PRIUSH0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/2019_Toyota_Prius_AWD-e_in_Super_White%2C_Front_Left%2C_08-21-2022.jpg/1280px-2019_Toyota_Prius_AWD-e_in_Super_White%2C_Front_Left%2C_08-21-2022.jpg',
  'TOYO2024CHRHYB0001': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Toyota_C-HR%2B_Auto_Zuerich_2025_DSC_3053.jpg/1280px-Toyota_C-HR%2B_Auto_Zuerich_2025_DSC_3053.jpg',
}

// Fallback images by model name
const modelImages: Record<string, string> = {
  'bZ4X': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/2026_Toyota_bZ4X_Auto_Zuerich_2025_DSC_3391.jpg/1280px-2026_Toyota_bZ4X_Auto_Zuerich_2025_DSC_3391.jpg',
  'RAV4 Hybrid': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/2024_Toyota_RAV4_2.5_LTD_HEV_in_White_Pearl_Crystal_Shine%2C_front_right%2C_06-09-2024.jpg/1280px-2024_Toyota_RAV4_2.5_LTD_HEV_in_White_Pearl_Crystal_Shine%2C_front_right%2C_06-09-2024.jpg',
  'Camry Hybrid': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/2022_Toyota_Camry_Hybrid_XLE_in_Midnight_Black_Metallic%2C_Front_Right%2C_12-25-2021.jpg/1280px-2022_Toyota_Camry_Hybrid_XLE_in_Midnight_Black_Metallic%2C_Front_Right%2C_12-25-2021.jpg',
  'Land Cruiser': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/2021_Toyota_Land_Cruiser_300_%28Russia%29_front_view.jpg/1280px-2021_Toyota_Land_Cruiser_300_%28Russia%29_front_view.jpg',
  'Corolla': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/2020_Toyota_Corolla_SE%2C_front_2.29.20.jpg/1280px-2020_Toyota_Corolla_SE%2C_front_2.29.20.jpg',
  'Yaris Cross': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/2024_Toyota_Yaris_Cross_GR_Sport_front.jpg/1280px-2024_Toyota_Yaris_Cross_GR_Sport_front.jpg',
  'Prius': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/2019_Toyota_Prius_AWD-e_in_Super_White%2C_Front_Left%2C_08-21-2022.jpg/1280px-2019_Toyota_Prius_AWD-e_in_Super_White%2C_Front_Left%2C_08-21-2022.jpg',
  'C-HR Hybrid': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Toyota_C-HR%2B_Auto_Zuerich_2025_DSC_3053.jpg/1280px-Toyota_C-HR%2B_Auto_Zuerich_2025_DSC_3053.jpg',
}

function getCarImage(car: Car): string {
  return carImages[car.vin] || modelImages[car.model] || modelImages['Corolla'] || ''
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
          {cars.map(car => {
            const imageUrl = getCarImage(car)
            const mileage = car.dpp?.stateOfHealth?.mileageKm
            const owners = (car.dpp?.ownershipChain?.previousOwners?.length ?? 0) + 1

            return (
              <div key={car.vin} className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden hover:shadow-md hover:border-[#4285F4]/30 transition-all group">
                <div className="h-48 bg-[#F6F8FA] relative overflow-hidden">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={`${car.make} ${car.model}`}
                      className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-[#9AA0A6]">
                      {car.dpp?.performance?.motorType === 'BEV' ? '\u26A1' : '\u{1F697}'}
                    </div>
                  )}
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
                  {mileage != null && mileage > 0 && (
                    <div className="absolute bottom-3 right-3 bg-black/60 text-white px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm">
                      {mileage >= 1000 ? `${Math.round(mileage / 1000)}k km` : `${mileage} km`}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-[11px] text-[#9AA0A6] mb-0.5">{car.year} &middot; {car.variant}</p>
                  <h3 className="font-medium text-[#1F1F1F]">{car.make} {car.model}</h3>
                  <p className="text-[#4285F4] font-semibold text-lg mt-1">&euro;{car.price?.toLocaleString()}</p>
                  <p className="text-[10px] text-[#9AA0A6] font-mono mt-1">{car.vin}</p>

                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-[#5F6368] border border-[#E5EAF0] px-1.5 py-0.5 rounded">DPP</span>
                    {car.dpp?.performance?.motorType === 'BEV' && (
                      <span className="text-[10px] text-[#34A853] border border-[#34A853]/20 px-1.5 py-0.5 rounded">EV</span>
                    )}
                    {owners > 1 && (
                      <span className="text-[10px] text-[#9AA0A6] border border-[#E5EAF0] px-1.5 py-0.5 rounded">{owners} owners</span>
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
            )
          })}
        </div>
      </div>
    </div>
  )
}
