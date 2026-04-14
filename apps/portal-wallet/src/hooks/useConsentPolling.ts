import { useState, useEffect, useRef } from 'react'
import { createAuthAxios, getApiBase } from '@eu-jap-hack/auth'
import type { ConsentRequest } from '@eu-jap-hack/shared-types'

const API_BASE = getApiBase()

export function useConsentPolling(userId: string, accessToken: string) {
  const [pendingConsent, setPendingConsent] = useState<ConsentRequest | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const api = createAuthAxios(() => accessToken)

  const poll = async () => {
    try {
      const r = await api.get(`${API_BASE}/consent/pending/${userId}`)
      const pending = r.data
      if (pending && pending.length > 0) {
        setPendingConsent(pending[0] as ConsentRequest)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [userId])

  const clearConsent = () => setPendingConsent(null)

  return { pendingConsent, clearConsent }
}
