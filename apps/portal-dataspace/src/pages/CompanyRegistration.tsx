import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

interface FormState {
  name: string
  vatId: string
  eoriNumber: string
  cin: string
  gstNumber: string
  country: string
  city: string
  address: string
  adminName: string
  adminEmail: string
  acceptTerms: boolean
}

export default function CompanyRegistration() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>({
    name: '', vatId: '', eoriNumber: '', cin: '', gstNumber: '',
    country: '', city: '', address: '', adminName: '', adminEmail: '', acceptTerms: false
  })

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name) e.name = 'Required'
    if (!form.vatId && !form.eoriNumber && !form.cin && !form.gstNumber) e.ids = 'At least one identifier required'
    if (!form.country) e.country = 'Required'
    if (!form.adminName) e.adminName = 'Required'
    if (!form.adminEmail || !/\S+@\S+\.\S+/.test(form.adminEmail)) e.adminEmail = 'Valid email required'
    if (!form.acceptTerms) e.acceptTerms = 'Required'
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    try {
      const r = await axios.post(`${API_BASE}/companies`, form)
      navigate(`/success/${(r.data.company as Record<string, unknown>).id}`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      setErrors({ submit: axiosErr.response?.data?.error || 'Registration failed' })
    }
    setLoading(false)
  }

  const textField = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(f => ({ ...f, [key]: e.target.value }))
      setErrors(prev => { const n = { ...prev }; delete n[key]; return n })
    }
  })

  const inputClass = 'w-full border border-gray-200 rounded px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-300 transition-colors'

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Register Organization</h1>
        <p className="text-sm text-gray-400 mt-1">Join the EU APAC Dataspace and receive a verifiable OrgVC</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Company Name *</label>
          <input {...textField('name')} placeholder="TATA Motors Ltd." className={inputClass} />
          {errors.name && <p className="text-[11px] text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Registration Identifiers <span className="text-gray-300">(at least one)</span></label>
          {errors.ids && <p className="text-[11px] text-red-400 mb-2">{errors.ids}</p>}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'vatId' as const, label: 'VAT ID', ph: 'EU123456789' },
              { key: 'eoriNumber' as const, label: 'EORI', ph: 'GB987654321000' },
              { key: 'cin' as const, label: 'CIN', ph: 'U34100MH2004PLC' },
              { key: 'gstNumber' as const, label: 'GST', ph: '27AAACT2727Q1ZW' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-gray-400">{f.label}</label>
                <input {...textField(f.key)} placeholder={f.ph} className={`${inputClass} mt-0.5`} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Country *</label>
            <input {...textField('country')} placeholder="India" className={inputClass} />
            {errors.country && <p className="text-[11px] text-red-400 mt-1">{errors.country}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">City</label>
            <input {...textField('city')} placeholder="Mumbai" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Address</label>
          <input {...textField('address')} placeholder="Bombay House, 24 Homi Mody Street" className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Admin Name *</label>
            <input {...textField('adminName')} placeholder="John Smith" className={inputClass} />
            {errors.adminName && <p className="text-[11px] text-red-400 mt-1">{errors.adminName}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Admin Email *</label>
            <input {...textField('adminEmail')} type="email" placeholder="admin@company.com" className={inputClass} />
            {errors.adminEmail && <p className="text-[11px] text-red-400 mt-1">{errors.adminEmail}</p>}
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={form.acceptTerms}
            onChange={e => { setForm(f => ({ ...f, acceptTerms: e.target.checked })); setErrors(p => ({ ...p, acceptTerms: '' })) }}
            className="mt-0.5 w-4 h-4 accent-indigo-500"
          />
          <span className="text-xs text-gray-500 leading-relaxed">
            I accept the EU APAC Dataspace Terms of Service and authorize the issuance of a verifiable Organization Credential.
          </span>
        </label>
        {errors.acceptTerms && <p className="text-[11px] text-red-400">{errors.acceptTerms}</p>}

        {errors.submit && <p className="text-xs text-red-400 bg-red-50 rounded p-3">{errors.submit}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white py-3 rounded text-sm font-medium transition-colors"
        >
          {loading ? 'Registering...' : 'Register & Get Organization VC'}
        </button>
      </form>
    </div>
  )
}
