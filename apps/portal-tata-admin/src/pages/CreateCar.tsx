import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { getApiBase } from '@eu-jap-hack/auth'

const API_BASE = getApiBase()

const catenaXGuidelines = [
  { section: 'Identification', fields: 'Manufacturer Part ID, Name at Manufacturer, Serial (VIN), Codes, Data Carrier, Classification', standard: 'CX-0143' },
  { section: 'Operation', fields: 'Manufacturer BPNL, Name, Facility, Manufacturing Date, Import Info', standard: 'CX-0143' },
  { section: 'Sustainability', fields: 'Carbon Footprint, Material Footprint, Durability Score, Repairability Score', standard: 'CX-0143' },
  { section: 'Materials', fields: 'Material Composition, Substances of Concern, Critical Raw Materials', standard: 'CX-0143' },
  { section: 'Characteristics', fields: 'Lifespan, Physical Dimensions, Weight', standard: 'CX-0143' },
  { section: 'Performance', fields: 'Motor Type (BEV/ICE/HEV), Battery Capacity, Range, Charging Standard, Power, Torque, Top Speed', standard: 'CX-0126' },
  { section: 'Emissions', fields: 'CO2 g/km, Euro Standard, Energy Label, NOx, Particulates, Electric Consumption', standard: 'CX-0126' },
  { section: 'State of Health', fields: 'Overall Rating, Exterior/Interior/Mechanical Condition, Battery Health %, Inspection Date', standard: 'CX-0126' },
  { section: 'Service & Damage History', fields: 'Service Date, Mileage, Service Type, Damage Incidents, Severity', standard: 'CX-0126' },
  { section: 'Compliance', fields: 'EU Type Approval, Roadworthy Certificate Expiry, NCAP Safety Rating, Homologation Status', standard: 'CX-0126' },
]

const cxStandards = [
  { id: 'CX-0143', name: 'Digital Product Passport Standard' },
  { id: 'CX-0002', name: 'Digital Twins in Catena-X' },
  { id: 'CX-0003', name: 'SAMM Semantic Aspect Meta Model' },
  { id: 'CX-0126', name: 'Industry Core Part Type' },
  { id: 'IDTA-01001-3-0', name: 'Asset Administration Shell Specification' },
]

interface ServiceRecord {
  date: string; mileageKm: number; serviceType: string; servicedBy: string; notes: string; cost: number;
}
interface DamageIncident {
  date: string; type: string; severity: string; location: string; repaired: boolean; repairCost: number; description: string;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ── Custom key-value entries supporting n-level nesting ──────────────────────

interface CustomEntry {
  id: string
  key: string
  value: string
  type: 'text' | 'number' | 'boolean' | 'group'
  children: CustomEntry[]
}

function newEntry(): CustomEntry {
  return { id: generateUUID().slice(0, 8), key: '', value: '', type: 'text', children: [] }
}

function customEntriesToObject(entries: CustomEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const e of entries) {
    if (!e.key) continue
    if (e.type === 'group') {
      result[e.key] = customEntriesToObject(e.children)
    } else if (e.type === 'number') {
      result[e.key] = Number(e.value) || 0
    } else if (e.type === 'boolean') {
      result[e.key] = e.value === 'true'
    } else {
      result[e.key] = e.value
    }
  }
  return result
}

function objectToCustomEntries(obj: Record<string, unknown>): CustomEntry[] {
  return Object.entries(obj).map(([key, val]) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return { id: generateUUID().slice(0, 8), key, value: '', type: 'group' as const, children: objectToCustomEntries(val as Record<string, unknown>) }
    }
    if (typeof val === 'boolean') {
      return { id: generateUUID().slice(0, 8), key, value: String(val), type: 'boolean' as const, children: [] }
    }
    if (typeof val === 'number') {
      return { id: generateUUID().slice(0, 8), key, value: String(val), type: 'number' as const, children: [] }
    }
    return { id: generateUUID().slice(0, 8), key, value: String(val ?? ''), type: 'text' as const, children: [] }
  })
}

const inputClassGlobal = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-colors'

function CustomFieldEditor({
  entries, onChange, depth = 0,
}: { entries: CustomEntry[]; onChange: (updated: CustomEntry[]) => void; depth?: number }) {
  const update = (idx: number, partial: Partial<CustomEntry>) => {
    const next = [...entries]
    next[idx] = { ...next[idx], ...partial }
    if (partial.type === 'group' && next[idx].children.length === 0) {
      next[idx].children = [newEntry()]
    }
    if (partial.type && partial.type !== 'group') {
      next[idx].children = []
    }
    onChange(next)
  }
  const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx))
  const add = () => onChange([...entries, newEntry()])

  return (
    <div className={depth > 0 ? 'ml-5 pl-4 border-l-2 border-gray-200' : ''}>
      {entries.map((e, i) => (
        <div key={e.id} className="mb-2.5">
          <div className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
              <input
                placeholder="Key name"
                value={e.key}
                onChange={ev => update(i, { key: ev.target.value })}
                className={inputClassGlobal}
              />
              <select
                value={e.type}
                onChange={ev => update(i, { type: ev.target.value as CustomEntry['type'] })}
                className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-600 focus:outline-none focus:border-blue-400"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="group">Group (nested)</option>
              </select>
              {e.type === 'group' ? (
                <span className="text-[10px] text-gray-400 py-2.5">→ nested fields below</span>
              ) : e.type === 'boolean' ? (
                <select
                  value={e.value}
                  onChange={ev => update(i, { value: ev.target.value })}
                  className={inputClassGlobal}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  placeholder="Value"
                  type={e.type === 'number' ? 'number' : 'text'}
                  value={e.value}
                  onChange={ev => update(i, { value: ev.target.value })}
                  className={inputClassGlobal}
                />
              )}
            </div>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 mt-2 text-xs flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
          {e.type === 'group' && (
            <div className="mt-2">
              <CustomFieldEditor
                entries={e.children}
                onChange={children => update(i, { children })}
                depth={depth + 1}
              />
            </div>
          )}
        </div>
      ))}
      <button
        onClick={add}
        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors mt-1 ${
          depth === 0
            ? 'text-blue-600 border-blue-200 hover:bg-blue-50'
            : 'text-gray-500 border-gray-200 hover:bg-gray-50'
        }`}
      >
        + Add {depth > 0 ? 'nested ' : ''}field
      </button>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function CreateCar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showGuidelines, setShowGuidelines] = useState(false)

  // Step 0: Identification (was Vehicle Identity)
  const [identification, setIdentification] = useState({
    manufacturerPartId: '', nameAtManufacturer: '', serial: '', make: 'Toyota', model: '', variant: '',
    year: 2025, color: '', bodyType: 'SUV', price: 25000,
    codes: '', dataCarrier: '', classification: 'Passenger Vehicle'
  })

  // Step 1: Operation (was Manufacturer)
  const [operation, setOperation] = useState({
    manufacturerBpnl: 'BPNL00000003TOYO', manufacturerName: 'Toyota Motor Corporation',
    facility: 'Toyota City Manufacturing Plant', manufacturingDate: new Date().toISOString().slice(0, 10),
    country: 'Japan', importInfo: '', certificationBody: 'JARI'
  })

  // Step 2: Performance (was Powertrain)
  const [performance, setPerformance] = useState({
    motorType: 'BEV', batteryCapacityKwh: 40, rangeKm: 350, chargingStandard: 'CCS2',
    chargingTimeHours: 8, transmissionType: 'Automatic', powerKw: 105, torqueNm: 215,
    topSpeedKmh: 150, acceleration0to100: 9.0
  })

  // Step 3: Emissions
  const [emissions, setEmissions] = useState({
    co2GPerKm: 0, euroStandard: 'Euro 6d', energyLabel: 'A+++',
    electricConsumptionKwhPer100km: 15.5
  })

  // Step 4: Sustainability (NEW)
  const [sustainability, setSustainability] = useState({
    carbonFootprint: 0, materialFootprint: 0, durabilityScore: 8.0, repairabilityScore: 7.5, status: 'Assessed'
  })

  // Step 5: Materials
  const [materials, setMaterials] = useState({
    recycledMaterialPercent: 25, batteryChemistry: 'NMC', hazardousSubstances: '',
    recyclabilityPercent: 85, sustainabilityCertifications: 'ISO 14001',
    batterySupplier: 'LG Energy Solution', batteryCountryOfOrigin: 'South Korea',
    materialComposition: '', substancesOfConcern: ''
  })

  // Step 6: Characteristics (NEW)
  const [characteristics, setCharacteristics] = useState({
    lifespanYears: 15, lifespanKm: 300000, lengthMm: 4000, widthMm: 1810, heightMm: 1620, weightKg: 1600
  })

  // Step 7: State of Health (was Condition)
  const [stateOfHealth, setStateOfHealth] = useState({
    overallRating: 9.5, exteriorCondition: 9.5, interiorCondition: 9.5, mechanicalCondition: 9.5,
    batteryHealthPercent: 100, inspectionDate: new Date().toISOString().slice(0, 10),
    inspectedBy: 'Toyota Quality Assurance', notes: 'Factory new condition'
  })

  // Step 8: Service & Damage records
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [damages, setDamages] = useState<DamageIncident[]>([])

  // Step 9: Compliance
  const [compliance, setCompliance] = useState({
    euTypeApprovalNumber: '', roadworthyCertificateExpiry: '',
    emissionsTestDate: new Date().toISOString().slice(0, 10),
    safetyRatingNcap: 5, homologationStatus: 'Approved'
  })

  // Step 10: Custom Additional Data
  const [customFields, setCustomFields] = useState<CustomEntry[]>([])

  // ── Duplicate pre-fill from router state ───────────────────────────────────
  const duplicateFrom = (location.state as { duplicateFrom?: Record<string, unknown> } | null)?.duplicateFrom
  useEffect(() => {
    if (!duplicateFrom) return
    const d = duplicateFrom
    const dpp = (d.dpp ?? {}) as Record<string, unknown>
    const ident = (dpp.identification ?? {}) as Record<string, unknown>
    const identType = (ident.type ?? {}) as Record<string, unknown>
    const op = (dpp.operation ?? {}) as Record<string, unknown>
    const mfg = (op.manufacturer ?? {}) as Record<string, unknown>
    const perf = (dpp.performance ?? {}) as Record<string, unknown>
    const emis = (dpp.emissions ?? {}) as Record<string, unknown>
    const sus = (dpp.sustainability ?? {}) as Record<string, unknown>
    const mat = (dpp.materials ?? {}) as Record<string, unknown>
    const chars = (dpp.characteristics ?? {}) as Record<string, unknown>
    const lifespan = (chars.lifespan ?? {}) as Record<string, unknown>
    const dims = (chars.physicalDimensions ?? {}) as Record<string, unknown>
    const soh = (dpp.stateOfHealth ?? {}) as Record<string, unknown>
    const comp = (dpp.compliance ?? {}) as Record<string, unknown>
    const svcHist = (dpp.serviceHistory ?? {}) as Record<string, unknown>
    const dmgHist = (dpp.damageHistory ?? {}) as Record<string, unknown>

    setIdentification({
      manufacturerPartId: String(identType.manufacturerPartId ?? ''),
      nameAtManufacturer: String(identType.nameAtManufacturer ?? ''),
      serial: '',  // VIN must be new
      make: String(d.make ?? 'Toyota'),
      model: String(d.model ?? ''),
      variant: String(d.variant ?? ''),
      year: Number(d.year) || 2025,
      color: String(ident.color ?? ''),
      bodyType: String(ident.bodyType ?? 'SUV'),
      price: Number(d.price) || 25000,
      codes: Array.isArray(ident.codes) ? (ident.codes as string[]).join(', ') : '',
      dataCarrier: '',
      classification: String(ident.classification ?? 'Passenger Vehicle'),
    })
    setOperation({
      manufacturerBpnl: String(mfg.bpnl ?? 'BPNL00000003TOYO'),
      manufacturerName: String(mfg.name ?? 'Toyota Motor Corporation'),
      facility: String(op.facility ?? ''),
      manufacturingDate: String(op.manufacturingDate ?? new Date().toISOString().slice(0, 10)),
      country: String(op.country ?? 'Japan'),
      importInfo: String(op.importInfo ?? ''),
      certificationBody: String(op.certificationBody ?? 'ARAI'),
    })
    setPerformance({
      motorType: String(perf.motorType ?? 'BEV'),
      batteryCapacityKwh: Number(perf.batteryCapacityKwh) || 40,
      rangeKm: Number(perf.rangeKm) || 350,
      chargingStandard: String(perf.chargingStandard ?? 'CCS2'),
      chargingTimeHours: Number(perf.chargingTimeHours) || 8,
      transmissionType: String(perf.transmissionType ?? 'Automatic'),
      powerKw: Number(perf.powerKw) || 105,
      torqueNm: Number(perf.torqueNm) || 215,
      topSpeedKmh: Number(perf.topSpeedKmh) || 150,
      acceleration0to100: Number(perf.acceleration0to100) || 9.0,
    })
    setEmissions({
      co2GPerKm: Number(emis.co2GPerKm) || 0,
      euroStandard: String(emis.euroStandard ?? 'Euro 6d'),
      energyLabel: String(emis.energyLabel ?? 'A+++'),
      electricConsumptionKwhPer100km: Number(emis.electricConsumptionKwhPer100km) || 15.5,
    })
    setSustainability({
      carbonFootprint: Number(sus.carbonFootprint) || 0,
      materialFootprint: Number(sus.materialFootprint) || 0,
      durabilityScore: Number(sus.durabilityScore) || 8.0,
      repairabilityScore: Number(sus.repairabilityScore) || 7.5,
      status: String(sus.status ?? 'Assessed'),
    })
    setMaterials({
      recycledMaterialPercent: Number(mat.recycledMaterialPercent) || 25,
      batteryChemistry: String(mat.batteryChemistry ?? 'NMC'),
      hazardousSubstances: Array.isArray(mat.hazardousSubstances) ? (mat.hazardousSubstances as string[]).join(', ') : '',
      recyclabilityPercent: Number(mat.recyclabilityPercent) || 85,
      sustainabilityCertifications: Array.isArray(mat.sustainabilityCertifications) ? (mat.sustainabilityCertifications as string[]).join(', ') : '',
      batterySupplier: String(mat.batterySupplier ?? ''),
      batteryCountryOfOrigin: String(mat.batteryCountryOfOrigin ?? ''),
      materialComposition: Array.isArray(mat.materialComposition) ? (mat.materialComposition as string[]).join(', ') : '',
      substancesOfConcern: Array.isArray(mat.substancesOfConcern) ? (mat.substancesOfConcern as string[]).join(', ') : '',
    })
    setCharacteristics({
      lifespanYears: Number(lifespan.years) || 15,
      lifespanKm: Number(lifespan.km) || 300000,
      lengthMm: Number(dims.lengthMm) || 4000,
      widthMm: Number(dims.widthMm) || 1810,
      heightMm: Number(dims.heightMm) || 1620,
      weightKg: Number(dims.weightKg) || 1600,
    })
    setStateOfHealth({
      overallRating: Number(soh.overallRating) || 9.5,
      exteriorCondition: Number(soh.exteriorCondition) || 9.5,
      interiorCondition: Number(soh.interiorCondition) || 9.5,
      mechanicalCondition: Number(soh.mechanicalCondition) || 9.5,
      batteryHealthPercent: Number(soh.batteryHealthPercent) || 100,
      inspectionDate: String(soh.inspectionDate ?? new Date().toISOString().slice(0, 10)),
      inspectedBy: String(soh.inspectedBy ?? ''),
      notes: String(soh.notes ?? ''),
    })
    setServices(Array.isArray(svcHist.records) ? (svcHist.records as ServiceRecord[]) : [])
    setDamages(Array.isArray(dmgHist.incidents) ? (dmgHist.incidents as DamageIncident[]) : [])
    setCompliance({
      euTypeApprovalNumber: String(comp.euTypeApprovalNumber ?? ''),
      roadworthyCertificateExpiry: String(comp.roadworthyCertificateExpiry ?? ''),
      emissionsTestDate: String(comp.emissionsTestDate ?? new Date().toISOString().slice(0, 10)),
      safetyRatingNcap: Number(comp.safetyRatingNcap) || 5,
      homologationStatus: String(comp.homologationStatus ?? 'Approved'),
    })
    // Load custom additionalData if present
    const additional = dpp.additionalData as Record<string, unknown> | undefined
    if (additional && typeof additional === 'object' && !Array.isArray(additional) && Object.keys(additional).length > 0) {
      setCustomFields(objectToCustomEntries(additional))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addService = () => {
    setServices([...services, { date: '', mileageKm: 0, serviceType: 'Regular Service', servicedBy: '', notes: '', cost: 0 }])
  }
  const removeService = (i: number) => setServices(services.filter((_, idx) => idx !== i))
  const updateService = (i: number, field: string, value: string | number) => {
    const updated = [...services]; (updated[i] as unknown as Record<string, unknown>)[field] = value; setServices(updated)
  }

  const addDamage = () => {
    setDamages([...damages, { date: '', type: 'Collision', severity: 'Minor', location: '', repaired: true, repairCost: 0, description: '' }])
  }
  const removeDamage = (i: number) => setDamages(damages.filter((_, idx) => idx !== i))
  const updateDamage = (i: number, field: string, value: string | number | boolean) => {
    const updated = [...damages]; (updated[i] as unknown as Record<string, unknown>)[field] = value; setDamages(updated)
  }

  const handleSubmit = async () => {
    if (!identification.serial || !identification.model) { alert('VIN (Serial) and Model are required'); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const passportId = generateUUID()
      const globalAssetId = `urn:uuid:${generateUUID()}`

      const car = {
        vin: identification.serial,
        make: identification.make,
        model: identification.model,
        variant: identification.variant,
        year: identification.year,
        price: identification.price,
        imageUrl: '',
        status: 'available',
        aas: {
          idShort: `AAS_${identification.serial}`,
          globalAssetId,
          specificAssetIds: [
            { name: 'manufacturerId', value: operation.manufacturerBpnl },
            { name: 'van', value: identification.serial }
          ],
          submodelDescriptors: [
            {
              idShort: 'DigitalProductPassport',
              semanticId: 'urn:samm:io.catenax.generic.digital_product_passport:5.0.0#DigitalProductPassport'
            },
            {
              idShort: 'VehicleSubmodel',
              semanticId: 'urn:samm:io.catenax.vehicle.product_description:1.0.0#ProductDescription'
            }
          ]
        },
        dpp: {
          semanticId: 'urn:samm:io.catenax.generic.digital_product_passport:5.0.0#DigitalProductPassport',
          metadata: {
            passportIdentifier: passportId,
            version: '1.0.0',
            status: 'draft',
            issueDate: now,
            expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            lastModification: now
          },
          identification: {
            type: {
              manufacturerPartId: identification.manufacturerPartId || `TOYO-${identification.model.replace(/\s+/g, '-').toUpperCase()}`,
              nameAtManufacturer: identification.nameAtManufacturer || `${identification.make} ${identification.model}`
            },
            serial: identification.serial,
            codes: identification.codes ? identification.codes.split(',').map(s => s.trim()) : [],
            dataCarrier: identification.dataCarrier || `https://dpp.tata.com/${identification.serial}`,
            classification: identification.classification,
            color: identification.color,
            bodyType: identification.bodyType
          },
          operation: {
            manufacturer: {
              bpnl: operation.manufacturerBpnl,
              name: operation.manufacturerName
            },
            facility: operation.facility,
            manufacturingDate: operation.manufacturingDate,
            country: operation.country,
            importInfo: operation.importInfo,
            certificationBody: operation.certificationBody
          },
          sustainability: {
            carbonFootprint: sustainability.carbonFootprint,
            materialFootprint: sustainability.materialFootprint,
            durabilityScore: sustainability.durabilityScore,
            repairabilityScore: sustainability.repairabilityScore,
            status: sustainability.status
          },
          materials: {
            recycledMaterialPercent: materials.recycledMaterialPercent,
            batteryChemistry: materials.batteryChemistry,
            recyclabilityPercent: materials.recyclabilityPercent,
            batterySupplier: materials.batterySupplier,
            batteryCountryOfOrigin: materials.batteryCountryOfOrigin,
            materialComposition: materials.materialComposition ? materials.materialComposition.split(',').map(s => s.trim()) : [],
            substancesOfConcern: materials.substancesOfConcern ? materials.substancesOfConcern.split(',').map(s => s.trim()) : [],
            sustainabilityCertifications: materials.sustainabilityCertifications ? materials.sustainabilityCertifications.split(',').map(s => s.trim()) : [],
            hazardousSubstances: materials.hazardousSubstances ? materials.hazardousSubstances.split(',').map(s => s.trim()) : []
          },
          characteristics: {
            lifespan: { years: characteristics.lifespanYears, km: characteristics.lifespanKm },
            physicalDimensions: {
              lengthMm: characteristics.lengthMm,
              widthMm: characteristics.widthMm,
              heightMm: characteristics.heightMm,
              weightKg: characteristics.weightKg
            }
          },
          commercial: {
            price: identification.price,
            currency: 'EUR',
            placedOnMarket: operation.manufacturingDate
          },
          handling: {
            applicable: false
          },
          sources: [],
          additionalData: customFields.length > 0 ? customEntriesToObject(customFields) : [],
          performance: performance,
          emissions: emissions,
          stateOfHealth: stateOfHealth,
          serviceHistory: {
            totalServiceRecords: services.length,
            lastServiceDate: services.length > 0 ? services[services.length - 1].date : '',
            currentMileageKm: 0,
            records: services
          },
          damageHistory: { totalIncidents: damages.length, incidents: damages },
          ownershipChain: {
            currentOwner: {
              ownerName: 'Toyota (Inventory)', ownerId: 'toyota-motors',
              purchaseDate: now, purchasePrice: identification.price, country: 'Japan'
            },
            previousOwners: [],
            totalOwners: 0
          },
          compliance: compliance,
          manufacturerCredential: {
            credentialId: `cred-org-toyota-${generateUUID().slice(0, 8)}`,
            type: 'ManufacturerVC',
            issuer: 'EU APAC Dataspace',
            issuerDid: 'did:eu-dataspace:toyota-motors-001',
            holder: 'Toyota Motor Corporation',
            holderDid: `did:bpn:${operation.manufacturerBpnl}`,
            issuedAt: now,
            status: 'active',
            credentialSubject: {
              companyName: 'Toyota Motor Corporation',
              registrationNumber: '0180-01-008846',
              manufacturingLicense: 'EU-MFG-2024-TOYOTA-001',
              isoQualityCertification: 'ISO 9001:2015',
              iatf16949Certified: true,
              manufacturingCountry: operation.country,
              authorizedEUDistributor: true
            }
          }
        }
      }
      await axios.post(`${API_BASE}/cars`, car)
      navigate('/')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      alert(err.response?.data?.error || 'Failed to create car')
    }
    setSaving(false)
  }

  const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-colors'
  const labelClass = 'block text-[11px] text-gray-400 mb-1 uppercase tracking-wide'

  const steps = [
    'Identification', 'Operation', 'Performance', 'Emissions', 'Sustainability', 'Materials', 'Characteristics', 'State of Health', 'History', 'Compliance', 'Custom Data'
  ]

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Fleet
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{duplicateFrom ? 'Duplicate Car' : 'Create New Car'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {duplicateFrom
              ? `Pre-filled from ${String(duplicateFrom.make)} ${String(duplicateFrom.model)} (${String(duplicateFrom.vin)}) — enter a new VIN`
              : 'DPP structure aligned with Catena-X CX-0143 standard'}
          </p>
        </div>
        <button onClick={() => setShowGuidelines(!showGuidelines)} className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
          {showGuidelines ? 'Hide' : 'View'} Catena-X Guidelines
        </button>
      </div>

      {/* Catena-X Guidelines Panel */}
      {showGuidelines && (
        <div className="mb-6 border border-blue-200 bg-blue-50/30 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">Catena-X Digital Product Passport Standard</h3>
          <p className="text-xs text-blue-600 mb-4">The following structure conforms to Catena-X automotive DPP guidelines for interoperability within the EU APAC Dataspace.</p>

          <div className="mb-4 space-y-1.5">
            {cxStandards.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{s.id}</span>
                <span className="text-[11px] text-gray-700">{s.name}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {catenaXGuidelines.map((g, i) => (
              <div key={i} className="bg-white border border-blue-100 rounded-lg p-3 flex items-start gap-3">
                <span className="text-[10px] text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{g.standard}</span>
                <div>
                  <p className="text-xs font-medium text-gray-800">{g.section}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{g.fields}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} className={`text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-colors ${
            step === i ? 'bg-blue-600 text-white' : i < step ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
          }`}>{i + 1}. {s}</button>
        ))}
      </div>

      {/* Step 0: Identification */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-[11px] text-blue-700">CX-0143 Identification: Defines the product identity per Catena-X Digital Product Passport standard.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Serial (VIN) *</label><input value={identification.serial} onChange={e => setIdentification({...identification, serial: e.target.value.toUpperCase()})} placeholder="TOYO2025BZ4X0021" className={inputClass} /></div>
            <div><label className={labelClass}>Manufacturer Part ID</label><input value={identification.manufacturerPartId} onChange={e => setIdentification({...identification, manufacturerPartId: e.target.value})} placeholder="TOYO-BZ4X-FWD" className={inputClass} /></div>
            <div><label className={labelClass}>Name at Manufacturer</label><input value={identification.nameAtManufacturer} onChange={e => setIdentification({...identification, nameAtManufacturer: e.target.value})} placeholder="Toyota bZ4X FWD" className={inputClass} /></div>
            <div><label className={labelClass}>Make</label><input value={identification.make} onChange={e => setIdentification({...identification, make: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Model *</label><input value={identification.model} onChange={e => setIdentification({...identification, model: e.target.value})} placeholder="bZ4X" className={inputClass} /></div>
            <div><label className={labelClass}>Variant</label><input value={identification.variant} onChange={e => setIdentification({...identification, variant: e.target.value})} placeholder="LR Dark Edition" className={inputClass} /></div>
            <div><label className={labelClass}>Year</label><input type="number" value={identification.year} onChange={e => setIdentification({...identification, year: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Color</label><input value={identification.color} onChange={e => setIdentification({...identification, color: e.target.value})} placeholder="Pristine White" className={inputClass} /></div>
            <div><label className={labelClass}>Body Type</label>
              <select value={identification.bodyType} onChange={e => setIdentification({...identification, bodyType: e.target.value})} className={inputClass}>
                <option>SUV</option><option>Sedan</option><option>Hatchback</option><option>Coupe</option><option>Crossover</option>
              </select>
            </div>
            <div><label className={labelClass}>Price (&euro;)</label><input type="number" value={identification.price} onChange={e => setIdentification({...identification, price: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Codes (comma-separated)</label><input value={identification.codes} onChange={e => setIdentification({...identification, codes: e.target.value})} placeholder="GTIN, Batch ID" className={inputClass} /></div>
            <div><label className={labelClass}>Data Carrier URL</label><input value={identification.dataCarrier} onChange={e => setIdentification({...identification, dataCarrier: e.target.value})} placeholder="https://dpp.tata.com/VIN" className={inputClass} /></div>
            <div><label className={labelClass}>Classification</label><input value={identification.classification} onChange={e => setIdentification({...identification, classification: e.target.value})} className={inputClass} /></div>
          </div>
        </div>
      )}

      {/* Step 1: Operation */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
            <p className="text-[11px] text-indigo-700">CX-0143 Operation: Manufacturer and facility information. BPNL is the Business Partner Number (Legal Entity) in Catena-X.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Manufacturer BPNL</label><input value={operation.manufacturerBpnl} onChange={e => setOperation({...operation, manufacturerBpnl: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Manufacturer Name</label><input value={operation.manufacturerName} onChange={e => setOperation({...operation, manufacturerName: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Facility</label><input value={operation.facility} onChange={e => setOperation({...operation, facility: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Manufacturing Date</label><input type="date" value={operation.manufacturingDate} onChange={e => setOperation({...operation, manufacturingDate: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Country</label><input value={operation.country} onChange={e => setOperation({...operation, country: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Import Info</label><input value={operation.importInfo} onChange={e => setOperation({...operation, importInfo: e.target.value})} placeholder="Import permit, customs info" className={inputClass} /></div>
            <div><label className={labelClass}>Certification Body</label><input value={operation.certificationBody} onChange={e => setOperation({...operation, certificationBody: e.target.value})} className={inputClass} /></div>
          </div>
        </div>
      )}

      {/* Step 2: Performance */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Motor Type</label>
              <select value={performance.motorType} onChange={e => setPerformance({...performance, motorType: e.target.value})} className={inputClass}>
                <option value="BEV">BEV (Battery Electric)</option><option value="ICE">ICE (Combustion)</option><option value="HEV">HEV (Hybrid)</option>
              </select>
            </div>
            <div><label className={labelClass}>Battery Capacity (kWh)</label><input type="number" value={performance.batteryCapacityKwh} onChange={e => setPerformance({...performance, batteryCapacityKwh: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Range (km)</label><input type="number" value={performance.rangeKm} onChange={e => setPerformance({...performance, rangeKm: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Charging Standard</label><input value={performance.chargingStandard} onChange={e => setPerformance({...performance, chargingStandard: e.target.value})} className={inputClass} /></div>
            <div><label className={labelClass}>Power (kW)</label><input type="number" value={performance.powerKw} onChange={e => setPerformance({...performance, powerKw: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Torque (Nm)</label><input type="number" value={performance.torqueNm} onChange={e => setPerformance({...performance, torqueNm: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Top Speed (km/h)</label><input type="number" value={performance.topSpeedKmh} onChange={e => setPerformance({...performance, topSpeedKmh: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>0-100 km/h (seconds)</label><input type="number" step="0.1" value={performance.acceleration0to100} onChange={e => setPerformance({...performance, acceleration0to100: Number(e.target.value)})} className={inputClass} /></div>
          </div>
        </div>
      )}

      {/* Step 3: Emissions */}
      {step === 3 && (
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>CO2 (g/km)</label><input type="number" value={emissions.co2GPerKm} onChange={e => setEmissions({...emissions, co2GPerKm: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Euro Standard</label><input value={emissions.euroStandard} onChange={e => setEmissions({...emissions, euroStandard: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Energy Label</label><input value={emissions.energyLabel} onChange={e => setEmissions({...emissions, energyLabel: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Electric Consumption (kWh/100km)</label><input type="number" step="0.1" value={emissions.electricConsumptionKwhPer100km} onChange={e => setEmissions({...emissions, electricConsumptionKwhPer100km: Number(e.target.value)})} className={inputClass} /></div>
        </div>
      )}

      {/* Step 4: Sustainability */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
            <p className="text-[11px] text-emerald-700">CX-0143 Sustainability: Carbon and material footprint metrics, durability and repairability scores per ESPR requirements.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Carbon Footprint (kg CO2e)</label><input type="number" step="0.1" value={sustainability.carbonFootprint} onChange={e => setSustainability({...sustainability, carbonFootprint: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Material Footprint (kg)</label><input type="number" step="0.1" value={sustainability.materialFootprint} onChange={e => setSustainability({...sustainability, materialFootprint: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Durability Score (0-10)</label><input type="number" step="0.1" min="0" max="10" value={sustainability.durabilityScore} onChange={e => setSustainability({...sustainability, durabilityScore: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Repairability Score (0-10)</label><input type="number" step="0.1" min="0" max="10" value={sustainability.repairabilityScore} onChange={e => setSustainability({...sustainability, repairabilityScore: Number(e.target.value)})} className={inputClass} /></div>
          </div>
        </div>
      )}

      {/* Step 5: Materials */}
      {step === 5 && (
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Recycled Material %</label><input type="number" value={materials.recycledMaterialPercent} onChange={e => setMaterials({...materials, recycledMaterialPercent: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Battery Chemistry</label><input value={materials.batteryChemistry} onChange={e => setMaterials({...materials, batteryChemistry: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Recyclability %</label><input type="number" value={materials.recyclabilityPercent} onChange={e => setMaterials({...materials, recyclabilityPercent: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Battery Supplier</label><input value={materials.batterySupplier} onChange={e => setMaterials({...materials, batterySupplier: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Material Composition (comma-separated)</label><input value={materials.materialComposition} onChange={e => setMaterials({...materials, materialComposition: e.target.value})} placeholder="Steel, Aluminum, Lithium" className={inputClass} /></div>
          <div><label className={labelClass}>Substances of Concern (comma-separated)</label><input value={materials.substancesOfConcern} onChange={e => setMaterials({...materials, substancesOfConcern: e.target.value})} placeholder="Lead, Cadmium" className={inputClass} /></div>
          <div><label className={labelClass}>Hazardous Substances (comma-separated)</label><input value={materials.hazardousSubstances} onChange={e => setMaterials({...materials, hazardousSubstances: e.target.value})} placeholder="Lead, Cadmium" className={inputClass} /></div>
          <div><label className={labelClass}>Sustainability Certs (comma-separated)</label><input value={materials.sustainabilityCertifications} onChange={e => setMaterials({...materials, sustainabilityCertifications: e.target.value})} className={inputClass} /></div>
        </div>
      )}

      {/* Step 6: Characteristics */}
      {step === 6 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-[11px] text-blue-700">CX-0143 Characteristics: Product lifespan and physical dimensions.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Lifespan (years)</label><input type="number" value={characteristics.lifespanYears} onChange={e => setCharacteristics({...characteristics, lifespanYears: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Lifespan (km)</label><input type="number" value={characteristics.lifespanKm} onChange={e => setCharacteristics({...characteristics, lifespanKm: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Length (mm)</label><input type="number" value={characteristics.lengthMm} onChange={e => setCharacteristics({...characteristics, lengthMm: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Width (mm)</label><input type="number" value={characteristics.widthMm} onChange={e => setCharacteristics({...characteristics, widthMm: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Height (mm)</label><input type="number" value={characteristics.heightMm} onChange={e => setCharacteristics({...characteristics, heightMm: Number(e.target.value)})} className={inputClass} /></div>
            <div><label className={labelClass}>Weight (kg)</label><input type="number" value={characteristics.weightKg} onChange={e => setCharacteristics({...characteristics, weightKg: Number(e.target.value)})} className={inputClass} /></div>
          </div>
        </div>
      )}

      {/* Step 7: State of Health */}
      {step === 7 && (
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Overall Rating (0-10)</label><input type="number" step="0.1" min="0" max="10" value={stateOfHealth.overallRating} onChange={e => setStateOfHealth({...stateOfHealth, overallRating: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Exterior (0-10)</label><input type="number" step="0.1" min="0" max="10" value={stateOfHealth.exteriorCondition} onChange={e => setStateOfHealth({...stateOfHealth, exteriorCondition: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Interior (0-10)</label><input type="number" step="0.1" min="0" max="10" value={stateOfHealth.interiorCondition} onChange={e => setStateOfHealth({...stateOfHealth, interiorCondition: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Mechanical (0-10)</label><input type="number" step="0.1" min="0" max="10" value={stateOfHealth.mechanicalCondition} onChange={e => setStateOfHealth({...stateOfHealth, mechanicalCondition: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Battery Health %</label><input type="number" min="0" max="100" value={stateOfHealth.batteryHealthPercent} onChange={e => setStateOfHealth({...stateOfHealth, batteryHealthPercent: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Inspection Date</label><input type="date" value={stateOfHealth.inspectionDate} onChange={e => setStateOfHealth({...stateOfHealth, inspectionDate: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Inspected By</label><input value={stateOfHealth.inspectedBy} onChange={e => setStateOfHealth({...stateOfHealth, inspectedBy: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Notes</label><input value={stateOfHealth.notes} onChange={e => setStateOfHealth({...stateOfHealth, notes: e.target.value})} className={inputClass} /></div>
        </div>
      )}

      {/* Step 8: History */}
      {step === 8 && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Service Records</p>
              <button onClick={addService} className="text-xs text-blue-600 border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-50">+ Add Record</button>
            </div>
            {services.length === 0 && <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-center">No service records yet. New cars typically have none.</p>}
            {services.map((s, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-4 mb-3">
                <div className="flex justify-between mb-3">
                  <span className="text-xs text-gray-500">Service #{i + 1}</span>
                  <button onClick={() => removeService(i)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Date</label><input type="date" value={s.date} onChange={e => updateService(i, 'date', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Mileage (km)</label><input type="number" value={s.mileageKm} onChange={e => updateService(i, 'mileageKm', Number(e.target.value))} className={inputClass} /></div>
                  <div><label className={labelClass}>Type</label><input value={s.serviceType} onChange={e => updateService(i, 'serviceType', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Serviced By</label><input value={s.servicedBy} onChange={e => updateService(i, 'servicedBy', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Cost (&euro;)</label><input type="number" value={s.cost} onChange={e => updateService(i, 'cost', Number(e.target.value))} className={inputClass} /></div>
                  <div><label className={labelClass}>Notes</label><input value={s.notes} onChange={e => updateService(i, 'notes', e.target.value)} className={inputClass} /></div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Damage Incidents</p>
              <button onClick={addDamage} className="text-xs text-amber-600 border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-50">+ Add Incident</button>
            </div>
            {damages.length === 0 && <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-center">No damage incidents. Clean history!</p>}
            {damages.map((d, i) => (
              <div key={i} className="border border-amber-100 rounded-lg p-4 mb-3">
                <div className="flex justify-between mb-3">
                  <span className="text-xs text-amber-500">Incident #{i + 1}</span>
                  <button onClick={() => removeDamage(i)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Date</label><input type="date" value={d.date} onChange={e => updateDamage(i, 'date', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Type</label>
                    <select value={d.type} onChange={e => updateDamage(i, 'type', e.target.value)} className={inputClass}>
                      <option>Collision</option><option>Scratch</option><option>Dent</option><option>Flood Damage</option><option>Vandalism</option><option>Other</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Severity</label>
                    <select value={d.severity} onChange={e => updateDamage(i, 'severity', e.target.value)} className={inputClass}>
                      <option>Minor</option><option>Moderate</option><option>Major</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Location</label><input value={d.location} onChange={e => updateDamage(i, 'location', e.target.value)} placeholder="Front bumper" className={inputClass} /></div>
                  <div><label className={labelClass}>Repaired</label>
                    <select value={String(d.repaired)} onChange={e => updateDamage(i, 'repaired', e.target.value === 'true')} className={inputClass}>
                      <option value="true">Yes</option><option value="false">No</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Repair Cost (&euro;)</label><input type="number" value={d.repairCost} onChange={e => updateDamage(i, 'repairCost', Number(e.target.value))} className={inputClass} /></div>
                  <div className="col-span-2"><label className={labelClass}>Description</label><input value={d.description} onChange={e => updateDamage(i, 'description', e.target.value)} className={inputClass} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 9: Compliance */}
      {step === 9 && (
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>EU Type Approval Number</label><input value={compliance.euTypeApprovalNumber} onChange={e => setCompliance({...compliance, euTypeApprovalNumber: e.target.value})} placeholder="e11*2007/46*1234" className={inputClass} /></div>
          <div><label className={labelClass}>Roadworthy Cert Expiry</label><input type="date" value={compliance.roadworthyCertificateExpiry} onChange={e => setCompliance({...compliance, roadworthyCertificateExpiry: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>Emissions Test Date</label><input type="date" value={compliance.emissionsTestDate} onChange={e => setCompliance({...compliance, emissionsTestDate: e.target.value})} className={inputClass} /></div>
          <div><label className={labelClass}>NCAP Safety Rating (0-5)</label><input type="number" min="0" max="5" value={compliance.safetyRatingNcap} onChange={e => setCompliance({...compliance, safetyRatingNcap: Number(e.target.value)})} className={inputClass} /></div>
          <div><label className={labelClass}>Homologation Status</label>
            <select value={compliance.homologationStatus} onChange={e => setCompliance({...compliance, homologationStatus: e.target.value})} className={inputClass}>
              <option>Approved</option><option>Pending</option><option>Rejected</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 10: Custom Data */}
      {step === 10 && (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
            <p className="text-[11px] text-purple-700">
              Add any additional custom data fields to the DPP. You can create nested groups for hierarchical data. These will be stored under the <code className="bg-purple-100 px-1 rounded">additionalData</code> section.
            </p>
          </div>
          {customFields.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400 mb-3">No custom fields yet</p>
              <button
                onClick={() => setCustomFields([newEntry()])}
                className="text-xs font-medium text-purple-600 border border-purple-200 px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors"
              >
                + Add Custom Field
              </button>
            </div>
          ) : (
            <CustomFieldEditor entries={customFields} onChange={setCustomFields} />
          )}

          {/* Preview */}
          {customFields.some(e => e.key) && (
            <div className="mt-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium mb-2">Preview (JSON)</p>
              <pre className="text-[9px] bg-gray-900 text-emerald-400 rounded-lg p-3 overflow-auto max-h-40 font-mono leading-relaxed">
                {JSON.stringify(customEntriesToObject(customFields), null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="text-sm text-gray-500 border border-gray-200 px-5 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-30 transition-colors"
        >
          Previous
        </button>
        <span className="text-xs text-gray-400">Step {step + 1} of {steps.length}</span>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="text-sm text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg transition-colors"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="text-sm text-white bg-gray-900 hover:bg-gray-800 px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Car with DPP'}
          </button>
        )}
      </div>
    </div>
  )
}
