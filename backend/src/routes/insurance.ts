import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';

const router = Router();

router.get('/', (req, res) => {
  const policies = db.get('insurance_policies').value();
  res.json(policies);
});

router.get('/:vin', (req, res) => {
  const policy = db.get('insurance_policies').find({ vin: req.params.vin }).value();
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  res.json(policy);
});

router.post('/', requireRole('insurance_agent'), async (req, res) => {
  const { userId, vin, coverageType, premiumBreakdown } = req.body;

  const car = db.get('cars').find({ vin }).value();
  if (!car) return res.status(404).json({ error: 'Car not found' });

  const targetUserId = userId || car.ownerId;

  // Create insurance VC
  const credentialId = uuidv4();
  const policyNumber = `DIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const startDate = new Date().toISOString();
  const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const credential = {
    id: credentialId,
    type: 'InsuranceVC',
    issuerId: 'digit-insurance',
    issuerName: 'Digit Insurance',
    subjectId: targetUserId,
    issuedAt: new Date().toISOString(),
    expiresAt: endDate,
    status: 'active',
    credentialSubject: {
      policyNumber,
      insuredName: car.dpp?.ownershipChain?.currentOwner?.ownerName || 'Mario Sanchez',
      insuredDid: `did:smartsense:${targetUserId}`,
      vin,
      make: car.make,
      model: car.model,
      year: car.year,
      policyType: coverageType || 'Comprehensive',
      coverageAmount: 50000,
      annualPremium: premiumBreakdown?.total || 1200,
      startDate,
      endDate,
      insurer: 'Digit Insurance'
    }
  };

  db.get('credentials').push(credential).write();

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'InsuranceVC',
    issuerDid: 'did:web:digit-insurance',
    subjectDid: `did:smartsense:${targetUserId}`,
    credentialSubject: credential.credentialSubject,
  }).catch(() => {});

  // Add to wallet
  const wallet = db.get('wallet').get(targetUserId).value();
  if (wallet) {
    db.get('wallet').get(targetUserId).get('credentialIds').push(credentialId).write();
  } else {
    db.get('wallet').set(targetUserId, { credentialIds: [credentialId] }).write();
  }

  const policy = {
    id: uuidv4(),
    policyNumber,
    userId: targetUserId,
    vin,
    make: car.make,
    model: car.model,
    year: car.year,
    startDate,
    endDate,
    coverageType: coverageType || 'Comprehensive',
    coverageAmount: 50000,
    annualPremium: premiumBreakdown?.total || 1200,
    premiumBreakdown,
    status: 'active',
    credentialId,
    createdAt: new Date().toISOString()
  };

  db.get('insurance_policies').push(policy).write();
  res.status(201).json({ policy, credential });
});

export default router;
