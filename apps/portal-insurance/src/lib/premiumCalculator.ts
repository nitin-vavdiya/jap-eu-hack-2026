export interface PremiumBreakdown {
  basePremium: number
  damageAdjustment: number
  ageAdjustment: number
  conditionAdjustment: number
  batteryHealthAdjustment: number
  total: number
}

export function calculatePremium(dpp: Record<string, unknown> | null | undefined, carYear?: number): PremiumBreakdown {
  const basePremium = 800

  // Damage adjustment: €120 per incident
  const damageHistory = dpp?.damageHistory as Record<string, unknown> | undefined
  const damageCount = (damageHistory?.totalIncidents as number) || 0
  const damageAdjustment = damageCount * 120

  // Age adjustment: €30 per year over 3 years old
  const currentYear = 2026
  const vehicleYear = carYear || currentYear
  const age = currentYear - vehicleYear
  const ageAdjustment = Math.max(0, (age - 3)) * 30

  // Condition adjustment: penalize if overall rating < 8
  const stateOfHealth = dpp?.stateOfHealth as Record<string, unknown> | undefined
  const overallRating = (stateOfHealth?.overallRating as number) || 8
  const conditionAdjustment = overallRating < 8
    ? Math.round((8 - overallRating) * 80)
    : -Math.round((overallRating - 8) * 30)

  // Battery health adjustment (for EVs)
  const batteryHealth = stateOfHealth?.batteryHealthPercent as number | undefined
  let batteryHealthAdjustment = 0
  if (batteryHealth !== undefined && batteryHealth !== null) {
    if (batteryHealth < 80) batteryHealthAdjustment = Math.round((80 - batteryHealth) * 5)
    else if (batteryHealth > 90) batteryHealthAdjustment = -50
  }

  const total = basePremium + damageAdjustment + ageAdjustment + conditionAdjustment + batteryHealthAdjustment

  return {
    basePremium,
    damageAdjustment,
    ageAdjustment,
    conditionAdjustment,
    batteryHealthAdjustment,
    total: Math.max(600, total)
  }
}
