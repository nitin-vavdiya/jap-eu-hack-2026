import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

const REGISTRY_BASE = process.env.APP_BASE_URL || 'http://localhost:8000';

// --------------- helpers ---------------

function buildCarId(vin: string): string {
  return `${REGISTRY_BASE}/api/vehicle-registry/vehicles/${vin}`;
}

function buildResolutionDocument(car: any, orgCred: any) {
  const vin = car.vin;
  const carId = buildCarId(vin);
  const isSold = !!car.ownerId;

  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/catenax/vehicle/v1',
    ],
    carId,
    vin,
    status: car.status,
    manufacturer: {
      id: car.manufacturerCompanyId || null,
      name: car.manufacturerCompany?.name || car.make,
      did: car.manufacturerCompany?.did || null,
      registryEndpoint: `${REGISTRY_BASE}/api/vehicle-registry`,
      verificationStatus: orgCred?.verificationStatus || 'unverified',
      orgCredentialId: orgCred?.id || null,
    },
    vehicle: {
      make: car.make,
      model: car.model,
      year: car.year,
      variant: car.variant,
      fuelType: car.fuelType,
    },
    ownership: {
      isSold,
      ownerWallet: isSold ? `did:smartsense:${car.ownerId}` : null,
    },
    dppReference: {
      semanticId: 'urn:samm:io.catenax.generic.digital_product_passport:6.0.0#DigitalProductPassport',
      endpoint: `${carId}/dpp`,
      accessLevel: 'consent_required',
    },
    vcReference: {
      ownershipVC: isSold ? `${carId}/credentials` : null,
      manufacturerVC: car.manufacturerCredentialId,
      accessLevel: isSold ? 'consent_required' : 'not_applicable',
    },
    serviceEndpoints: {
      resolve: carId,
      publicSummary: `${carId}/public-summary`,
      policies: `${carId}/policies`,
      consentRequest: `${REGISTRY_BASE}/api/consent/request`,
      dpp: `${carId}/dpp`,
      credentials: `${carId}/credentials`,
      insuranceView: `${carId}/insurance-view`,
      ownershipProof: `${carId}/ownership-proof`,
      verificationStatus: `${carId}/verification-status`,
      auditLog: `${carId}/audit-log`,
    },
    supportedDataCategories: [
      { category: 'Vehicle Identity', accessLevel: 'public' },
      { category: 'Manufacturing Info', accessLevel: 'public' },
      { category: 'Sustainability Summary', accessLevel: 'public' },
      { category: 'Full DPP', accessLevel: 'consent_required' },
      { category: 'State of Health', accessLevel: 'consent_required' },
      { category: 'Damage History', accessLevel: 'consent_required' },
      { category: 'Service History', accessLevel: 'consent_required' },
      { category: 'Ownership Chain', accessLevel: 'consent_required' },
      { category: 'Insurance Data', accessLevel: 'insurer_allowed_with_consent' },
      { category: 'Technical Specs', accessLevel: 'consent_required' },
    ],
    termsAndPolicies: `${carId}/policies`,
    registeredAt: car.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildPublicSummary(car: any) {
  const dpp = car.dpp || {};
  return {
    carId: buildCarId(car.vin),
    vin: car.vin,
    make: car.make,
    model: car.model,
    year: car.year,
    variant: car.variant,
    fuelType: car.fuelType,
    transmission: car.transmission,
    color: car.color,
    status: car.status,
    manufacturer: {
      name: car.manufacturerCompany?.name || car.make,
      country: car.manufacturerCompany?.country || null,
      did: car.manufacturerCompany?.did || null,
    },
    sustainability: {
      energyType: car.fuelType === 'Electric' ? 'Battery Electric Vehicle (BEV)' : car.fuelType,
      ...(dpp.stateOfHealth?.batteryCapacity ? { batteryCapacity: dpp.stateOfHealth.batteryCapacity } : {}),
      ...(dpp.stateOfHealth?.range ? { range: dpp.stateOfHealth.range } : {}),
      manufacturingPlant: dpp.ownershipChain?.manufacturingPlant || 'N/A',
    },
    trustIndicators: {
      hasDPP: true,
      hasManufacturerVC: !!car.manufacturerCredentialId,
      isOwnershipTracked: !!car.ownerId,
      manufacturerVerified: true,
    },
    protectedDataAvailable: [
      'Full Digital Product Passport',
      'Detailed State of Health',
      'Damage History',
      'Service History',
      'Ownership Chain',
    ],
    accessInstructions: 'To access protected data, create an access request via the consent endpoint. The vehicle owner must approve in their SmartSense Wallet.',
  };
}

function buildPolicies(car: any) {
  const isSold = !!car.ownerId;
  return {
    carId: buildCarId(car.vin),
    vin: car.vin,
    policyVersion: '1.0',
    dataCategories: [
      {
        category: 'Vehicle Identity',
        fields: ['make', 'model', 'year', 'variant', 'vin', 'fuelType', 'color'],
        accessLevel: 'public',
        description: 'Basic vehicle identification — always publicly visible.',
      },
      {
        category: 'Manufacturing Info',
        fields: ['manufacturer', 'manufacturingDate', 'manufacturingPlant'],
        accessLevel: 'public',
        description: 'Manufacturer and production details — publicly available.',
      },
      {
        category: 'Sustainability Summary',
        fields: ['energyType', 'batteryCapacity', 'range'],
        accessLevel: 'public',
        description: 'Environmental and sustainability indicators — public.',
      },
      {
        category: 'Full DPP',
        fields: ['stateOfHealth', 'damageHistory', 'serviceHistory', 'ownershipChain', 'compliance'],
        accessLevel: 'consent_required',
        description: 'Complete Digital Product Passport — requires owner consent.',
        requiresOwnerConsent: isSold,
      },
      {
        category: 'State of Health',
        fields: ['overallRating', 'batteryHealth', 'engineHealth', 'conditionScores'],
        accessLevel: 'consent_required',
        description: 'Vehicle condition and health metrics — requires owner consent.',
      },
      {
        category: 'Damage History',
        fields: ['incidents', 'repairs', 'totalIncidents'],
        accessLevel: 'consent_required',
        description: 'Accident and damage records — requires owner consent.',
      },
      {
        category: 'Service History',
        fields: ['services', 'mileage', 'lastServiceDate'],
        accessLevel: 'consent_required',
        description: 'Service and maintenance records — requires owner consent.',
      },
      {
        category: 'Ownership Chain',
        fields: ['currentOwner', 'previousOwners', 'purchaseHistory'],
        accessLevel: 'consent_required',
        description: 'Ownership provenance chain — requires owner consent.',
      },
      {
        category: 'Insurance Data',
        fields: ['stateOfHealth', 'damageHistory', 'serviceHistory', 'ownershipChain'],
        accessLevel: 'insurer_allowed_with_consent',
        description: 'Insurance-relevant data bundle — requires owner consent + insurer verification.',
      },
      {
        category: 'Linked Credentials',
        fields: ['ownershipVC', 'insuranceVC', 'manufacturerVC'],
        accessLevel: 'consent_required',
        description: 'Verifiable Credentials linked to this vehicle — requires owner consent.',
      },
    ],
    consentEndpoint: `${REGISTRY_BASE}/api/consent/request`,
    consentExpiryHours: 24,
    accessSessionDurationMinutes: 60,
  };
}

async function logAudit(vin: string, action: string, actor: string, details?: Record<string, unknown>) {
  const event = {
    id: uuidv4(),
    vin,
    action,
    actor,
    timestamp: new Date(),
    details: (details || {}) as any,
  };
  await prisma.vehicleAuditLog.create({ data: event });
  return event;
}

async function checkAccessGrant(vin: string, requesterId: string): Promise<boolean> {
  const grant = await prisma.accessSession.findFirst({
    where: {
      vin,
      requesterId,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
  });
  return !!grant;
}

// --------------- PUBLIC DISCOVERY ---------------

// Well-known vehicle registry endpoint
router.get('/well-known', async (_req, res) => {
  const cars = await prisma.car.findMany();
  res.json({
    '@context': 'https://w3id.org/catenax/vehicle-registry/v1',
    registryId: 'vehicle-registry',
    totalVehicles: cars.length,
    registeredVehicles: cars.map((c: any) => ({
      carId: buildCarId(c.vin),
      vin: c.vin,
      make: c.make,
      model: c.model,
      year: c.year,
      status: c.status,
    })),
    endpoints: {
      resolve: `${REGISTRY_BASE}/api/vehicle-registry/vehicles/{vin}`,
      publicSummary: `${REGISTRY_BASE}/api/vehicle-registry/vehicles/{vin}/public-summary`,
      policies: `${REGISTRY_BASE}/api/vehicle-registry/vehicles/{vin}/policies`,
    },
    supportedProtocols: ['https', 'did:web'],
    updatedAt: new Date().toISOString(),
  });
});

// List all vehicles in registry
router.get('/vehicles', async (_req, res) => {
  const cars = await prisma.car.findMany({ include: { manufacturerCompany: true } });
  res.json(cars.map((c: any) => ({
    carId: buildCarId(c.vin),
    vin: c.vin,
    make: c.make,
    model: c.model,
    year: c.year,
    variant: c.variant,
    fuelType: c.fuelType,
    status: c.status,
    isSold: !!c.ownerId,
    manufacturerVerified: !!c.manufacturerCompany,
  })));
});

// Resolve Car ID — the core resolution endpoint
router.get('/vehicles/:vin', async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin }, include: { manufacturerCompany: true } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found in registry' });

  const orgCred = car.manufacturerCompanyId
    ? await prisma.orgCredential.findFirst({ where: { companyId: car.manufacturerCompanyId } })
    : null;
  const doc = buildResolutionDocument(car, orgCred);

  await logAudit(car.vin, 'resolve', req.query.requester as string || 'anonymous');
  res.json(doc);
});

// Public summary — no auth needed
router.get('/vehicles/:vin/public-summary', async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin }, include: { manufacturerCompany: true } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found in registry' });

  await logAudit(car.vin, 'public_summary_viewed', req.query.requester as string || 'anonymous');
  res.json(buildPublicSummary(car));
});

// Policies — data access rules
router.get('/vehicles/:vin/policies', async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found in registry' });

  res.json(buildPolicies(car));
});

// Verification status
router.get('/vehicles/:vin/verification-status', async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin }, include: { manufacturerCompany: true } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found in registry' });

  const orgCred = car.manufacturerCompanyId
    ? await prisma.orgCredential.findFirst({ where: { companyId: car.manufacturerCompanyId } })
    : null;
  const manufacturerCred = car.manufacturerCredentialId
    ? await prisma.credential.findUnique({ where: { id: car.manufacturerCredentialId } })
    : null;

  const complianceResult = orgCred?.complianceResult as Record<string, any> | null;
  res.json({
    carId: buildCarId(car.vin),
    vin: car.vin,
    manufacturer: {
      name: car.manufacturerCompany?.name || car.make,
      orgCredentialStatus: orgCred?.verificationStatus || 'unverified',
      gaiaxCompliant: complianceResult?.status === 'compliant',
      credentialId: orgCred?.id,
    },
    vehicleCredentials: {
      manufacturerVC: manufacturerCred ? { id: manufacturerCred.id, status: manufacturerCred.status } : null,
      ownershipVC: car.ownerId ? 'issued' : 'not_applicable',
    },
    dppStatus: car.dpp ? 'available' : 'not_available',
  });
});

// Audit log
router.get('/vehicles/:vin/audit-log', async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found in registry' });

  const logs = await prisma.vehicleAuditLog.findMany({
    where: { vin: req.params.vin },
    orderBy: { timestamp: 'desc' },
  });
  res.json(logs);
});

// --------------- CONSENT-PROTECTED ENDPOINTS ---------------

// Middleware: check access grant for protected endpoints
async function requireAccessGrant(req: any, res: any, next: any) {
  const vin = req.params.vin;
  const requesterId = req.query.requesterId || req.headers['x-requester-id'];

  if (!requesterId) {
    return res.status(401).json({
      error: 'Access denied',
      message: 'Protected endpoint requires a valid access grant. Provide requesterId query param or x-requester-id header.',
      consentEndpoint: `${REGISTRY_BASE}/api/consent/request`,
    });
  }

  if (!(await checkAccessGrant(vin, requesterId))) {
    return res.status(403).json({
      error: 'No active access grant',
      message: 'You need an approved access grant to access this data. Request consent from the vehicle owner.',
      consentEndpoint: `${REGISTRY_BASE}/api/consent/request`,
      policiesEndpoint: `${REGISTRY_BASE}/api/vehicle-registry/vehicles/${vin}/policies`,
    });
  }

  await logAudit(vin, 'protected_data_accessed', requesterId, { endpoint: req.path });
  next();
}

// Full DPP — protected
router.get('/vehicles/:vin/dpp', requireAccessGrant, async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found' });

  res.json({
    carId: buildCarId(car.vin),
    vin: car.vin,
    dpp: car.dpp,
    accessedAt: new Date().toISOString(),
    source: 'manufacturer-authoritative',
  });
});

// Credentials — protected
router.get('/vehicles/:vin/credentials', requireAccessGrant, async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found' });

  const creds: any[] = [];

  // Manufacturer VC
  const mfgCred = car.manufacturerCredentialId
    ? await prisma.credential.findUnique({ where: { id: car.manufacturerCredentialId } })
    : null;
  if (mfgCred) creds.push({ ...mfgCred, role: 'manufacturer' });

  // Ownership VC
  if (car.ownerId) {
    const ownerCreds = await prisma.credential.findMany({ where: { type: 'OwnershipVC' } });
    const filtered = ownerCreds.filter((c: any) => c.credentialSubject?.vin === car.vin);
    filtered.forEach((c: any) => creds.push({ ...c, role: 'ownership' }));
  }

  // Insurance VC
  const insurancePolicies = await prisma.insurancePolicy.findMany({ where: { vin: car.vin } });
  for (const policy of insurancePolicies) {
    if (policy.credentialId) {
      const ic = await prisma.credential.findUnique({ where: { id: policy.credentialId } });
      if (ic) creds.push({ ...ic, role: 'insurance' });
    }
  }

  res.json({ carId: buildCarId(car.vin), credentials: creds });
});

// Insurance view — protected, optimized for insurers
router.get('/vehicles/:vin/insurance-view', requireAccessGrant, async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found' });

  const dpp = (car.dpp || {}) as Record<string, any>;
  res.json({
    carId: buildCarId(car.vin),
    vin: car.vin,
    make: car.make,
    model: car.model,
    year: car.year,
    variant: car.variant,
    fuelType: car.fuelType,
    mileage: car.mileage,
    stateOfHealth: dpp.stateOfHealth,
    damageHistory: dpp.damageHistory,
    serviceHistory: dpp.serviceHistory,
    ownershipChain: dpp.ownershipChain,
    source: 'manufacturer-authoritative',
    accessedAt: new Date().toISOString(),
  });
});

// Ownership proof — protected
router.get('/vehicles/:vin/ownership-proof', requireAccessGrant, async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found' });

  if (!car.ownerId) {
    return res.json({ carId: buildCarId(car.vin), owned: false });
  }

  const ownerCreds = await prisma.credential.findMany({ where: { type: 'OwnershipVC' } });
  const ownerCred = ownerCreds.find((c: any) => c.credentialSubject?.vin === car.vin);

  res.json({
    carId: buildCarId(car.vin),
    owned: true,
    ownerDid: `did:smartsense:${car.ownerId}`,
    ownershipCredential: ownerCred || null,
    verifiedAt: new Date().toISOString(),
  });
});

// --------------- ACCESS SESSION MANAGEMENT ---------------

// Create access session when consent is approved (called internally)
router.post('/access-sessions', authenticate, async (req, res) => {
  const { vin, requesterId, requesterName, consentId, durationMinutes } = req.body;

  const session = {
    id: uuidv4(),
    vin,
    requesterId,
    requesterName,
    consentId,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (durationMinutes || 60) * 60 * 1000).toISOString(),
  };

  await prisma.accessSession.create({ data: session });
  await logAudit(vin, 'access_session_created', requesterId, { sessionId: session.id, consentId });

  res.json(session);
});

// List active sessions for a vehicle
router.get('/vehicles/:vin/access-sessions', async (req, res) => {
  const sessions = await prisma.accessSession.findMany({ where: { vin: req.params.vin } });
  const mapped = sessions.map((s: any) => ({
    ...s,
    isExpired: new Date(s.expiresAt) < new Date(),
    status: new Date(s.expiresAt) < new Date() ? 'expired' : s.status,
  }));
  res.json(mapped);
});

// --------------- VP-VALIDATED ENDPOINTS ---------------
// These endpoints accept a Verifiable Presentation instead of access sessions.
// The manufacturer validates the VP before returning protected data.

import { parseVP, extractCredentials, validateVP } from '../services/vp-processor';

/**
 * POST /vehicles/:vin/insurance-data-vp
 * VP-validated endpoint for insurance data.
 * Tokio Marine calls this with the holder's VP.
 */
router.post('/vehicles/:vin/insurance-data-vp', async (req, res) => {
  const { vpToken, requestId, verifierDid } = req.body;
  const vin = req.params.vin;

  if (!vpToken) {
    return res.status(400).json({ error: 'vpToken is required' });
  }

  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found' });

  // Step 1: Parse VP
  let vp;
  try {
    vp = parseVP(vpToken);
  } catch (err: any) {
    await logAudit(vin, 'vp_validation_failed', verifierDid || 'unknown', { error: err.message, stage: 'parse' });
    return res.status(400).json({ error: 'Invalid VP format', details: err.message });
  }

  // Step 2: Extract and validate
  const credentials = extractCredentials(vp);
  const ownershipCred = credentials.find(c => c.type.includes('OwnershipVC'));

  if (!ownershipCred) {
    await logAudit(vin, 'vp_validation_failed', verifierDid || 'unknown', { error: 'No OwnershipVC in VP' });
    return res.status(403).json({ error: 'VP does not contain an OwnershipVC' });
  }

  // Step 3: Validate VP structure, nonce, holder-subject match
  const validation = validateVP(vp, {
    expectedCredentialTypes: ['OwnershipVC'],
    vehicleVin: vin,
    checkHolderSubjectMatch: true,
  });

  if (!validation.valid) {
    await logAudit(vin, 'vp_validation_failed', verifierDid || 'unknown', { errors: validation.errors });
    return res.status(403).json({
      error: 'VP validation failed',
      details: validation.errors,
      warnings: validation.warnings,
    });
  }

  // Step 4: Check that the credential's subject matches the car owner (if car has an owner)
  if (car.ownerId) {
    const credOwnerId = ownershipCred.subject.ownerId
      || (ownershipCred.subject.ownerDid as string)?.replace('did:smartsense:', '');
    if (credOwnerId && credOwnerId !== car.ownerId) {
      await logAudit(vin, 'vp_validation_failed', verifierDid || 'unknown', {
        error: 'Owner mismatch',
        credOwner: credOwnerId,
        carOwner: car.ownerId,
      });
      return res.status(403).json({
        error: 'Credential subject does not match vehicle owner',
      });
    }
  }

  // Step 5: VP is valid — return insurance data
  await logAudit(vin, 'vp_validated_insurance_data_shared', vp.holder, {
    requestId,
    verifierDid,
    credentialType: 'OwnershipVC',
    validationWarnings: validation.warnings,
  });

  const dpp = car.dpp || {};
  res.json({
    carId: buildCarId(car.vin),
    vin: car.vin,
    make: car.make,
    model: car.model,
    year: car.year,
    variant: car.variant,
    fuelType: car.fuelType,
    color: car.color,
    mileage: car.mileage,
    price: car.price,
    status: car.status,
    ownerId: car.ownerId,
    dpp,
    vpValidation: {
      valid: true,
      holder: vp.holder,
      credentialType: 'OwnershipVC',
      issuer: ownershipCred.issuer,
      warnings: validation.warnings,
    },
    source: 'manufacturer-authoritative',
    accessMethod: 'vp-presentation',
    accessedAt: new Date().toISOString(),
  });
});

/**
 * POST /vehicles/:vin/dpp-vp
 * VP-validated DPP endpoint
 */
router.post('/vehicles/:vin/dpp-vp', async (req, res) => {
  const { vpToken, verifierDid } = req.body;
  const vin = req.params.vin;

  if (!vpToken) return res.status(400).json({ error: 'vpToken is required' });

  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) return res.status(404).json({ error: 'Vehicle not found' });

  let vp;
  try {
    vp = parseVP(vpToken);
  } catch (err: any) {
    return res.status(400).json({ error: 'Invalid VP', details: err.message });
  }

  const validation = validateVP(vp, {
    expectedCredentialTypes: ['OwnershipVC'],
    vehicleVin: vin,
  });

  if (!validation.valid) {
    return res.status(403).json({ error: 'VP validation failed', details: validation.errors });
  }

  await logAudit(vin, 'vp_validated_dpp_shared', vp.holder, { verifierDid });

  res.json({
    carId: buildCarId(car.vin),
    vin: car.vin,
    dpp: car.dpp,
    source: 'manufacturer-authoritative',
    accessMethod: 'vp-presentation',
    accessedAt: new Date().toISOString(),
  });
});

/**
 * POST /verify-vp
 * General VP verification endpoint
 */
router.post('/verify-vp', (req, res) => {
  const { vpToken, expectedCredentialTypes, vehicleVin, challenge } = req.body;

  if (!vpToken) return res.status(400).json({ error: 'vpToken is required' });

  try {
    const vp = parseVP(vpToken);
    const validation = validateVP(vp, {
      expectedCredentialTypes,
      vehicleVin,
      expectedChallenge: challenge,
    });
    res.json(validation);
  } catch (err: any) {
    res.status(400).json({ valid: false, errors: [err.message], warnings: [], holder: '', credentials: [] });
  }
});

export default router;
