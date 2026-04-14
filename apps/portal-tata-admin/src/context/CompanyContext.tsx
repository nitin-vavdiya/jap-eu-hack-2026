import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

export interface MyCompany {
  id: string
  name: string
  did?: string
  bpn?: string
  tenantCode?: string
  country?: string
  city?: string
  address?: string
  leiCode?: string
  edcProvisioning?: {
    status: string
    protocolUrl?: string
    managementUrl?: string
    dataplaneUrl?: string
    helmRelease?: string
    argoAppName?: string
    k8sNamespace?: string
    vaultPath?: string
    dbName?: string
    provisionedAt?: string
    createdAt?: string
    attempts: number
    lastError?: string
  }
  orgCredentials: Array<{
    id: string
    legalName: string
    contactEmail: string
    website?: string
    did?: string
    verificationStatus: string
    validFrom: string
    validUntil: string
    legalRegistrationNumber?: { id?: string; type?: string }
    legalAddress?: { countryCode?: string; locality?: string; streetAddress?: string; postalCode?: string }
    headquartersAddress?: { countryCode?: string; locality?: string; streetAddress?: string; postalCode?: string }
    complianceResult?: { status: string; issuedCredential?: unknown; error?: string }
    notaryResult?: { status: string; registrationNumberType?: string; legalName?: string; error?: string }
    issuedVCs: unknown[]
    vcPayload?: unknown
  }>
  credentials: unknown[]
}

interface CompanyContextValue {
  company: MyCompany | null
  /** true while the first fetch is in flight */
  loading: boolean
  /** non-null when the fetch failed (e.g. 401/403 or network error) */
  error: string | null
  /** whether the company has a verified + compliant Gaia-X credential */
  isGaiaxVerified: boolean
}

const CompanyContext = createContext<CompanyContextValue>({
  company: null,
  loading: true,
  error: null,
  isGaiaxVerified: false,
})

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuthUser()
  const [company, setCompany] = useState<MyCompany | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const api = createAuthAxios(() => accessToken)
    setLoading(true)
    api.get(`${API_BASE}/companies/me`)
      .then(r => {
        setCompany(r.data.company)
        setError(null)
      })
      .catch(() => setError('Failed to load company profile'))
      .finally(() => setLoading(false))
  }, [accessToken])

  const isGaiaxVerified = company?.orgCredentials?.some(
    c => c.verificationStatus === 'verified' && c.complianceResult?.status === 'compliant' && c.complianceResult?.issuedCredential
  ) ?? false

  return (
    <CompanyContext.Provider value={{ company, loading, error, isGaiaxVerified }}>
      {children}
    </CompanyContext.Provider>
  )
}

/** Returns the authenticated user's company data loaded once at app startup. */
export function useCompany() {
  return useContext(CompanyContext)
}
