import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

interface GaiaxError {
  complianceStatus?: string
  complianceEndpoint?: string
  notaryStatus?: string
  notaryId?: string
  lastAttemptError?: string
}

interface ProgressState {
  companyId: string
  orgCredentialId: string
  companyName: string
  register: StepStatus
  userAccount: StepStatus
  userAccountDetail: string
  credential: StepStatus
  gaiax: StepStatus
  gaiaxDetail: string
  gaiaxError: GaiaxError | null
  edc: StepStatus
  edcDetail: string
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return (
    <div className="w-8 h-8 rounded-full bg-[#34A853] flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
    </div>
  )
  if (status === 'failed') return (
    <div className="w-8 h-8 rounded-full bg-[#EA4335] flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
    </div>
  )
  if (status === 'running') return (
    <div className="w-8 h-8 rounded-full bg-[#4285F4] flex items-center justify-center flex-shrink-0 animate-pulse">
      <div className="w-3 h-3 rounded-full bg-white" />
    </div>
  )
  if (status === 'skipped') return (
    <div className="w-8 h-8 rounded-full bg-[#F1F3F4] flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-[#9AA0A6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
    </div>
  )
  return <div className="w-8 h-8 rounded-full bg-[#E5EAF0] flex-shrink-0 border-2 border-[#D0D5DD]" />
}

function ProgressView({ progress, onDone }: { progress: ProgressState; onDone: () => void }) {
  const steps = [
    { key: 'register',     label: 'Organization registered',        detail: progress.companyName,           status: progress.register,     error: null },
    { key: 'userAccount',  label: 'User account created',           detail: progress.userAccountDetail,     status: progress.userAccount,  error: null },
    { key: 'credential',   label: 'Verifiable Credential issued',   detail: 'OrgVC created and signed',     status: progress.credential,   error: null },
    { key: 'gaiax',        label: 'Gaia-X compliance verification', detail: progress.gaiaxDetail,           status: progress.gaiax,        error: progress.gaiaxError },
    { key: 'edc',          label: 'EDC connector provisioning',     detail: progress.edcDetail,             status: progress.edc,          error: null },
  ]

  const allDone = steps.every(s => s.status === 'done' || s.status === 'failed' || s.status === 'skipped')

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#1F1F1F]">Registering Organization</h1>
        <p className="text-sm text-[#5F6368] mt-1">Please wait while we set everything up for you…</p>
      </div>

      <div className="bg-white border border-[#E5EAF0] rounded-xl p-8 space-y-0">
        {steps.map((step, i) => (
          <div key={step.key}>
            <div className="flex items-start gap-4 py-5">
              <StatusIcon status={step.status} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.status === 'failed' ? 'text-[#EA4335]' : step.status === 'done' ? 'text-[#1F1F1F]' : step.status === 'running' ? 'text-[#4285F4]' : step.status === 'skipped' ? 'text-[#9AA0A6]' : 'text-[#9AA0A6]'}`}>
                  {step.label}
                  {step.status === 'running' && <span className="ml-2 text-xs font-normal text-[#9AA0A6]">in progress…</span>}
                </p>
                {step.detail && step.status !== 'pending' && (
                  <p className="text-xs text-[#9AA0A6] mt-0.5">{step.detail}</p>
                )}
                {step.status === 'failed' && step.error && (
                  <div className="mt-2 border-l-2 border-[#EA4335] pl-3 space-y-1">
                    {step.error.complianceStatus && (
                      <p className="text-xs text-[#EA4335]">
                        Compliance: <span className="font-medium">{step.error.complianceStatus}</span>
                        {step.error.complianceEndpoint && <span className="text-[#9AA0A6] ml-1">· {step.error.complianceEndpoint}</span>}
                      </p>
                    )}
                    {step.error.notaryStatus && (
                      <p className="text-xs text-[#5F6368]">
                        Notary: <span className={`font-medium ${step.error.notaryStatus === 'success' ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>{step.error.notaryStatus}</span>
                        {step.error.notaryId && <span className="text-[#9AA0A6] ml-1">· ID: {step.error.notaryId}</span>}
                      </p>
                    )}
                    {step.error.lastAttemptError && (
                      <p className="text-xs text-[#EA4335]">{step.error.lastAttemptError}</p>
                    )}
                  </div>
                )}
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                step.status === 'done'    ? 'bg-[#E6F4EA] text-[#34A853]' :
                step.status === 'failed'  ? 'bg-[#FCE8E6] text-[#EA4335]' :
                step.status === 'running' ? 'bg-[#E8F0FE] text-[#4285F4]' :
                step.status === 'skipped' ? 'bg-[#F1F3F4] text-[#9AA0A6]' :
                'bg-[#F1F3F4] text-[#9AA0A6]'
              }`}>
                {step.status === 'done' ? 'Done' : step.status === 'failed' ? 'Failed' : step.status === 'running' ? 'Running' : step.status === 'skipped' ? 'Skipped' : 'Waiting'}
              </span>
            </div>
            {i < steps.length - 1 && <div className="ml-4 w-px h-4 bg-[#E5EAF0]" />}
          </div>
        ))}
      </div>

      {allDone && (
        <div className="mt-6 flex gap-3">
          <button onClick={onDone}
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all">
            View Organization
          </button>
        </div>
      )}
    </div>
  )
}

interface FormData {
  // Step 1 – Legal Entity
  legalName: string
  adminName: string
  adminUserEmail: string
  adminUserPassword: string
  adminUserConfirmPassword: string
  // Step 2 – Registration IDs
  vatId: string
  eoriNumber: string
  euid: string
  leiCode: string
  taxId: string
  localId: string
  // Step 3 – Addresses
  streetAddress: string
  locality: string
  postalCode: string
  countryCode: string
  countrySubdivisionCode: string
  sameAsLegal: boolean
  hqStreetAddress: string
  hqLocality: string
  hqPostalCode: string
  hqCountryCode: string
  hqCountrySubdivisionCode: string
  // Step 4 – Domain & Contact
  website: string
  contactEmail: string
  // Step 5 – Validity
  validFrom: string
  validUntil: string
  acceptTerms: boolean
}

const initial: FormData = {
  legalName: 'smartSense Consulting Solutions Pvt. Ltd.', adminName: 'John Doe',
  adminUserEmail: '', adminUserPassword: '', adminUserConfirmPassword: '',
  vatId: '', eoriNumber: '', euid: '', leiCode: '9695007586GCAKPYJ703', taxId: '', localId: '',
  streetAddress: 'Bodakdev, SG Highway', locality: 'Ahmedabad', postalCode: '380054', countryCode: 'DE', countrySubdivisionCode: 'DE-BY',
  sameAsLegal: true,
  hqStreetAddress: '', hqLocality: '', hqPostalCode: '', hqCountryCode: '', hqCountrySubdivisionCode: '',
  website: 'https://www.smartsensesolutions.com', contactEmail: 'info@smartsensesolutions.com',
  validFrom: new Date().toISOString().split('T')[0],
  validUntil: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
  acceptTerms: false,
}

const sections = [
  { key: 'entity', label: 'Legal Entity' },
  { key: 'ids', label: 'Registration IDs' },
  { key: 'addr', label: 'Addresses' },
  { key: 'contact', label: 'Domain & Contact' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'validity', label: 'Validity' },
]

export default function CompanyRegistration() {
  const navigate = useNavigate()
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [form, setForm] = useState<FormData>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [section, setSection] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const gaiaxTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const edcTimer   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (gaiaxTimer.current) clearInterval(gaiaxTimer.current)
    if (edcTimer.current)   clearInterval(edcTimer.current)
  }, [])

  const startEdcPolling = (companyId: string) => {
    setProgress(p => p ? { ...p, edc: 'running', edcDetail: 'Provisioning EDC connector…' } : p)
    // Clear any existing interval before starting a new one to prevent timer leaks
    if (edcTimer.current) { clearInterval(edcTimer.current); edcTimer.current = null; }
    edcTimer.current = setInterval(async () => {
      try {
        const r = await api.get(`${API_BASE}/companies/${companyId}/edc-status`)
        const status: string = r.data.status
        if (status === 'ready') {
          clearInterval(edcTimer.current!)
          setProgress(p => p ? { ...p, edc: 'done', edcDetail: 'EDC connector is live and ready' } : p)
        } else if (status === 'failed') {
          clearInterval(edcTimer.current!)
          setProgress(p => p ? { ...p, edc: 'failed', edcDetail: r.data.lastError || 'Provisioning failed' } : p)
        } else {
          setProgress(p => p ? { ...p, edcDetail: `Status: ${status}…` } : p)
        }
      } catch { /* keep polling */ }
    }, 5000)
  }

  const startPolling = (companyId: string, orgCredentialId: string, edcEnabled: boolean) => {
    // Poll Gaia-X first — EDC starts only after Gaia-X completes
    // Clear any existing interval before starting a new one to prevent timer leaks
    if (gaiaxTimer.current) { clearInterval(gaiaxTimer.current); gaiaxTimer.current = null; }
    gaiaxTimer.current = setInterval(async () => {
      try {
        const r = await api.get(`${API_BASE}/org-credentials/${orgCredentialId}/status`)
        const status: string = r.data.verificationStatus
        if (status === 'verified' || status === 'failed') {
          clearInterval(gaiaxTimer.current!)
          const complianceOk = r.data.complianceResult?.status === 'compliant'
          const notaryOk = r.data.notaryResult?.status === 'success'
          const hasComplianceIssue = !complianceOk
          const err: GaiaxError | null = hasComplianceIssue ? {
            complianceStatus: r.data.complianceResult?.status,
            complianceEndpoint: r.data.complianceResult?.endpointSetUsed,
            notaryStatus: r.data.notaryResult?.status,
            notaryId: r.data.notaryResult?.registrationId,
            lastAttemptError: r.data.verificationAttempts?.slice(-1)[0]?.error,
          } : null
          const gaiaxStepStatus: StepStatus = complianceOk ? 'done' : 'failed'
          const gaiaxDetail = complianceOk
            ? 'Compliant with Gaia-X Loire trust framework'
            : notaryOk
              ? 'Notary verified · Compliance check failed'
              : 'Verification failed'
          if (complianceOk && edcEnabled) {
            setProgress(p => p ? { ...p, gaiax: gaiaxStepStatus, gaiaxDetail, gaiaxError: err } : p)
            startEdcPolling(companyId)
          } else {
            setProgress(p => p ? {
              ...p,
              gaiax: gaiaxStepStatus, gaiaxDetail, gaiaxError: err,
              edc: !edcEnabled ? 'skipped' : 'failed',
              edcDetail: !edcEnabled ? 'EDC provisioning is disabled' : 'Skipped — Gaia-X compliance required',
            } : p)
          }
        } else {
          setProgress(p => p ? { ...p, gaiaxDetail: `Status: ${status}…` } : p)
        }
      } catch { /* keep polling */ }
    }, 3000)
  }

  const set = (key: keyof FormData, value: string | boolean) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  const ic = (key: string) =>
    `w-full border ${errors[key] ? 'border-[#EA4335]' : 'border-[#E5EAF0]'} bg-white rounded-lg px-3.5 py-2.5 text-sm text-[#1F1F1F] placeholder-[#9AA0A6] focus:outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 transition-all`

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.legalName.trim()) e.legalName = 'Required'
    if (!form.adminName.trim()) e.adminName = 'Required'
    if (!form.adminUserEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminUserEmail))
      e.adminUserEmail = 'Valid email required'
    if (!form.adminUserPassword) e.adminUserPassword = 'Required'
    else if (form.adminUserPassword.length < 8) e.adminUserPassword = 'Minimum 8 characters'
    if (form.adminUserPassword !== form.adminUserConfirmPassword)
      e.adminUserConfirmPassword = 'Passwords do not match'
    if (!form.vatId && !form.eoriNumber && !form.euid && !form.leiCode && !form.taxId && !form.localId)
      e.ids = 'At least one registration identifier required'
    if (!form.streetAddress.trim()) e.streetAddress = 'Required'
    if (!form.locality.trim()) e.locality = 'Required'
    if (!form.postalCode.trim()) e.postalCode = 'Required'
    if (!form.countryCode.trim()) e.countryCode = 'Required'
    if (!form.contactEmail.trim() || !/\S+@\S+\.\S+/.test(form.contactEmail)) e.contactEmail = 'Valid email required'
    if (!form.acceptTerms) e.acceptTerms = 'Required'
    return e
  }

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!form.legalName.trim()) e.legalName = 'Required'
      if (!form.adminName.trim()) e.adminName = 'Required'
      if (!form.adminUserEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminUserEmail))
        e.adminUserEmail = 'Valid email required'
      if (!form.adminUserPassword) e.adminUserPassword = 'Required'
      else if (form.adminUserPassword.length < 8) e.adminUserPassword = 'Minimum 8 characters'
      if (form.adminUserPassword !== form.adminUserConfirmPassword)
        e.adminUserConfirmPassword = 'Passwords do not match'
    }
    if (s === 1) {
      if (!form.vatId && !form.eoriNumber && !form.euid && !form.leiCode && !form.taxId && !form.localId)
        e.ids = 'At least one registration identifier required'
    }
    if (s === 2) {
      if (!form.streetAddress.trim()) e.streetAddress = 'Required'
      if (!form.locality.trim()) e.locality = 'Required'
      if (!form.postalCode.trim()) e.postalCode = 'Required'
      if (!form.countryCode.trim()) e.countryCode = 'Required'
    }
    if (s === 3) {
      if (!form.contactEmail.trim() || !/\S+@\S+\.\S+/.test(form.contactEmail)) e.contactEmail = 'Valid email required'
    }
    return e
  }

  const stepForError = (errs: Record<string, string>): number => {
    if (errs.legalName || errs.adminName) return 0
    if (errs.ids) return 1
    if (errs.streetAddress || errs.locality || errs.postalCode || errs.countryCode) return 2
    if (errs.contactEmail) return 3
    return 5
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setSection(stepForError(errs))
      return
    }
    setLoading(true); setSubmitError('')
    try {
      const r = await api.post(`${API_BASE}/companies`, {
        legalName: form.legalName,
        adminName: form.adminName,
        adminUserEmail: form.adminUserEmail,
        adminUserPassword: form.adminUserPassword,
        vatId: form.vatId || undefined,
        eoriNumber: form.eoriNumber || undefined,
        euid: form.euid || undefined,
        leiCode: form.leiCode || undefined,
        taxId: form.taxId || undefined,
        localId: form.localId || undefined,
        streetAddress: form.streetAddress,
        locality: form.locality,
        postalCode: form.postalCode,
        countryCode: form.countryCode,
        countrySubdivisionCode: form.countrySubdivisionCode || undefined,
        sameAsLegal: form.sameAsLegal,
        hqStreetAddress: form.sameAsLegal ? undefined : form.hqStreetAddress,
        hqLocality: form.sameAsLegal ? undefined : form.hqLocality,
        hqPostalCode: form.sameAsLegal ? undefined : form.hqPostalCode,
        hqCountryCode: form.sameAsLegal ? undefined : form.hqCountryCode,
        hqCountrySubdivisionCode: form.sameAsLegal ? undefined : form.hqCountrySubdivisionCode,
        website: form.website || undefined,
        contactEmail: form.contactEmail,
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
      })
      // orgCredential is optional — it is absent when user creation fails (steps 5-7 are skipped)
      const { company, orgCredential, edcEnabled, userCreated, userError } = r.data as {
        company: { id: string; name: string }; orgCredential?: { id: string }
        edcEnabled: boolean; userCreated: boolean; userError?: string
      }
      const userFailed = !userCreated
      const initialProgress: ProgressState = {
        companyId: company.id,
        orgCredentialId: orgCredential?.id ?? '',
        companyName: company.name,
        register: 'done',
        userAccount: userCreated ? 'done' : 'failed',
        userAccountDetail: userCreated ? form.adminUserEmail : (userError || 'Failed to create user in Keycloak'),
        credential: userFailed ? 'skipped' : 'done',
        gaiax: userFailed ? 'skipped' : 'running',
        gaiaxDetail: userFailed ? 'Skipped — user account creation failed' : 'Submitting to Gaia-X Digital Clearing House…',
        gaiaxError: null,
        edc: userFailed ? 'skipped' : edcEnabled ? 'pending' : 'skipped',
        edcDetail: userFailed ? 'Skipped — user account creation failed' : edcEnabled ? 'Waiting for Gaia-X verification…' : 'EDC provisioning is disabled',
      }
      setProgress(initialProgress)
      if (!userFailed && orgCredential) {
        startPolling(company.id, orgCredential.id, edcEnabled)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } }
      setSubmitError(e.response?.data?.message || e.response?.data?.error || 'Registration failed')
    }
    setLoading(false)
  }

  if (progress) {
    return <ProgressView progress={progress} onDone={() => navigate(`/success/${progress.companyId}`)} />
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#1F1F1F]">Register Organization</h1>
        <p className="text-sm text-[#5F6368] mt-1">Join the EU APAC Dataspace and receive a verifiable OrgVC</p>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {sections.map((s, i) => (
          <button key={s.key} onClick={() => setSection(i)}
            className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${section === i ? 'bg-[#4285F4] text-white shadow-sm' : 'bg-white border border-[#E5EAF0] text-[#5F6368] hover:border-[#4285F4]'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E5EAF0] rounded-xl p-8">

        {/* Step 1 – Legal Entity */}
        {section === 0 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Legal Entity Information</h2>
            <div>
              <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Legal Name *</label>
              <input value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="Toyota Motor Corporation" className={ic('legalName')} />
              {errors.legalName && <p className="text-[11px] text-[#EA4335] mt-1">{errors.legalName}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Admin Name *</label>
              <input value={form.adminName} onChange={e => set('adminName', e.target.value)} placeholder="John Smith" className={ic('adminName')} />
              {errors.adminName && <p className="text-[11px] text-[#EA4335] mt-1">{errors.adminName}</p>}
            </div>

            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0] !mt-8">Admin Account</h2>
            <p className="text-xs text-[#5F6368] -mt-2">These credentials will be used to log in to the dataspace portal.</p>
            <div>
              <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Email *</label>
              <input
                type="email"
                value={form.adminUserEmail}
                onChange={e => set('adminUserEmail', e.target.value)}
                placeholder="admin@yourcompany.com"
                className={ic('adminUserEmail')}
              />
              {errors.adminUserEmail && <p className="text-[11px] text-[#EA4335] mt-1">{errors.adminUserEmail}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Password *</label>
                <input
                  type="password"
                  value={form.adminUserPassword}
                  onChange={e => {
                    set('adminUserPassword', e.target.value)
                    if (form.adminUserConfirmPassword) {
                      if (e.target.value !== form.adminUserConfirmPassword)
                        setErrors(prev => ({ ...prev, adminUserConfirmPassword: 'Passwords do not match' }))
                      else
                        setErrors(prev => { const n = { ...prev }; delete n.adminUserConfirmPassword; return n })
                    }
                  }}
                  placeholder="Min. 8 characters"
                  className={ic('adminUserPassword')}
                />
                {errors.adminUserPassword && <p className="text-[11px] text-[#EA4335] mt-1">{errors.adminUserPassword}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Confirm Password *</label>
                <input
                  type="password"
                  value={form.adminUserConfirmPassword}
                  onChange={e => {
                    set('adminUserConfirmPassword', e.target.value)
                    if (form.adminUserPassword !== e.target.value)
                      setErrors(prev => ({ ...prev, adminUserConfirmPassword: 'Passwords do not match' }))
                  }}
                  placeholder="Repeat password"
                  className={ic('adminUserConfirmPassword')}
                />
                {errors.adminUserConfirmPassword && <p className="text-[11px] text-[#EA4335] mt-1">{errors.adminUserConfirmPassword}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Step 2 – Registration IDs */}
        {section === 1 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Registration Identifiers</h2>
            <p className="text-xs text-[#5F6368]">At least one legal registration number required for Gaia-X verification.</p>
            {errors.ids && <p className="text-[11px] text-[#EA4335] bg-[#FCE8E6] px-3 py-2 rounded-lg">{errors.ids}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                ['vatId',      'VAT ID',         'EU123456789'],
                ['eoriNumber', 'EORI',            'GB987654321000'],
                ['euid',       'EUID',            'DE.HRB.12345'],
                ['leiCode',    'LEI Code',        '529900T8BM49AURSDO55'],
                ['taxId',      'Tax ID / GST',    '27AAACT2727Q1ZW'],
                ['localId',    'Local ID / CIN',  'U34100MH2004PLC'],
              ] as const).map(([k, l, p]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-[#5F6368] mb-1">{l}</label>
                  <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={p} className={ic(k)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 – Addresses */}
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

        {/* Step 4 – Domain & Contact */}
        {section === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Domain & Contact</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Website</label>
                <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://www.company.com" className={ic('website')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Contact / Admin Email *</label>
                <input value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} type="email" placeholder="admin@company.com" className={ic('contactEmail')} />
                {errors.contactEmail && <p className="text-[11px] text-[#EA4335] mt-1">{errors.contactEmail}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Step 5 – Compliance */}
        {section === 4 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Compliance Metadata</h2>
            <div className="bg-[#E8F0FE] border border-[#4285F4]/20 rounded-lg p-4">
              <p className="text-xs text-[#4285F4] font-medium mb-1">Gaia-X Loire Trust Framework</p>
              <p className="text-[11px] text-[#5F6368]">Your organization credential will be structured as a Gaia-X LegalParticipant VC and can be verified against Gaia-X Digital Clearing Houses.</p>
            </div>
          </div>
        )}

        {/* Step 6 – Validity + Submit */}
        {section === 5 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1F1F1F] pb-3 border-b border-[#E5EAF0]">Validity Period</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Valid From *</label>
                <input type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} className={ic('validFrom')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5F6368] mb-1.5">Valid Until *</label>
                <input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)} className={ic('validUntil')} />
              </div>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer pt-4 border-t border-[#E5EAF0]">
              <input type="checkbox" checked={form.acceptTerms} onChange={e => set('acceptTerms', e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#4285F4]" />
              <span className="text-xs text-[#5F6368] leading-relaxed">
                I accept the EU APAC Dataspace Terms of Service and authorize the issuance of a verifiable Organization Credential.
              </span>
            </label>
            {errors.acceptTerms && <p className="text-[11px] text-[#EA4335]">You must accept the terms to register.</p>}
            {submitError && <div className="bg-[#FCE8E6] border border-[#EA4335]/20 text-[#EA4335] px-4 py-3 rounded-lg text-xs">{submitError}</div>}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#E5EAF0]">
          <button onClick={() => setSection(Math.max(0, section - 1))} disabled={section === 0}
            className="text-sm text-[#5F6368] hover:text-[#1F1F1F] disabled:opacity-30 disabled:cursor-not-allowed">
            &larr; Previous
          </button>
          <div className="flex gap-1.5">
            {sections.map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i === section ? 'bg-[#4285F4]' : 'bg-[#E5EAF0]'}`} />)}
          </div>
          {section < sections.length - 1
            ? <button onClick={() => {
                const errs = validateStep(section)
                if (Object.keys(errs).length > 0) { setErrors(errs); return }
                setSection(section + 1)
              }} className="text-sm text-[#4285F4] hover:text-[#3367D6] font-medium">Next &rarr;</button>
            : <button onClick={handleSubmit} disabled={loading}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all">
                {loading ? 'Registering...' : 'Register & Get Organization VC'}
              </button>
          }
        </div>
      </div>
    </div>
  )
}
