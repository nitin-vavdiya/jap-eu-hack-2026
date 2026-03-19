import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

export function useConsentPolling(userId: string) {
  const [pendingConsent, setPendingConsent] = useState<Record<string, unknown> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = async () => {
    try {
      const r = await axios.get(`${API_BASE}/consent/pending/${userId}`)
      const pending = r.data
      if (pending && pending.length > 0) {
        setPendingConsent(pending[0])
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
