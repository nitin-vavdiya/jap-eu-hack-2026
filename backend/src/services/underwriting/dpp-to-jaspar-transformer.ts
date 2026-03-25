/**
 * DPP → JASPAR Transformer
 *
 * Converts the Vehicle Digital Product Passport (DPP) format received
 * via EDC data exchange into the Tokio Marine JASPAR-like underwriting
 * dataset schema expected by the insurance scoring engine.
 */

export interface JasparVehicleProfile {
  vin: string;
  make: string;
  model: string;
  variant?: string;
  modelYear: number;
  vehicleAgeYears: number;
  propulsionType: 'BEV' | 'ICE' | 'HEV' | 'PHEV' | 'FCEV' | 'OTHER';
  bodyType?: string;
  color?: string;
  totalKmDriven: number;
}

export interface JasparTechnicalCondition {
  overallConditionScore: number;
  batteryStateOfHealthPct?: number;
  batteryCapacityKwh?: number;
  estimatedRangeKm?: number;
  engineConditionScore?: number;
  lastInspectionDate?: string;
  inspectedBy?: string;
  exteriorCondition?: number;
  interiorCondition?: number;
  mechanicalCondition?: number;
}

export interface JasparRiskIndicators {
  totalDamageIncidents: number;
  majorDamageCount: number;
  minorDamageCount: number;
  hasUnrepairedDamage: boolean;
  totalServiceRecords: number;
  lastServiceDate?: string;
  serviceComplianceIndicator: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' | 'UNKNOWN';
}

export interface JasparRegulatoryCompliance {
  euTypeApprovalNumber?: string;
  hasTypeApproval: boolean;
  emissionsStandard?: string;
  roadworthyCertExpiry?: string;
  roadworthyCertValid: boolean;
  ncapSafetyRating?: number;
  homologationStatus?: string;
  emissionsTestDate?: string;
}

export interface JasparSustainabilityMetrics {
  co2EmissionsGPerKm: number;
  energyEfficiencyLabel?: string;
  recyclabilityPct?: number;
  recycledMaterialPct?: number;
  carbonFootprintKgCo2e?: number;
  durabilityScore?: number;
  repairabilityScore?: number;
}

export interface JasparOwnershipProvenance {
  currentOwnerCount: number;
  hasManufacturerCredential: boolean;
  manufacturerCredentialStatus?: string;
  manufacturerVerified: boolean;
  dataProvenance: 'MANUFACTURER_AUTHORITATIVE' | 'THIRD_PARTY' | 'SELF_REPORTED' | 'UNKNOWN';
  dataReceivedVia: 'EDC' | 'API' | 'MANUAL';
  legalParticipantId?: string;
}

export interface JasparDataQuality {
  fieldsExpected: number;
  fieldsPresent: number;
  completenessPercent: number;
  unmappedFields: string[];
  warnings: string[];
}

export interface JasparInsuranceDataset {
  jasparVersion: string;
  assessmentDate: string;
  sourceProfile: string;
  targetProfile: string;
  vehicleProfile: JasparVehicleProfile;
  technicalCondition: JasparTechnicalCondition;
  riskIndicators: JasparRiskIndicators;
  regulatoryCompliance: JasparRegulatoryCompliance;
  sustainabilityMetrics: JasparSustainabilityMetrics;
  ownershipAndProvenance: JasparOwnershipProvenance;
  dataQuality: JasparDataQuality;
}

export interface MappingDetail {
  sourcePath: string;
  sourceValue: unknown;
  targetPath: string;
  targetValue: unknown;
  transformType: 'direct' | 'rename' | 'derived' | 'normalized' | 'default' | 'inferred';
}

export interface TransformationReport {
  sourceProfile: string;
  targetProfile: string;
  transformedAt: string;
  fieldsExpected: number;
  fieldsPresent: number;
  completenessPercent: number;
  unmappedSourceFields: string[];
  warnings: string[];
  mappingDetails: MappingDetail[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function inferPropulsionType(dpp: Record<string, unknown>): JasparVehicleProfile['propulsionType'] {
  const perf = dpp.performance as Record<string, unknown> | undefined;
  const motorType = String(perf?.motorType || '').toUpperCase();
  if (motorType === 'BEV') return 'BEV';
  if (motorType === 'HEV') return 'HEV';
  if (motorType === 'PHEV') return 'PHEV';
  if (motorType === 'FCEV') return 'FCEV';
  if (motorType === 'ICE') return 'ICE';
  // Fallback: check emissions
  const emissions = dpp.emissions as Record<string, unknown> | undefined;
  if (toNum(emissions?.co2GPerKm) === 0) return 'BEV';
  return 'ICE';
}

function isRoadworthyValid(expiryStr?: string): boolean {
  if (!expiryStr) return false;
  try {
    return new Date(expiryStr) > new Date();
  } catch {
    return false;
  }
}

function inferServiceCompliance(
  totalServiceRecords: number,
  vehicleAgeYears: number,
): JasparRiskIndicators['serviceComplianceIndicator'] {
  if (vehicleAgeYears <= 1 && totalServiceRecords === 0) return 'COMPLIANT'; // new car
  if (totalServiceRecords === 0 && vehicleAgeYears > 1) return 'NON_COMPLIANT';
  const expectedServices = Math.floor(vehicleAgeYears);
  if (totalServiceRecords >= expectedServices) return 'COMPLIANT';
  if (totalServiceRecords >= Math.floor(expectedServices * 0.5)) return 'PARTIAL';
  return 'NON_COMPLIANT';
}

// ─── 24 expected JASPAR fields for completeness scoring ───────────────────────

const EXPECTED_FIELDS = [
  'vehicleProfile.vin', 'vehicleProfile.make', 'vehicleProfile.model', 'vehicleProfile.modelYear',
  'vehicleProfile.vehicleAgeYears', 'vehicleProfile.propulsionType', 'vehicleProfile.totalKmDriven',
  'technicalCondition.overallConditionScore', 'technicalCondition.lastInspectionDate',
  'riskIndicators.totalDamageIncidents', 'riskIndicators.totalServiceRecords',
  'riskIndicators.hasUnrepairedDamage', 'riskIndicators.serviceComplianceIndicator',
  'regulatoryCompliance.hasTypeApproval', 'regulatoryCompliance.roadworthyCertValid',
  'regulatoryCompliance.emissionsStandard', 'regulatoryCompliance.ncapSafetyRating',
  'regulatoryCompliance.homologationStatus',
  'sustainabilityMetrics.co2EmissionsGPerKm', 'sustainabilityMetrics.energyEfficiencyLabel',
  'sustainabilityMetrics.recyclabilityPct',
  'ownershipAndProvenance.hasManufacturerCredential',
  'ownershipAndProvenance.manufacturerVerified', 'ownershipAndProvenance.dataProvenance',
  'ownershipAndProvenance.dataReceivedVia',
];

// ─── main transform function ───────────────────────────────────────────────────

export function transformDppToJaspar(
  car: Record<string, unknown>,
  dataReceivedVia: JasparOwnershipProvenance['dataReceivedVia'] = 'EDC',
): { jaspar: JasparInsuranceDataset; report: TransformationReport } {
  const dpp = (car.dpp ?? {}) as Record<string, unknown>;
  const stateOfHealth = (dpp.stateOfHealth ?? {}) as Record<string, unknown>;
  const damageHistory = (dpp.damageHistory ?? {}) as Record<string, unknown>;
  const serviceHistory = (dpp.serviceHistory ?? {}) as Record<string, unknown>;
  const performance = (dpp.performance ?? {}) as Record<string, unknown>;
  const emissions = (dpp.emissions ?? {}) as Record<string, unknown>;
  const compliance = (dpp.compliance ?? {}) as Record<string, unknown>;
  const sustainability = (dpp.sustainability ?? {}) as Record<string, unknown>;
  const materials = (dpp.materials ?? {}) as Record<string, unknown>;
  const mfgCred = (dpp.manufacturerCredential ?? {}) as Record<string, unknown>;
  const ownershipChain = (dpp.ownershipChain ?? {}) as Record<string, unknown>;

  const modelYear = toNum(car.year);
  const currentYear = new Date().getFullYear();
  const vehicleAgeYears = Math.max(0, currentYear - modelYear);
  const propulsionType = inferPropulsionType(dpp);

  const warnings: string[] = [];
  const unmappedFields: string[] = [];

  // ── Vehicle Profile ─────────────────────────────────────────────────────────
  // Extract mileage from various possible DPP locations
  const services = (serviceHistory.services ?? []) as Record<string, unknown>[];
  const latestServiceMileage = services.length > 0 ? toNum(services[services.length - 1]?.mileage) : 0;
  const totalKmDriven = toNum(
    stateOfHealth.mileageKm ?? stateOfHealth.odometerKm ?? performance.totalKmDriven ?? latestServiceMileage,
    0,
  );

  const vehicleProfile: JasparVehicleProfile = {
    vin: String(car.vin || ''),
    make: String(car.make || ''),
    model: String(car.model || ''),
    variant: car.variant ? String(car.variant) : undefined,
    modelYear,
    vehicleAgeYears,
    propulsionType,
    bodyType: dpp.identification
      ? String((dpp.identification as Record<string, unknown>).bodyType || '')
      : undefined,
    color: car.color ? String(car.color) : undefined,
    totalKmDriven,
  };

  // ── Technical Condition ──────────────────────────────────────────────────────
  const overallConditionScore = toNum(
    stateOfHealth.overallRating ?? stateOfHealth.overallConditionScore,
    7.5,
  );

  const batteryHealthRaw = toNum(
    stateOfHealth.batteryHealthPercent ?? stateOfHealth.batteryHealth,
    -1,
  );
  const hasBattery = propulsionType === 'BEV' || propulsionType === 'HEV' || propulsionType === 'PHEV';

  if (hasBattery && batteryHealthRaw < 0) {
    warnings.push('Battery state-of-health not available — defaulting to overall condition score for scoring');
  }

  const technicalCondition: JasparTechnicalCondition = {
    overallConditionScore,
    ...(hasBattery && batteryHealthRaw >= 0 ? { batteryStateOfHealthPct: batteryHealthRaw } : {}),
    batteryCapacityKwh: toNum(stateOfHealth.batteryCapacity?.toString()?.replace(/[^\d.]/g, '') || performance.batteryCapacityKwh) || undefined,
    estimatedRangeKm: toNum(stateOfHealth.range?.toString()?.replace(/[^\d.]/g, '') || performance.rangeKm) || undefined,
    lastInspectionDate: String(stateOfHealth.lastInspectionDate || ''),
    inspectedBy: stateOfHealth.inspectedBy ? String(stateOfHealth.inspectedBy) : undefined,
    exteriorCondition: stateOfHealth.exteriorCondition ? toNum(stateOfHealth.exteriorCondition) : undefined,
    interiorCondition: stateOfHealth.interiorCondition ? toNum(stateOfHealth.interiorCondition) : undefined,
    mechanicalCondition: stateOfHealth.mechanicalCondition ? toNum(stateOfHealth.mechanicalCondition) : undefined,
  };

  // ── Risk Indicators ──────────────────────────────────────────────────────────
  const incidents = (damageHistory.incidents ?? []) as Record<string, unknown>[];
  const totalDamageIncidents = toNum(damageHistory.totalIncidents ?? incidents.length);
  const majorDamageCount = incidents.filter(i => String(i.severity).toLowerCase() === 'major').length;
  const minorDamageCount = incidents.filter(i => String(i.severity).toLowerCase() === 'minor').length;
  const hasUnrepairedDamage = incidents.some(i => i.repaired === false);
  const totalServiceRecords = toNum(serviceHistory.totalServiceRecords ?? (serviceHistory.services as unknown[])?.length ?? 0);
  const lastServiceDate = String(serviceHistory.lastServiceDate || serviceHistory.lastService || '') || undefined;

  const riskIndicators: JasparRiskIndicators = {
    totalDamageIncidents,
    majorDamageCount,
    minorDamageCount,
    hasUnrepairedDamage,
    totalServiceRecords,
    lastServiceDate,
    serviceComplianceIndicator: inferServiceCompliance(totalServiceRecords, vehicleAgeYears),
  };

  // ── Regulatory Compliance ────────────────────────────────────────────────────
  const euTypeApprovalNumber = String(compliance.euTypeApprovalNumber || '');
  const hasTypeApproval = euTypeApprovalNumber.length > 0;
  const roadworthyCertExpiry = String(compliance.roadworthyCertificateExpiry || '');

  if (!hasTypeApproval) warnings.push('EU Type Approval number not present — defaulting hasTypeApproval to false');
  if (!roadworthyCertExpiry) warnings.push('Roadworthy certificate expiry not provided');

  const regulatoryCompliance: JasparRegulatoryCompliance = {
    euTypeApprovalNumber: euTypeApprovalNumber || undefined,
    hasTypeApproval,
    emissionsStandard: String(emissions.euroStandard || (propulsionType === 'BEV' ? 'BEV/ZEV' : '')),
    roadworthyCertExpiry: roadworthyCertExpiry || undefined,
    roadworthyCertValid: isRoadworthyValid(roadworthyCertExpiry),
    ncapSafetyRating: compliance.safetyRatingNcap != null ? toNum(compliance.safetyRatingNcap) : undefined,
    homologationStatus: String(compliance.homologationStatus || 'Unknown'),
    emissionsTestDate: compliance.emissionsTestDate ? String(compliance.emissionsTestDate) : undefined,
  };

  // ── Sustainability Metrics ────────────────────────────────────────────────────
  const sustainabilityMetrics: JasparSustainabilityMetrics = {
    co2EmissionsGPerKm: toNum(emissions.co2GPerKm, propulsionType === 'BEV' ? 0 : -1),
    energyEfficiencyLabel: String(emissions.energyLabel || ''),
    recyclabilityPct: toNum(sustainability.recyclabilityPercent ?? materials.recyclabilityPercent) || undefined,
    recycledMaterialPct: toNum(materials.recycledMaterialPercent) || undefined,
    carbonFootprintKgCo2e: toNum(sustainability.carbonFootprint) || undefined,
    durabilityScore: toNum(sustainability.durabilityScore) || undefined,
    repairabilityScore: toNum(sustainability.repairabilityScore) || undefined,
  };

  // ── Ownership & Provenance ───────────────────────────────────────────────────
  const hasManufacturerCredential = Object.keys(mfgCred).length > 0;
  const manufacturerCredentialStatus = String(mfgCred.status || '');
  const currentOwner = ownershipChain.currentOwner as Record<string, unknown> | undefined;
  const previousOwners = (ownershipChain.previousOwners ?? []) as unknown[];

  const ownershipAndProvenance: JasparOwnershipProvenance = {
    currentOwnerCount: 1 + previousOwners.length,
    hasManufacturerCredential,
    manufacturerCredentialStatus: manufacturerCredentialStatus || undefined,
    manufacturerVerified: hasManufacturerCredential && manufacturerCredentialStatus === 'active',
    dataProvenance: hasManufacturerCredential ? 'MANUFACTURER_AUTHORITATIVE' : 'SELF_REPORTED',
    dataReceivedVia,
    legalParticipantId: mfgCred.legalParticipantId ? String(mfgCred.legalParticipantId) : undefined,
  };

  // ── Data Quality / Completeness ───────────────────────────────────────────────
  const presentFields = EXPECTED_FIELDS.filter(field => {
    const [section, key] = field.split('.');
    const sectionMap: Record<string, unknown> = {
      vehicleProfile, technicalCondition, riskIndicators,
      regulatoryCompliance, sustainabilityMetrics, ownershipAndProvenance,
    };
    const sec = sectionMap[section] as Record<string, unknown> | undefined;
    const val = sec?.[key];
    return val !== undefined && val !== null && val !== '' && val !== -1;
  });

  const completenessPercent = Math.round((presentFields.length / EXPECTED_FIELDS.length) * 100);
  const missingFields = EXPECTED_FIELDS.filter(f => !presentFields.includes(f));
  if (missingFields.length > 0) unmappedFields.push(...missingFields);

  const dataQuality: JasparDataQuality = {
    fieldsExpected: EXPECTED_FIELDS.length,
    fieldsPresent: presentFields.length,
    completenessPercent,
    unmappedFields,
    warnings,
  };

  const jaspar: JasparInsuranceDataset = {
    jasparVersion: '1.0',
    assessmentDate: new Date().toISOString(),
    sourceProfile: 'TOYOTA_DPP_v1',
    targetProfile: 'TOKIOMARINE_JASPAR_v1',
    vehicleProfile,
    technicalCondition,
    riskIndicators,
    regulatoryCompliance,
    sustainabilityMetrics,
    ownershipAndProvenance,
    dataQuality,
  };

  // ── Mapping Details (field-level traceability) ───────────────────────────────
  const mappingDetails: MappingDetail[] = [
    // Vehicle Profile
    { sourcePath: 'car.vin',   sourceValue: car.vin,   targetPath: 'vehicleProfile.vin',   targetValue: vehicleProfile.vin,   transformType: 'direct' },
    { sourcePath: 'car.make',  sourceValue: car.make,  targetPath: 'vehicleProfile.make',  targetValue: vehicleProfile.make,  transformType: 'direct' },
    { sourcePath: 'car.model', sourceValue: car.model, targetPath: 'vehicleProfile.model', targetValue: vehicleProfile.model, transformType: 'direct' },
    { sourcePath: 'car.year',  sourceValue: car.year,  targetPath: 'vehicleProfile.modelYear',     targetValue: vehicleProfile.modelYear,    transformType: 'rename' },
    { sourcePath: 'car.year',  sourceValue: car.year,  targetPath: 'vehicleProfile.vehicleAgeYears', targetValue: vehicleProfile.vehicleAgeYears, transformType: 'derived' },
    { sourcePath: 'dpp.performance.motorType', sourceValue: (performance as Record<string,unknown>)?.motorType, targetPath: 'vehicleProfile.propulsionType', targetValue: vehicleProfile.propulsionType, transformType: 'normalized' },
    { sourcePath: 'car.variant', sourceValue: car.variant, targetPath: 'vehicleProfile.variant', targetValue: vehicleProfile.variant, transformType: 'direct' },
    { sourcePath: 'dpp.stateOfHealth.mileageKm', sourceValue: stateOfHealth.mileageKm ?? latestServiceMileage, targetPath: 'vehicleProfile.totalKmDriven', targetValue: vehicleProfile.totalKmDriven, transformType: stateOfHealth.mileageKm ? 'rename' : 'derived' },
    // Technical Condition
    { sourcePath: 'dpp.stateOfHealth.overallRating', sourceValue: stateOfHealth.overallRating, targetPath: 'technicalCondition.overallConditionScore', targetValue: technicalCondition.overallConditionScore, transformType: 'rename' },
    { sourcePath: 'dpp.stateOfHealth.batteryHealthPercent', sourceValue: stateOfHealth.batteryHealthPercent, targetPath: 'technicalCondition.batteryStateOfHealthPct', targetValue: technicalCondition.batteryStateOfHealthPct, transformType: 'rename' },
    { sourcePath: 'dpp.stateOfHealth.batteryCapacity', sourceValue: stateOfHealth.batteryCapacity, targetPath: 'technicalCondition.batteryCapacityKwh', targetValue: technicalCondition.batteryCapacityKwh, transformType: 'rename' },
    { sourcePath: 'dpp.stateOfHealth.lastInspectionDate', sourceValue: stateOfHealth.lastInspectionDate, targetPath: 'technicalCondition.lastInspectionDate', targetValue: technicalCondition.lastInspectionDate, transformType: 'direct' },
    { sourcePath: 'dpp.stateOfHealth.exteriorCondition', sourceValue: stateOfHealth.exteriorCondition, targetPath: 'technicalCondition.exteriorCondition', targetValue: technicalCondition.exteriorCondition, transformType: 'direct' },
    { sourcePath: 'dpp.stateOfHealth.mechanicalCondition', sourceValue: stateOfHealth.mechanicalCondition, targetPath: 'technicalCondition.mechanicalCondition', targetValue: technicalCondition.mechanicalCondition, transformType: 'direct' },
    // Risk Indicators
    { sourcePath: 'dpp.damageHistory.totalIncidents', sourceValue: damageHistory.totalIncidents, targetPath: 'riskIndicators.totalDamageIncidents', targetValue: riskIndicators.totalDamageIncidents, transformType: 'rename' },
    { sourcePath: 'dpp.damageHistory.incidents[].severity', sourceValue: `${incidents.length} incidents`, targetPath: 'riskIndicators.majorDamageCount', targetValue: riskIndicators.majorDamageCount, transformType: 'derived' },
    { sourcePath: 'dpp.damageHistory.incidents[].repaired', sourceValue: hasUnrepairedDamage ? 'some unrepaired' : 'all repaired', targetPath: 'riskIndicators.hasUnrepairedDamage', targetValue: riskIndicators.hasUnrepairedDamage, transformType: 'derived' },
    { sourcePath: 'dpp.serviceHistory.totalServiceRecords', sourceValue: serviceHistory.totalServiceRecords, targetPath: 'riskIndicators.totalServiceRecords', targetValue: riskIndicators.totalServiceRecords, transformType: 'rename' },
    { sourcePath: '(vehicleAgeYears, totalServiceRecords)', sourceValue: `age=${vehicleAgeYears}y, services=${totalServiceRecords}`, targetPath: 'riskIndicators.serviceComplianceIndicator', targetValue: riskIndicators.serviceComplianceIndicator, transformType: 'derived' },
    // Regulatory Compliance
    { sourcePath: 'dpp.compliance.euTypeApprovalNumber', sourceValue: euTypeApprovalNumber || null, targetPath: 'regulatoryCompliance.hasTypeApproval', targetValue: regulatoryCompliance.hasTypeApproval, transformType: 'derived' },
    { sourcePath: 'dpp.compliance.safetyRatingNcap', sourceValue: compliance.safetyRatingNcap, targetPath: 'regulatoryCompliance.ncapSafetyRating', targetValue: regulatoryCompliance.ncapSafetyRating, transformType: 'rename' },
    { sourcePath: 'dpp.compliance.roadworthyCertificateExpiry', sourceValue: roadworthyCertExpiry || null, targetPath: 'regulatoryCompliance.roadworthyCertValid', targetValue: regulatoryCompliance.roadworthyCertValid, transformType: 'derived' },
    { sourcePath: 'dpp.emissions.euroStandard', sourceValue: emissions.euroStandard, targetPath: 'regulatoryCompliance.emissionsStandard', targetValue: regulatoryCompliance.emissionsStandard, transformType: propulsionType === 'BEV' ? 'inferred' : 'rename' },
    // Sustainability
    { sourcePath: 'dpp.emissions.co2GPerKm', sourceValue: emissions.co2GPerKm, targetPath: 'sustainabilityMetrics.co2EmissionsGPerKm', targetValue: sustainabilityMetrics.co2EmissionsGPerKm, transformType: propulsionType === 'BEV' ? 'inferred' : 'rename' },
    { sourcePath: 'dpp.sustainability.recyclabilityPercent', sourceValue: sustainability.recyclabilityPercent, targetPath: 'sustainabilityMetrics.recyclabilityPct', targetValue: sustainabilityMetrics.recyclabilityPct, transformType: 'rename' },
    // Ownership & Provenance
    { sourcePath: 'dpp.manufacturerCredential', sourceValue: hasManufacturerCredential ? `${Object.keys(mfgCred).length} fields` : null, targetPath: 'ownershipAndProvenance.hasManufacturerCredential', targetValue: ownershipAndProvenance.hasManufacturerCredential, transformType: 'derived' },
    { sourcePath: 'dpp.manufacturerCredential.status', sourceValue: manufacturerCredentialStatus || null, targetPath: 'ownershipAndProvenance.manufacturerVerified', targetValue: ownershipAndProvenance.manufacturerVerified, transformType: 'derived' },
    { sourcePath: 'dpp.ownershipChain.previousOwners', sourceValue: previousOwners.length, targetPath: 'ownershipAndProvenance.currentOwnerCount', targetValue: ownershipAndProvenance.currentOwnerCount, transformType: 'derived' },
    { sourcePath: '(dataReceivedVia)', sourceValue: dataReceivedVia, targetPath: 'ownershipAndProvenance.dataReceivedVia', targetValue: ownershipAndProvenance.dataReceivedVia, transformType: 'direct' },
    // Data Quality
    { sourcePath: '(presentFields / EXPECTED_FIELDS)', sourceValue: `${presentFields.length}/${EXPECTED_FIELDS.length}`, targetPath: 'dataQuality.completenessPercent', targetValue: completenessPercent, transformType: 'derived' },
  ];

  const report: TransformationReport = {
    sourceProfile: 'TOYOTA_DPP_v1',
    targetProfile: 'TOKIOMARINE_JASPAR_v1',
    transformedAt: jaspar.assessmentDate,
    fieldsExpected: EXPECTED_FIELDS.length,
    fieldsPresent: presentFields.length,
    completenessPercent,
    unmappedSourceFields: unmappedFields,
    warnings,
    mappingDetails,
  };

  return { jaspar, report };
}
