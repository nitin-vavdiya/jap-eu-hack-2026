import { useState } from 'react'
import { useAuthUser, createAuthAxios, getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

// ─── Types ────────────────────────────────────────────────────────────────────

interface MappingDetail {
  sourcePath: string
  sourceValue: unknown
  targetPath: string
  targetValue: unknown
  transformType: 'direct' | 'rename' | 'derived' | 'normalized' | 'default' | 'inferred'
}

interface FactorScore {
  factorId: string
  factorName: string
  score: number
  maxScore: number
  percentage: number
  explanation: string
}

interface ScoreBand {
  id: string
  label: string
  min: number
  max: number
  riskLevel: string
  colorClass: string
}

interface ScoreResult {
  totalScore: number
  maxPossibleScore: number
  percentageScore: number
  scoreBand: ScoreBand
  factorScores: FactorScore[]
  isEV: boolean
}

interface PackageRecommendation {
  packageId: string
  packageName: string
  scoreBand: string
  riskLevel: string
  totalScore: number
  estimatedAnnualPremiumEur: number
  indicativePremiumRange: [number, number]
  coverageHighlights: string[]
  recommendedAddOns: string[]
  exclusions: string[]
  recommendationReason: string
  evSpecificNote?: string
  underwriterNote?: string
}

interface TransformationReport {
  sourceProfile: string
  targetProfile: string
  transformedAt: string
  fieldsExpected: number
  fieldsPresent: number
  completenessPercent: number
  unmappedSourceFields: string[]
  warnings: string[]
  mappingDetails: MappingDetail[]
}

interface JasparPayload {
  vehicleProfile: Record<string, unknown>
  technicalCondition: Record<string, unknown>
  riskIndicators: Record<string, unknown>
  regulatoryCompliance: Record<string, unknown>
  sustainabilityMetrics: Record<string, unknown>
  ownershipAndProvenance: Record<string, unknown>
  dataQuality: Record<string, unknown>
  assessmentDate: string
}

interface UnderwritingResult {
  runId: string
  jasparPayload: JasparPayload
  transformationReport: TransformationReport
  scoreResult: ScoreResult
  packageRecommendation: PackageRecommendation
}

interface Props {
  vin: string
  car: Record<string, unknown>
  issuerDid: string
  onAccept: (result: UnderwritingResult) => void
  onBack: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

type ProgressStep = 'transforming' | 'validating' | 'scoring' | 'packaging' | 'done'

const PROGRESS_STEPS: { id: ProgressStep; label: string }[] = [
  { id: 'transforming', label: 'Transforming DPP → JASPAR schema' },
  { id: 'validating',   label: 'Validating target dataset' },
  { id: 'scoring',      label: 'Calculating insurance score' },
  { id: 'packaging',    label: 'Generating package recommendation' },
  { id: 'done',         label: 'Underwriting complete' },
]

const STEP_ORDER: ProgressStep[] = ['transforming', 'validating', 'scoring', 'packaging', 'done']

// JASPAR expected schema sections shown before transformation runs
const JASPAR_SCHEMA_SECTIONS = [
  {
    label: 'vehicleProfile',
    fields: [
      { key: 'vin',               desc: 'Vehicle Identification Number',        type: 'string'  },
      { key: 'propulsionType',    desc: 'BEV · ICE · HEV · PHEV',              type: 'enum'    },
      { key: 'vehicleAgeYears',   desc: 'Derived: currentYear − modelYear',     type: 'derived' },
      { key: 'modelYear',         desc: 'Year of manufacture',                  type: 'integer' },
    ],
  },
  {
    label: 'technicalCondition',
    fields: [
      { key: 'overallConditionScore',    desc: '0–10 normalised scale',          type: 'float'   },
      { key: 'batteryStateOfHealthPct',  desc: 'EV only — from stateOfHealth',   type: 'float'   },
      { key: 'batteryCapacityKwh',       desc: 'Nominal battery capacity',       type: 'float'   },
    ],
  },
  {
    label: 'riskIndicators',
    fields: [
      { key: 'totalDamageIncidents',        desc: 'Count from damageHistory',                   type: 'integer' },
      { key: 'majorDamageCount',            desc: 'Derived: incidents where severity = Major',  type: 'derived' },
      { key: 'serviceComplianceIndicator',  desc: 'COMPLIANT · PARTIAL · NON_COMPLIANT',        type: 'enum'    },
    ],
  },
  {
    label: 'regulatoryCompliance',
    fields: [
      { key: 'ncapSafetyRating',    desc: '0–5 stars from compliance.safetyRatingNcap', type: 'integer' },
      { key: 'roadworthyCertValid', desc: 'Derived: certExpiry > today',                type: 'derived' },
      { key: 'emissionsStandard',   desc: 'Euro 6d · BEV/ZEV',                          type: 'string'  },
    ],
  },
  {
    label: 'ownershipAndProvenance',
    fields: [
      { key: 'dataProvenance',         desc: 'MANUFACTURER_AUTHORITATIVE · SELF_REPORTED', type: 'enum'    },
      { key: 'manufacturerVerified',   desc: 'true if VC present and status = active',      type: 'derived' },
      { key: 'dataReceivedVia',        desc: 'EDC (Eclipse Dataspace Connector)',            type: 'enum'    },
    ],
  },
]

const TRANSFORM_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  direct:     { bg: 'bg-gray-100',    text: 'text-gray-500',   label: 'direct'     },
  rename:     { bg: 'bg-blue-50',     text: 'text-blue-600',   label: 'rename'     },
  derived:    { bg: 'bg-purple-50',   text: 'text-purple-600', label: 'derived'    },
  normalized: { bg: 'bg-amber-50',    text: 'text-amber-600',  label: 'normalised' },
  default:    { bg: 'bg-orange-50',   text: 'text-orange-600', label: 'default'    },
  inferred:   { bg: 'bg-teal-50',     text: 'text-teal-600',   label: 'inferred'   },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bandColor(band: string) {
  const map: Record<string, { bg: string; text: string; border: string; ring: string }> = {
    premium_plus: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'bg-emerald-500' },
    premium:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    ring: 'bg-blue-500'    },
    standard:     { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   ring: 'bg-amber-500'   },
    basic_plus:   { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  ring: 'bg-orange-500'  },
    basic:        { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     ring: 'bg-red-500'     },
  }
  return map[band] ?? map['standard']
}

function scoreBarColor(pct: number) {
  if (pct >= 85) return 'bg-emerald-500'
  if (pct >= 70) return 'bg-blue-500'
  if (pct >= 55) return 'bg-amber-400'
  if (pct >= 40) return 'bg-orange-400'
  return 'bg-red-400'
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '✓ Yes' : '✗ No'
  return String(v)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function JasparSection({ title, data }: { title: string; data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors">
        <span className="text-xs font-medium text-gray-600">{title}</span>
        <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 bg-gray-50 space-y-1.5 border-t border-gray-100">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-0.5">
              <span className="text-[10px] text-gray-400 capitalize flex-shrink-0">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className="text-[10px] text-gray-700 text-right font-mono max-w-[60%] truncate">
                {typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No') : v == null ? '—' : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function JasparSchemaSection({ section }: { section: typeof JASPAR_SCHEMA_SECTIONS[0] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-indigo-100 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-indigo-50/40 transition-colors">
        <span className="text-xs font-medium text-indigo-700 font-mono">{section.label}</span>
        <svg className={`w-3.5 h-3.5 text-indigo-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-indigo-100 bg-indigo-50/30 divide-y divide-indigo-50">
          {section.fields.map(f => (
            <div key={f.key} className="flex items-start justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-indigo-600 font-medium">{f.key}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">{f.desc}</p>
              </div>
              <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                f.type === 'derived' ? 'bg-purple-100 text-purple-600' :
                f.type === 'enum'    ? 'bg-amber-100 text-amber-600' :
                f.type === 'float'   ? 'bg-blue-100 text-blue-600' :
                'bg-gray-100 text-gray-500'
              }`}>{f.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MappingAccordion({ mappings }: { mappings: MappingDetail[] }) {
  const [open, setOpen] = useState(false)

  // Group by target section prefix
  const groups: Record<string, MappingDetail[]> = {}
  for (const m of mappings) {
    const section = m.targetPath.split('.')[0]
    if (!groups[section]) groups[section] = []
    groups[section].push(m)
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Transformation Mapping Details</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Expand to inspect how each Toyota field was mapped and normalised into the insurer schema.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{mappings.length} mappings</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Legend */}
          <div className="px-6 py-3 bg-gray-50 flex flex-wrap gap-2 border-b border-gray-100">
            {Object.entries(TRANSFORM_TYPE_STYLES).map(([type, s]) => (
              <span key={type} className={`text-[9px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
            ))}
          </div>

          {/* Groups */}
          <div className="divide-y divide-gray-50">
            {Object.entries(groups).map(([section, rows]) => (
              <div key={section}>
                <div className="px-6 py-2 bg-gray-50/60">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{section}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {rows.map((m, i) => {
                    const ts = TRANSFORM_TYPE_STYLES[m.transformType] ?? TRANSFORM_TYPE_STYLES.direct
                    return (
                      <div key={i} className="px-6 py-3 grid grid-cols-[1fr_auto_1fr_auto] gap-3 items-start hover:bg-gray-50/50 transition-colors">
                        {/* Source */}
                        <div className="min-w-0">
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Source (Toyota DPP)</p>
                          <p className="text-[10px] font-mono text-orange-600 break-all leading-relaxed">{m.sourcePath}</p>
                          <p className="text-[10px] text-gray-600 font-medium mt-0.5 truncate">{formatValue(m.sourceValue)}</p>
                        </div>
                        {/* Arrow */}
                        <div className="flex flex-col items-center justify-center pt-4">
                          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                        {/* Target */}
                        <div className="min-w-0">
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Target (JASPAR)</p>
                          <p className="text-[10px] font-mono text-indigo-600 break-all leading-relaxed">{m.targetPath}</p>
                          <p className="text-[10px] text-gray-600 font-medium mt-0.5 truncate">{formatValue(m.targetValue)}</p>
                        </div>
                        {/* Type */}
                        <div className="flex flex-col items-end justify-center pt-4">
                          <span className={`text-[8px] font-semibold px-2 py-0.5 rounded ${ts.bg} ${ts.text} flex-shrink-0`}>{ts.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Source/Target DPP Panel (left) ───────────────────────────────────────────

function ToyotaDppPanel({
  car, vin, issuerDid, showRaw, onToggleRaw,
}: {
  car: Record<string, unknown>
  vin: string
  issuerDid: string
  showRaw: boolean
  onToggleRaw: () => void
}) {
  const dpp = car.dpp as Record<string, unknown> | undefined
  const stateOfHealth = dpp?.stateOfHealth as Record<string, unknown> | undefined
  const performance = dpp?.performance as Record<string, unknown> | undefined
  const emissions = dpp?.emissions as Record<string, unknown> | undefined
  const compliance = dpp?.compliance as Record<string, unknown> | undefined
  const damageHistory = dpp?.damageHistory as Record<string, unknown> | undefined
  const propulsionType = String(performance?.motorType || 'ICE').toUpperCase()
  const isEV = propulsionType === 'BEV' || propulsionType === 'HEV'

  const kvRows = [
    { label: 'VIN',             value: String(car.vin || vin) },
    { label: 'Vehicle',         value: `${String(car.make || '')} ${String(car.model || '')} ${String(car.year || '')}`.trim() },
    { label: 'Variant',         value: String(car.variant || '—') },
    { label: 'Powertrain',      value: propulsionType + (isEV ? ' ⚡' : '') },
    { label: 'Battery / Range', value: isEV ? `${String(stateOfHealth?.batteryCapacity || performance?.batteryCapacityKwh || '—')} kWh · ${String(stateOfHealth?.range || performance?.rangeKm || '—')} km` : '—' },
    { label: 'Condition',       value: stateOfHealth?.overallRating ? `${String(stateOfHealth.overallRating)}/10` : '—' },
    { label: 'Battery SoH',     value: stateOfHealth?.batteryHealthPercent ? `${String(stateOfHealth.batteryHealthPercent)}%` : '—' },
    { label: 'CO₂',             value: emissions?.co2GPerKm != null ? `${String(emissions.co2GPerKm)} g/km` : isEV ? '0 g/km (BEV)' : '—' },
    { label: 'NCAP Rating',     value: compliance?.safetyRatingNcap != null ? `${String(compliance.safetyRatingNcap)} / 5 ★` : '—' },
    { label: 'Damage Incidents',value: String(damageHistory?.totalIncidents ?? 0) },
  ]

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-50">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-orange-600">DPP</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Toyota Vehicle DPP Format</p>
              <p className="text-[9px] text-gray-400 font-mono mt-0.5">TOYOTA_DPP_v1</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end flex-shrink-0">
            <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Received via EDC</span>
            <span className="text-[8px] bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Manufacturer Authoritative</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400">Vehicle data received from Toyota through EDC in manufacturer-native DPP format.</p>
        {issuerDid && <p className="text-[9px] text-gray-300 font-mono mt-1 truncate">Issuer: {issuerDid}</p>}
      </div>

      {/* Key-value grid */}
      <div className="px-5 py-4 flex-1">
        <div className="grid grid-cols-1 gap-1.5 mb-4">
          {kvRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-[10px] text-gray-400 flex-shrink-0 w-28">{row.label}</span>
              <span className="text-[10px] font-medium text-gray-800 text-right truncate max-w-[55%]">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Full payload toggle */}
        <button
          onClick={onToggleRaw}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1.5 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showRaw ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showRaw ? 'Hide' : 'View'} full DPP payload
        </button>
        {showRaw && (
          <pre className="mt-2 text-[8px] bg-gray-900 text-green-400 rounded-lg p-3 overflow-auto max-h-56 font-mono leading-relaxed">
            {JSON.stringify(car, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

// ─── Expected Insurer Format Panel (right, pre-transform) ─────────────────────

function InsurerSchemaPanel({
  error, onTransform, showRaw, onToggleRaw,
}: {
  error: string
  onTransform: () => void
  showRaw: boolean
  onToggleRaw: () => void
}) {
  return (
    <div className="border border-indigo-100 rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-indigo-50">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-indigo-600">JAS</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Insurer Expected Format</p>
              <p className="text-[9px] text-gray-400 font-mono mt-0.5">DIGIT_JASPAR_v1</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end flex-shrink-0">
            <span className="text-[8px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">JASPAR-like Schema</span>
            <span className="text-[8px] bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Awaiting Transform</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400">This is the insurer-ready JASPAR-like structure expected for underwriting. Expand sections to preview the target schema.</p>
      </div>

      {/* Schema sections */}
      <div className="px-5 py-4 flex-1">
        <p className="text-[9px] text-gray-400 uppercase tracking-widest font-medium mb-2">Expected Schema Sections</p>
        <div className="space-y-1.5 mb-4">
          {JASPAR_SCHEMA_SECTIONS.map(section => (
            <JasparSchemaSection key={section.label} section={section} />
          ))}
        </div>

        {/* Full structure toggle */}
        <button
          onClick={onToggleRaw}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1.5 mb-4 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showRaw ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showRaw ? 'Hide' : 'View'} full expected structure
        </button>
        {showRaw && (
          <pre className="mt-1 mb-4 text-[8px] bg-gray-900 text-indigo-300 rounded-lg p-3 overflow-auto max-h-48 font-mono leading-relaxed">
{`{
  "jasparVersion": "1.0",
  "sourceProfile": "TOYOTA_DPP_v1",
  "targetProfile": "DIGIT_JASPAR_v1",
  "vehicleProfile": {
    "vin": "string",
    "make": "string",
    "model": "string",
    "modelYear": "integer",
    "vehicleAgeYears": "integer (derived)",
    "propulsionType": "BEV|ICE|HEV|PHEV|FCEV"
  },
  "technicalCondition": {
    "overallConditionScore": "float 0-10",
    "batteryStateOfHealthPct": "float (EV only)",
    "batteryCapacityKwh": "float"
  },
  "riskIndicators": {
    "totalDamageIncidents": "integer",
    "majorDamageCount": "integer (derived)",
    "hasUnrepairedDamage": "boolean (derived)",
    "serviceComplianceIndicator": "COMPLIANT|PARTIAL|NON_COMPLIANT"
  },
  "regulatoryCompliance": {
    "hasTypeApproval": "boolean (derived)",
    "ncapSafetyRating": "integer 0-5",
    "roadworthyCertValid": "boolean (derived)",
    "emissionsStandard": "string"
  },
  "sustainabilityMetrics": {
    "co2EmissionsGPerKm": "float",
    "energyEfficiencyLabel": "string"
  },
  "ownershipAndProvenance": {
    "hasManufacturerCredential": "boolean",
    "manufacturerVerified": "boolean (derived)",
    "dataProvenance": "MANUFACTURER_AUTHORITATIVE|SELF_REPORTED",
    "dataReceivedVia": "EDC"
  },
  "dataQuality": {
    "fieldsExpected": 24,
    "completenessPercent": "float"
  }
}`}
          </pre>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600 font-medium">Transformation failed</p>
            <p className="text-[10px] text-red-500 mt-0.5">{error}</p>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onTransform}
          className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Transform &amp; Score Vehicle
        </button>
      </div>
    </div>
  )
}

// ─── Transformed JASPAR Panel (right, post-transform) ────────────────────────

function TransformedJasparPanel({
  jaspar, report, showRaw, onToggleRaw,
}: {
  jaspar: JasparPayload
  report: TransformationReport
  showRaw: boolean
  onToggleRaw: () => void
}) {
  return (
    <div className="border border-indigo-100 rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-indigo-50">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-indigo-600">JAS</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Transformed JASPAR Dataset</p>
              <p className="text-[9px] text-gray-400 font-mono mt-0.5">DIGIT_JASPAR_v1</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end flex-shrink-0">
            <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">✓ Transformed</span>
            <span className="text-[8px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{report.completenessPercent}% Complete</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400">
          Transformation complete. {report.fieldsPresent}/{report.fieldsExpected} fields populated from Toyota DPP source.
        </p>
      </div>

      {/* JASPAR sections */}
      <div className="px-5 py-4 flex-1">
        <div className="space-y-1.5 mb-4">
          {([
            ['Vehicle Profile', jaspar.vehicleProfile],
            ['Technical Condition', jaspar.technicalCondition],
            ['Risk Indicators', jaspar.riskIndicators],
            ['Regulatory Compliance', jaspar.regulatoryCompliance],
            ['Sustainability Metrics', jaspar.sustainabilityMetrics],
            ['Ownership & Provenance', jaspar.ownershipAndProvenance],
            ['Data Quality', jaspar.dataQuality],
          ] as [string, Record<string, unknown>][]).map(([title, data]) => (
            <JasparSection key={title} title={title} data={data} />
          ))}
        </div>

        {/* Warnings */}
        {report.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p className="text-[10px] font-semibold text-amber-700 mb-1">
              {report.warnings.length} transformation warning{report.warnings.length > 1 ? 's' : ''}
            </p>
            {report.warnings.map((w, i) => (
              <p key={i} className="text-[9px] text-amber-600 leading-relaxed">· {w}</p>
            ))}
          </div>
        )}

        {/* Raw payload toggle */}
        <button
          onClick={onToggleRaw}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1.5 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showRaw ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showRaw ? 'Hide' : 'View'} full JASPAR payload
        </button>
        {showRaw && (
          <pre className="mt-2 text-[8px] bg-gray-900 text-indigo-300 rounded-lg p-3 overflow-auto max-h-56 font-mono leading-relaxed">
            {JSON.stringify(jaspar, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

// ─── Header Strip ─────────────────────────────────────────────────────────────

function HeaderStrip({ status }: { status: 'ready' | 'transformed' }) {
  return (
    <div className="border border-gray-100 rounded-xl px-5 py-3 mb-4 flex items-center justify-between bg-white shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg">
          <span className="text-[9px] font-bold text-orange-600">DPP</span>
          <span className="text-[10px] text-orange-700 font-medium">Toyota DPP v1</span>
        </div>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-[9px] font-bold text-indigo-600">JAS</span>
          <span className="text-[10px] text-indigo-700 font-medium">TOKIO MARINE JASPAR v1</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-[10px] text-gray-400 hidden sm:block">Status</p>
        {status === 'ready' ? (
          <span className="text-[9px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
            Ready to Transform
          </span>
        ) : (
          <span className="text-[9px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            Transformed
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UnderwritingPanel({ vin, car, issuerDid, onAccept, onBack }: Props) {
  const { accessToken } = useAuthUser()
  const api = createAuthAxios(() => accessToken)
  const [stage, setStage] = useState<'source' | 'loading' | 'result'>('source')
  const [currentStep, setCurrentStep] = useState<ProgressStep | null>(null)
  const [result, setResult] = useState<UnderwritingResult | null>(null)
  const [error, setError] = useState('')
  const [showRawSource, setShowRawSource] = useState(false)
  const [showRawTarget, setShowRawTarget] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleTransformAndScore() {
    setStage('loading')
    setError('')
    setCurrentStep('transforming')
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
    try {
      await delay(600)
      setCurrentStep('validating')
      await delay(500)
      setCurrentStep('scoring')
      const resp = await api.post(`${API_BASE}/underwriting/transform-and-score`, { vin, sourceData: car })
      await delay(400)
      setCurrentStep('packaging')
      await delay(300)
      setCurrentStep('done')
      await delay(200)
      setResult(resp.data)
      setStage('result')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err.response?.data?.error || err.message || 'Transformation failed')
      setStage('source')
      setCurrentStep(null)
    }
  }

  async function handleAccept() {
    if (!result) return
    setConfirming(true)
    try {
      await api.post(`${API_BASE}/underwriting/confirm`, { runId: result.runId })
      onAccept(result)
    } catch {
      onAccept(result)
    }
    setConfirming(false)
  }

  // ── Stage: Source ─────────────────────────────────────────────────────────
  if (stage === 'source') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Verification
        </button>

        <div className="mb-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-0.5">Step 1 of 4 · Data Transformation</p>
          <h2 className="text-lg font-semibold text-gray-900">Vehicle Data Normalisation</h2>
        </div>

        <HeaderStrip status="ready" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ToyotaDppPanel
            car={car}
            vin={vin}
            issuerDid={issuerDid}
            showRaw={showRawSource}
            onToggleRaw={() => setShowRawSource(s => !s)}
          />
          <InsurerSchemaPanel
            error={error}
            onTransform={handleTransformAndScore}
            showRaw={showRawTarget}
            onToggleRaw={() => setShowRawTarget(s => !s)}
          />
        </div>
      </div>
    )
  }

  // ── Stage: Loading ────────────────────────────────────────────────────────
  if (stage === 'loading') {
    const currentIdx = STEP_ORDER.indexOf(currentStep ?? 'transforming')
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-12 h-12 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-6" />
        <p className="text-sm font-semibold text-gray-900 mb-1">
          {PROGRESS_STEPS.find(s => s.id === currentStep)?.label ?? 'Processing...'}
        </p>
        <p className="text-xs text-gray-400 mb-8">Please wait while we analyse the vehicle data</p>
        <div className="max-w-xs mx-auto space-y-2.5">
          {PROGRESS_STEPS.filter(s => s.id !== 'done').map((step, i) => {
            const stepIdx = STEP_ORDER.indexOf(step.id)
            const isDone = stepIdx < currentIdx
            const isActive = stepIdx === currentIdx
            return (
              <div key={step.id} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500' : isActive ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  {isDone ? (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  ) : isActive ? (
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  ) : (
                    <span className="text-[8px] text-gray-400">{i + 1}</span>
                  )}
                </div>
                <span className={`text-xs ${isDone ? 'text-emerald-600' : isActive ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>{step.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Stage: Result ─────────────────────────────────────────────────────────
  if (stage === 'result' && result) {
    const { jasparPayload: jaspar, transformationReport: report, scoreResult: score, packageRecommendation: pkg } = result
    const bc = bandColor(score.scoreBand.id)

    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>

        <div className="mb-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-0.5">Step 1 of 4 · Data Transformation</p>
          <h2 className="text-lg font-semibold text-gray-900">Vehicle Data Normalisation</h2>
        </div>

        <HeaderStrip status="transformed" />

        {/* Side-by-side: source vs transformed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ToyotaDppPanel
            car={car}
            vin={vin}
            issuerDid={issuerDid}
            showRaw={showRawSource}
            onToggleRaw={() => setShowRawSource(s => !s)}
          />
          <TransformedJasparPanel
            jaspar={jaspar}
            report={report}
            showRaw={showRawTarget}
            onToggleRaw={() => setShowRawTarget(s => !s)}
          />
        </div>

        {/* Transformation Mapping Accordion */}
        {report.mappingDetails && report.mappingDetails.length > 0 && (
          <div className="mb-4">
            <MappingAccordion mappings={report.mappingDetails} />
          </div>
        )}

        {/* ── Insurance Score ──────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto">
          <div className="border border-gray-100 rounded-2xl overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-0.5">Step 2 of 4</p>
                <h2 className="text-sm font-semibold text-gray-900">Insurance Decision Engine</h2>
              </div>
              <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200 font-medium">Score Calculated</span>
            </div>
            <div className="px-6 py-5">
              {/* Total score hero */}
              <div className={`flex items-center justify-between ${bc.bg} border ${bc.border} rounded-xl px-5 py-4 mb-5`}>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Total Insurance Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl font-bold ${bc.text}`}>{score.totalScore}</span>
                    <span className="text-sm text-gray-400">/ {score.maxPossibleScore}</span>
                  </div>
                  <p className={`text-xs font-semibold mt-1 ${bc.text}`}>{score.scoreBand.label} · {score.scoreBand.riskLevel}</p>
                </div>
                <div className="text-right">
                  <div className="w-20 h-20 relative flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke={score.totalScore >= 85 ? '#10b981' : score.totalScore >= 70 ? '#3b82f6' : score.totalScore >= 55 ? '#f59e0b' : score.totalScore >= 40 ? '#f97316' : '#ef4444'}
                        strokeWidth="3"
                        strokeDasharray={`${score.percentageScore} 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className={`absolute text-sm font-bold ${bc.text}`}>{score.percentageScore}%</span>
                  </div>
                </div>
              </div>

              {/* Score band range visual */}
              <div className="mb-5">
                <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                  <span>0</span><span>40</span><span>55</span><span>70</span><span>85</span><span>100</span>
                </div>
                <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden flex">
                  {[
                    { w: 40, color: 'bg-red-400' },
                    { w: 15, color: 'bg-orange-400' },
                    { w: 15, color: 'bg-amber-400' },
                    { w: 15, color: 'bg-blue-400' },
                    { w: 15, color: 'bg-emerald-500' },
                  ].map((seg, i) => (
                    <div key={i} className={`h-full ${seg.color}`} style={{ width: `${seg.w}%` }} />
                  ))}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-gray-900 rounded-full"
                    style={{ left: `${score.percentageScore}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className={`w-2 h-2 rounded-full ${scoreBarColor(score.totalScore)}`} />
                  <span className="text-[10px] text-gray-500">Score {score.totalScore} falls in <strong>{score.scoreBand.label}</strong> band ({score.scoreBand.min}–{score.scoreBand.max})</span>
                </div>
              </div>

              {/* Factor breakdown */}
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-3">Factor Breakdown</p>
              <div className="space-y-2.5">
                {score.factorScores.map(f => (
                  <div key={f.factorId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{f.factorName}</span>
                      <span className="text-xs font-semibold text-gray-800">{f.score}<span className="text-gray-300 font-normal">/{f.maxScore}</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${scoreBarColor(f.percentage)}`}
                        style={{ width: `${f.percentage}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 mt-0.5">{f.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Package Recommendation ──────────────────────────────────── */}
          <div className={`border ${bc.border} rounded-2xl overflow-hidden mb-6`}>
            <div className={`px-6 py-4 ${bc.bg} border-b ${bc.border} flex items-center justify-between`}>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-0.5">Step 3 of 4 · Recommended Package</p>
                <h2 className={`text-lg font-bold ${bc.text}`}>{pkg.packageName}</h2>
                <p className={`text-[10px] ${bc.text} mt-0.5`}>{pkg.riskLevel}</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${bc.text}`}>€{pkg.estimatedAnnualPremiumEur}</p>
                <p className="text-[10px] text-gray-400">estimated/year</p>
                <p className="text-[9px] text-gray-400 mt-0.5">Range: €{pkg.indicativePremiumRange[0]}–€{pkg.indicativePremiumRange[1]}</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-[11px] text-gray-500 mb-4">{pkg.recommendationReason}</p>

              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-2">Coverage Highlights</p>
              <div className="space-y-1.5 mb-4">
                {pkg.coverageHighlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded-full ${bc.ring} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-xs text-gray-600">{h}</span>
                  </div>
                ))}
              </div>

              {pkg.recommendedAddOns.length > 0 && (
                <>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-2">Recommended Add-ons</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {pkg.recommendedAddOns.map((a, i) => (
                      <span key={i} className="text-[10px] bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                  </div>
                </>
              )}

              {pkg.evSpecificNote && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <p className="text-[10px] font-semibold text-blue-700 mb-0.5">⚡ EV-Specific Cover</p>
                  <p className="text-[10px] text-blue-600">{pkg.evSpecificNote}</p>
                </div>
              )}

              {pkg.exclusions.length > 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3">
                  <p className="text-[10px] font-semibold text-gray-500 mb-1">Exclusions</p>
                  {pkg.exclusions.map((ex, i) => (
                    <p key={i} className="text-[10px] text-gray-400">· {ex}</p>
                  ))}
                </div>
              )}

              {pkg.underwriterNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-[10px] font-semibold text-amber-700 mb-0.5">Underwriter Note</p>
                  <p className="text-[10px] text-amber-600">{pkg.underwriterNote}</p>
                </div>
              )}

              <button
                onClick={handleAccept}
                disabled={confirming}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3.5 rounded-xl text-sm font-semibold transition-colors mt-2"
              >
                {confirming ? 'Confirming...' : `Proceed to Insurance Quote →`}
              </button>
              <p className="text-center text-[10px] text-gray-400 mt-2">
                Transformation run stored · Score: {score.totalScore}/100 · Package: {pkg.packageName}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
