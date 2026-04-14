// ============================================================
// Catena-X / IDSA AAS Aligned Types
// Based on: CX-0143, CX-0002, IDTA-01001-3-0, io.catenax.generic.digital_product_passport:6.0.0
// ============================================================

// --- AAS (Asset Administration Shell) Types per IDTA-01001-3-0 ---

export interface SpecificAssetId {
  name: string;
  value: string;
  externalSubjectId?: {
    type: "ExternalReference";
    keys: Array<{ type: "GlobalReference"; value: string }>;
  };
}

export interface SubmodelDescriptor {
  idShort: string;
  id: string;
  semanticId: {
    type: "ExternalReference";
    keys: Array<{ type: "Submodel"; value: string }>;
  };
  endpoints: Array<{
    interface: string;
    protocolInformation: {
      href: string;
      endpointProtocol: string;
      endpointProtocolVersion: string[];
      subprotocol?: string;
      subprotocolBody?: string;
      subprotocolBodyEncoding?: string;
    };
  }>;
}

export interface AssetAdministrationShell {
  idShort: string;
  id: string; // urn:uuid:...
  globalAssetId: string; // urn:uuid:...
  specificAssetIds: SpecificAssetId[];
  submodelDescriptors: SubmodelDescriptor[];
}

// --- CX-0143 Digital Product Passport Submodel Types ---
// Semantic ID: urn:samm:io.catenax.generic.digital_product_passport:6.0.0#DigitalProductPassport

export interface PassportMetadata {
  passportIdentifier: string; // UUIDv4
  version: string;
  status: "draft" | "approved" | "invalid" | "expired";
  issueDate: string; // yyyy-mm-dd
  expirationDate: string;
  economicOperatorId: string; // BPNL pattern
  registrationIdentifier?: string;
  lastModification?: string;
}

export interface IdentificationType {
  manufacturerPartId: string;
  nameAtManufacturer: string;
}

export interface IdentificationCode {
  key: string; // e.g., "VIN", "GTIN", "TARIC"
  value: string;
}

export interface DataCarrier {
  carrierType: string; // "QR", "DataMatrix", "RFID"
  carrierLayout: string;
}

export interface Classification {
  classificationStandard: string;
  classificationId: string;
  classificationDescription?: string;
}

export interface Identification {
  type: IdentificationType;
  serial?: string; // VIN for vehicles
  batch?: string;
  codes: IdentificationCode[];
  dataCarrier: DataCarrier;
  classification: Classification[];
}

export interface ManufacturerFacility {
  facilityId: string; // BPNA pattern
  facilityName: string;
  country: string;
}

export interface OperationManufacturer {
  manufacturer: string; // BPNL
  manufacturerName: string;
  facility: ManufacturerFacility[];
  manufacturingDate: string;
}

export interface Operation {
  manufacturer: OperationManufacturer;
  import?: {
    applicable: boolean;
    importerName?: string;
    importerAddress?: string;
  };
}

export interface CarbonFootprint {
  co2FootprintTotal: number; // kg CO2e
  productStageCarbonFootprint?: number;
  distributionStageCarbonFootprint?: number;
  lifecycleStage: string;
  performanceClass: string;
  declarationFile?: string;
  ruleBook?: string;
}

export interface MaterialFootprint {
  materialWeight: number; // kg
  recyclateContent?: number; // percentage
  renewableContent?: number;
  declarationFile?: string;
}

export interface ProductFootprint {
  carbon: CarbonFootprint;
  material: MaterialFootprint;
}

export interface Sustainability {
  status: string;
  productFootprint: ProductFootprint;
  durabilityScore?: number;
  repairabilityScore?: number;
}

export interface MaterialComposition {
  materialName: string;
  materialWeight: number;
  recycledPercentage: number;
  renewablePercentage: number;
  critical: boolean;
}

export interface SubstanceOfConcern {
  substanceName: string;
  concentrationRange: string;
  hazardClassification: string;
  exemption?: string;
  location?: string;
}

export interface Materials {
  materialComposition: MaterialComposition[];
  substancesOfConcern: SubstanceOfConcern[];
}

export interface Lifespan {
  type: string; // "guaranteed lifetime" | "technical lifetime" | "mean time between failures"
  unit: string; // "year" | "cycle" | "kilometre"
  value: number;
}

export interface PhysicalDimension {
  length?: { value: number; unit: string };
  width?: { value: number; unit: string };
  height?: { value: number; unit: string };
  weight?: { value: number; unit: string };
  volume?: { value: number; unit: string };
}

export interface Characteristics {
  lifespan: Lifespan[];
  physicalDimension: PhysicalDimension;
  generalPerformanceClass?: string;
}

export interface Commercial {
  placedOnMarket: string; // date
  intendedPurpose?: string;
  recallInformation?: {
    applicable: boolean;
    description?: string;
  };
}

export interface SparePart {
  partName: string;
  partId: string;
  producer: string;
}

export interface Handling {
  applicable: boolean;
  spareParts: SparePart[];
}

export interface Source {
  header: string;
  category: string;
  type: string; // "url" | "document" | "attachment"
  content: string;
}

export interface AdditionalData {
  label: string;
  description?: string;
  type: string;
  data: unknown;
  children?: AdditionalData[];
}

// --- Vehicle-Specific Submodel Types (Automotive Extension) ---
// Semantic ID: urn:samm:io.catenax.vehicle.vehicle_product_passport:1.0.0#VehicleProductPassport

export interface Performance {
  motorType: string; // "BEV" | "ICE" | "HEV" | "PHEV"
  batteryCapacityKwh?: number;
  rangeKm?: number;
  chargingStandard?: string;
  chargingTimeHours?: number;
  engineCC?: number;
  fuelType?: string;
  transmissionType: string;
  powerKw: number;
  torqueNm: number;
  topSpeedKmh: number;
  acceleration0to100?: number;
}

export interface Emissions {
  co2GPerKm: number;
  euroStandard: string;
  energyLabel: string;
  noxMgPerKm?: number;
  particulatesMgPerKm?: number;
  electricConsumptionKwhPer100km?: number;
}

export interface ServiceRecord {
  date: string;
  mileageKm: number;
  serviceType: string;
  servicedBy: string;
  notes: string;
  cost: number;
}

export interface ServiceHistory {
  totalServiceRecords: number;
  lastServiceDate: string;
  currentMileageKm: number;
  records: ServiceRecord[];
}

export interface DamageIncident {
  date: string;
  type: string;
  severity: "Minor" | "Moderate" | "Major";
  location: string;
  repaired: boolean;
  repairCost: number;
  description: string;
}

export interface DamageHistory {
  totalIncidents: number;
  incidents: DamageIncident[];
}

export interface StateOfHealth {
  overallRating: number; // 0-10
  exteriorCondition: number;
  interiorCondition: number;
  mechanicalCondition: number;
  batteryHealthPercent?: number;
  inspectionDate: string;
  inspectedBy: string;
  notes: string;
}

export interface OwnershipRecord {
  ownerName: string;
  ownerId: string;
  purchaseDate: string;
  purchasePrice: number;
  country: string;
}

export interface OwnershipChain {
  currentOwner: OwnershipRecord;
  previousOwners: OwnershipRecord[];
  totalOwners: number;
}

export interface Compliance {
  euTypeApprovalNumber: string;
  roadworthyCertificateExpiry: string;
  emissionsTestDate: string;
  safetyRatingNcap: number;
  homologationStatus: string;
}

// --- Asset / Participant Verifiable Credential ---

export interface DPPCredential {
  credentialId: string;
  type: "ManufacturerVC";
  issuer: string;
  issuerDid: string;
  holder: string;
  holderDid: string;
  issuedAt: string;
  status: "active" | "revoked" | "expired";
  credentialSubject: Record<string, unknown>;
}

// --- Assembled DPP (Catena-X aligned) ---

export interface DPP {
  // CX-0143 Semantic Reference
  semanticId: string;

  // CX-0143 Generic Digital Product Passport sections
  metadata: PassportMetadata;
  identification: Identification;
  operation: Operation;
  sustainability: Sustainability;
  materials: Materials;
  characteristics: Characteristics;
  commercial: Commercial;
  handling: Handling;
  sources: Source[];
  additionalData: AdditionalData[];

  // Vehicle-Specific Submodel (Automotive Extension)
  performance: Performance;
  emissions: Emissions;
  stateOfHealth: StateOfHealth;
  serviceHistory: ServiceHistory;
  damageHistory: DamageHistory;
  ownershipChain: OwnershipChain;
  compliance: Compliance;

  // Asset / Participant VC
  credential: DPPCredential;
}

// --- Car (Digital Twin) ---

export interface Car {
  id: string;
  vin: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  imageUrl: string;
  status: "available" | "sold" | "reserved";
  ownerId?: string;

  // IDSA Asset Administration Shell
  aas: AssetAdministrationShell;

  // Catena-X Digital Product Passport
  dpp: DPP;
}

// ============================================================
// Credential Types
// ============================================================

export type CredentialType = "SelfVC" | "OwnershipVC" | "InsuranceVC" | "OrgVC" | "ManufacturerVC";

export interface VerifiableCredential {
  id: string;
  type: CredentialType;
  issuerId: string;
  issuerName: string;
  subjectId: string;
  issuedAt: string;
  expiresAt?: string;
  status: "active" | "revoked" | "expired";
  credentialSubject: Record<string, unknown>;
}

export interface SelfVCSubject {
  name: string;
  email: string;
  nationality: string;
  dateOfBirth: string;
  address: string;
  did: string;
}

export interface OwnershipVCSubject {
  ownerName: string;
  ownerDid: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  purchaseDate: string;
  purchasePrice: number;
  dealerName: string;
}

export interface InsuranceVCSubject {
  policyNumber: string;
  insuredName: string;
  insuredDid: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  policyType: string;
  coverageAmount: number;
  annualPremium: number;
  startDate: string;
  endDate: string;
  insurer: string;
}

export interface OrgVCSubject {
  companyName: string;
  companyDid: string;
  registrationNumber: string;
  vatId?: string;
  eoriNumber?: string;
  cin?: string;
  gstNumber?: string;
  country: string;
  city: string;
  address: string;
  adminName: string;
  adminEmail: string;
  incorporationDate: string;
}

// ============================================================
// Consent Types
// ============================================================

export interface ConsentRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  userId: string;
  vin: string;
  purpose: string;
  dataRequested: string[];
  dataExcluded: string[];
  status: "pending" | "approved" | "denied";
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
}

// ============================================================
// Insurance Types
// ============================================================

export interface PremiumBreakdown {
  basePremium: number;
  damageAdjustment: number;
  ageAdjustment: number;
  conditionAdjustment: number;
  batteryHealthAdjustment: number;
  total: number;
}

export interface InsurancePolicy {
  id: string;
  policyNumber: string;
  userId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  startDate: string;
  endDate: string;
  coverageType: string;
  coverageAmount: number;
  annualPremium: number;
  premiumBreakdown: PremiumBreakdown;
  status: "active" | "pending" | "expired";
  credentialId?: string;
  createdAt: string;
}

// ============================================================
// Company Types
// ============================================================

export interface Company {
  id: string;
  name: string;
  vatId?: string;
  eoriNumber?: string;
  cin?: string;
  gstNumber?: string;
  country: string;
  city: string;
  address: string;
  adminName: string;
  adminEmail: string;
  did: string;
  registeredAt: string;
  credentialId?: string;
}

// ============================================================
// Wallet Types
// ============================================================

export interface Wallet {
  userId: string;
  credentialIds: string[];
}

// ============================================================
// Purchase Types
// ============================================================

export interface Purchase {
  id: string;
  userId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  price: number;
  purchaseDate: string;
  dealerName: string;
  credentialId?: string;
}

// ============================================================
// Catena-X Semantic ID Constants
// ============================================================

export const CX_SEMANTIC_IDS = {
  DIGITAL_PRODUCT_PASSPORT: "urn:samm:io.catenax.generic.digital_product_passport:6.0.0#DigitalProductPassport",
  VEHICLE_PRODUCT_PASSPORT: "urn:samm:io.catenax.vehicle.vehicle_product_passport:1.0.0#VehicleProductPassport",
  SERIAL_PART: "urn:bamm:io.catenax.serial_part:1.0.1#SerialPart",
  BATTERY_PASS: "urn:bamm:io.catenax.battery.battery_pass:3.0.1#BatteryPass",
  SINGLE_LEVEL_BOM: "urn:bamm:io.catenax.single_level_bom_as_built:1.0.0#SingleLevelBomAsBuilt",
} as const;

export const AAS_INTERFACE = "SUBMODEL-3.0" as const;
