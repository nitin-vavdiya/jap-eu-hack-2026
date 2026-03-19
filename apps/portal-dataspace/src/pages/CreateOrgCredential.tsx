import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios } from '@eu-jap-hack/auth'

const API = 'http://localhost:8000/api'

interface FormData {
  legalName: string; vatId: string; eoriNumber: string; euid: string; leiCode: string; taxId: string; localId: string
  streetAddress: string; locality: string; postalCode: string; countryCode: string; countrySubdivisionCode: string
  hqStreetAddress: string; hqLocality: string; hqPostalCode: string; hqCountryCode: string; hqCountrySubdivisionCode: string
  website: string; contactEmail: string; did: string; validFrom: string; validUntil: string; sameAsLegal: boolean
}

const initial: FormData = {
  legalName: '', vatId: '', eoriNumber: '', euid: '', leiCode: '', taxId: '', localId: '',
  streetAddress: '', locality: '', postalCode: '', countryCode: '', countrySubdivisionCode: '',
  hqStreetAddress: '', hqLocality: '', hqPostalCode: '', hqCountryCode: '', hqCountrySubdivisionCode: '',
  website: '', contactEmail: '', did: '',
  validFrom: new Date().toISOString().split('T')[0],
  validUntil: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
  sameAsLegal: true,
}

const sections = [
  { key: 'entity', label: 'Legal Entity' }, { key: 'ids', label: 'Registration IDs' },
  { key: 'addr', label: 'Addresses' }, { key: 'contact', label: 'Domain & Contact' },
  { key: 'compliance', label: 'Compliance' }, { key: 'validity', label: 'Validity' },
]

export default function CreateOrgCredential() {
  const navigate = useNavigate()
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [form, setForm] = useState<FormData>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [section, setSection] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const set = (key: keyof FormData, value: string | boolean) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  const ic = (key: string) => `w-full border ${errors[key] ? 'border-[#EA4335]' : 'border-[#E5EAF0]'} bg-white rounded-lg px-3.5 py-2.5 text-sm text-[#1F1F1F] placeholder-[#9AA0A6] focus:outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 transition-all`

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.legalName.trim()) e.legalName = 'Required'
    if (!form.vatId && !form.eoriNumber && !form.euid && !form.leiCode && !form.taxId && !form.localId) e.ids = 'At least one identifier required'
    if (!form.streetAddress.trim()) e.streetAddress = 'Required'
    if (!form.locality.trim()) e.locality = 'Required'
    if (!form.postalCode.trim()) e.postalCode = 'Required'
    if (!form.countryCode.trim()) e.countryCode = 'Required'
    if (!form.contactEmail.trim() || !/\S+@\S+\.\S+/.test(form.contactEmail)) e.contactEmail = 'Valid email required'
    return e
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true); setSubmitError('')
    try {
      const res = await api.post(`${API}/org-credentials`, {
        legalName: form.legalName,
        legalRegistrationNumber: { vatId: form.vatId || undefined, eoriNumber: form.eoriNumber || undefined, euid: form.euid || undefined, leiCode: form.leiCode || undefined, taxId: form.taxId || undefined, localId: form.localId || undefined },
        legalAddress: { streetAddress: form.streetAddress, locality: form.locality, postalCode: form.postalCode, countryCode: form.countryCode, countrySubdivisionCode: form.countrySubdivisionCode || `${form.countryCode}-00` },
        headquartersAddress: form.sameAsLegal
          ? { streetAddress: form.streetAddress, locality: form.locality, postalCode: form.postalCode, countryCode: form.countryCode, countrySubdivisionCode: form.countrySubdivisionCode || `${form.countryCode}-00` }
          : { streetAddress: form.hqStreetAddress, locality: form.hqLocality, postalCode: form.hqPostalCode, countryCode: form.hqCountryCode, countrySubdivisionCode: form.hqCountrySubdivisionCode || `${form.hqCountryCode}-00` },
        website: form.website || undefined, contactEmail: form.contactEmail, did: form.did || undefined,
        validFrom: new Date(form.validFrom).toISOString(), validUntil: new Date(form.validUntil).toISOString(),
      })
      navigate(`/credential/${res.data.id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; details?: string[] } } }
      setSubmitError(e.response?.data?.details?.join(', ') || e.response?.data?.error || 'Failed to create credential')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <button onClick={() => navigate('/')} className="text-xs text-[#4285F4] hover:text-[#3367D6] mb-4">&larr; Back to credentials</button>
      <h1 className="text-xl font-semibold text-[#1F1F1F] mb-1">Create Organization Credential</h1>
      <p className="text-sm text-[#5F6368] mb-8">Provide your organization details for Gaia-X Loire trust framework verification</p>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {sections.map((s, i) => (
          <button key={s.key} onClick={() => setSection(i)} className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${section === i ? 'bg-[#4285F4] text-white shadow-sm' : 'bg-white border border-[#E5EAF0] text-[#5F6368] hover:border-[#4285F4]'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E5EAF0] rounded-xl p-8">
        {section === 0 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Legal Entity Information</h2>
            <div>
              <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Legal Name *</label>
              <input value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="TATA Motors Limited" className={ic('legalName')} />
              {errors.legalName && <p className="text-[11px] text-[#EA4335] mt-1">{errors.legalName}</p>}
            </div>
          </div>
        )}

        {section === 1 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Registration Identifiers</h2>
            <p className="text-xs text-[#5F6368]">At least one legal registration number required for Gaia-X verification.</p>
            {errors.ids && <p className="text-[11px] text-[#EA4335] bg-[#FCE8E6] px-3 py-2 rounded-lg">{errors.ids}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([['vatId','VAT ID','EU123456789'],['eoriNumber','EORI','GB987654321000'],['euid','EUID','DE.HRB.12345'],['leiCode','LEI Code','5299001IOLKPT7LVN868'],['taxId','Tax ID','IN27AAACT2727Q1Z'],['localId','Local ID (CIN)','L28920MH1945PLC004415']] as const).map(([k,l,p]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-[#5F6368] mb-1">{l}</label>
                  <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={p} className={ic(k)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Legal Address *</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Street Address *</label>
                <input value={form.streetAddress} onChange={e => set('streetAddress', e.target.value)} placeholder="Bombay House, 24 Homi Mody Street" className={ic('streetAddress')} />
                {errors.streetAddress && <p className="text-[11px] text-[#EA4335] mt-1">{errors.streetAddress}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">City *</label>
                <input value={form.locality} onChange={e => set('locality', e.target.value)} placeholder="Mumbai" className={ic('locality')} />
                {errors.locality && <p className="text-[11px] text-[#EA4335] mt-1">{errors.locality}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Postal Code *</label>
                <input value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="400001" className={ic('postalCode')} />
                {errors.postalCode && <p className="text-[11px] text-[#EA4335] mt-1">{errors.postalCode}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Country Code (ISO) *</label>
                <input value={form.countryCode} onChange={e => set('countryCode', e.target.value.toUpperCase())} placeholder="IN" maxLength={2} className={ic('countryCode')} />
                {errors.countryCode && <p className="text-[11px] text-[#EA4335] mt-1">{errors.countryCode}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Subdivision Code</label>
                <input value={form.countrySubdivisionCode} onChange={e => set('countrySubdivisionCode', e.target.value.toUpperCase())} placeholder="IN-MH" className={ic('countrySubdivisionCode')} />
              </div>
            </div>
            <label className="flex items-center gap-2 pt-4 border-t border-[#E5EAF0]">
              <input type="checkbox" checked={form.sameAsLegal} onChange={e => set('sameAsLegal', e.target.checked)} className="w-4 h-4 accent-[#4285F4]" />
              <span className="text-sm text-[#5F6368]">HQ address same as legal address</span>
            </label>
            {!form.sameAsLegal && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                <div className="md:col-span-2"><label className="block text-xs font-medium text-[#5F6368] mb-1.5">HQ Street</label><input value={form.hqStreetAddress} onChange={e => set('hqStreetAddress', e.target.value)} className={ic('hqStreetAddress')} /></div>
                <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">HQ City</label><input value={form.hqLocality} onChange={e => set('hqLocality', e.target.value)} className={ic('hqLocality')} /></div>
                <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">HQ Postal</label><input value={form.hqPostalCode} onChange={e => set('hqPostalCode', e.target.value)} className={ic('hqPostalCode')} /></div>
                <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">HQ Country</label><input value={form.hqCountryCode} onChange={e => set('hqCountryCode', e.target.value.toUpperCase())} maxLength={2} className={ic('hqCountryCode')} /></div>
                <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">HQ Subdivision</label><input value={form.hqCountrySubdivisionCode} onChange={e => set('hqCountrySubdivisionCode', e.target.value.toUpperCase())} className={ic('hqCountrySubdivisionCode')} /></div>
              </div>
            )}
          </div>
        )}

        {section === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Domain & Contact</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">Website</label><input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://www.tatamotors.com" className={ic('website')} /></div>
              <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">Contact Email *</label><input value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} type="email" placeholder="admin@tatamotors.com" className={ic('contactEmail')} />{errors.contactEmail && <p className="text-[11px] text-[#EA4335] mt-1">{errors.contactEmail}</p>}</div>
            </div>
          </div>
        )}

        {section === 4 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Compliance Metadata</h2>
            <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">Organization DID</label><input value={form.did} onChange={e => set('did', e.target.value)} placeholder="did:web:participant.gxdch.io:your-org" className={ic('did')} /><p className="text-[10px] text-[#9AA0A6] mt-0.5">Leave empty to auto-generate</p></div>
            <div className="bg-[#E8F0FE] border border-[#4285F4]/20 rounded-lg p-4">
              <p className="text-xs text-[#4285F4] font-medium mb-1">Gaia-X Loire Trust Framework</p>
              <p className="text-[11px] text-[#5F6368]">This credential will be structured as a Gaia-X LegalParticipant VC. After creation, verify it against Gaia-X Digital Clearing Houses.</p>
            </div>
          </div>
        )}

        {section === 5 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Validity Period</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">Valid From *</label><input type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} className={ic('validFrom')} /></div>
              <div><label className="block text-xs font-medium text-[#5F6368] mb-1.5">Valid Until *</label><input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)} className={ic('validUntil')} /></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#E5EAF0]">
          <button onClick={() => setSection(Math.max(0, section - 1))} disabled={section === 0} className="text-sm text-[#5F6368] hover:text-[#1F1F1F] disabled:opacity-30 disabled:cursor-not-allowed">&larr; Previous</button>
          <div className="flex gap-1.5">{sections.map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i === section ? 'bg-[#4285F4]' : 'bg-[#E5EAF0]'}`} />)}</div>
          {section < sections.length - 1
            ? <button onClick={() => setSection(section + 1)} className="text-sm text-[#4285F4] hover:text-[#3367D6] font-medium">Next &rarr;</button>
            : <button onClick={handleSubmit} disabled={loading} className="bg-[#4285F4] hover:bg-[#3367D6] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm">{loading ? 'Creating...' : 'Create Credential'}</button>
          }
        </div>
        {submitError && <div className="mt-4 bg-[#FCE8E6] border border-[#EA4335]/20 text-[#EA4335] px-4 py-3 rounded-lg text-xs">{submitError}</div>}
      </div>
    </div>
  )
}
