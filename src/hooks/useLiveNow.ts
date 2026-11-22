/**
 * useLiveNow — returns a live Unix timestamp in seconds, updated every second.
 *
 * Use this instead of useState(() => Date.now() / 1000) for any time-sensitive
 * UI: deadline countdowns, bill state derivation, and grace-period badges.
 * The contract is the authoritative source for transaction eligibility;
 * this hook drives UI state only.
 */

import { useState, useEffect } from 'react'

export function useLiveNow(): number {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return nowSec
}
