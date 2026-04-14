import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'
import { useCompany } from '../context/CompanyContext'

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
  ownerId?: string
  dpp?: {
    stateOfHealth?: { overallRating?: number }
    damageHistory?: { totalIncidents?: number }
    serviceHistory?: { totalServiceRecords?: number }
    performance?: { motorType?: string }
  }
}

export default function CarList() {
  const { accessToken } = useAuthUser()
  const { company, loading: companyLoading } = useCompany()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    if (companyLoading || !company) return
    const api = createAuthAxios(() => accessToken)
    api.get(`${API_BASE}/cars?companyId=${company.id}`)
      .then(r => { setCars(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [accessToken, company, companyLoading])

  const filtered = cars.filter(c => {
    const matchSearch = !search ||
      c.vin.toLowerCase().includes(search.toLowerCase()) ||
      c.model.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total: cars.length,
    available: cars.filter(c => c.status === 'available').length,
    sold: cars.filter(c => c.status === 'sold').length,
    avgCondition: cars.length
      ? (cars.reduce((sum, c) => sum + (c.dpp?.stateOfHealth?.overallRating || 0), 0) / cars.length).toFixed(1)
      : 'N/A'
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total', value: String(stats.total) },
          { label: 'Available', value: String(stats.available) },
          { label: 'Sold', value: String(stats.sold) },
          { label: 'Avg Condition', value: `${stats.avgCondition}/10` },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[#E5EAF0] rounded-xl p-4 text-center hover:shadow-sm transition-shadow">
            <p className="text-xl font-semibold text-[#1F1F1F]">{s.value}</p>
            <p className="text-[11px] text-[#9AA0A6] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E5EAF0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#E5EAF0]">
          <h1 className="text-sm font-medium text-[#1F1F1F]">Fleet DPP Management</h1>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search VIN or model..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-[#E5EAF0] rounded-lg px-3 py-1.5 text-xs w-48 focus:outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]/20 transition-all"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-[#E5EAF0] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#4285F4]"
            >
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-2 border-[#E5EAF0] border-t-[#4285F4] rounded-full"></div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-[#9AA0A6] uppercase tracking-wider border-b border-[#F1F3F6]">
                <th className="text-left px-5 py-3 font-medium">VIN</th>
                <th className="text-left px-5 py-3 font-medium">Vehicle</th>
                <th className="text-left px-5 py-3 font-medium">Year</th>
                <th className="text-left px-5 py-3 font-medium">Price</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Condition</th>
                <th className="text-left px-5 py-3 font-medium">Incidents</th>
                <th className="text-left px-5 py-3 font-medium">Owner</th>
                <th className="text-left px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F6]">
              {filtered.map(car => (
                <tr key={car.vin} className="hover:bg-[#F8FAFD] transition-colors">
                  <td className="px-5 py-3 font-mono text-[#5F6368]">{car.vin}</td>
                  <td className="px-5 py-3">
                    <p className="text-[#1F1F1F]">{car.make} {car.model}</p>
                    <p className="text-[10px] text-[#9AA0A6]">{car.variant}</p>
                  </td>
                  <td className="px-5 py-3 text-[#5F6368]">{car.year}</td>
                  <td className="px-5 py-3 text-[#1F1F1F]">&euro;{car.price?.toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      car.status === 'available' ? 'text-[#34A853] bg-[#E6F4EA]' : 'text-[#9AA0A6] bg-[#F1F3F6]'
                    }`}>{car.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`font-medium ${
                      (car.dpp?.stateOfHealth?.overallRating || 0) >= 8 ? 'text-[#34A853]' :
                      (car.dpp?.stateOfHealth?.overallRating || 0) >= 6 ? 'text-[#FBBC05]' : 'text-[#EA4335]'
                    }`}>{car.dpp?.stateOfHealth?.overallRating?.toFixed(1) || 'N/A'}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={car.dpp?.damageHistory?.totalIncidents ? 'text-[#FBBC05]' : 'text-[#9AA0A6]'}>
                      {car.dpp?.damageHistory?.totalIncidents || 0}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {car.ownerId ? (
                      <span className="text-[10px] text-[#4285F4]">{car.ownerId}</span>
                    ) : (
                      <span className="text-[#9AA0A6]">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/car/${car.vin}`)}
                        className="text-[#4285F4] hover:text-[#3367D6] font-medium"
                      >
                        DPP &rarr;
                      </button>
                      <button
                        onClick={() => navigate('/create', { state: { duplicateFrom: car } })}
                        className="text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-0.5 rounded hover:bg-gray-50 transition-colors"
                        title="Duplicate this car's DPP as a new entry"
                      >
                        Duplicate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-[#9AA0A6] text-sm">No cars match filters</div>
        )}
      </div>
    </div>
  )
}
