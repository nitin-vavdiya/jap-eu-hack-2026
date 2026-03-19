import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';
import { getVCBaseUrl } from '../services/gaiax/vc-builder';

const router = Router();

router.get('/', async (req, res) => {
  const policies = await prisma.insurancePolicy.findMany();
  res.json(policies);
});

router.get('/:vin', async (req, res) => {
  const policy = await prisma.insurancePolicy.findFirst({ where: { vin: req.params.vin } });
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  res.json(policy);
});

router.post('/', requireRole('insurance_agent'), async (req, res) => {
  const { userId, vin, coverageType, premiumBreakdown } = req.body;

  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) return res.status(404).json({ error: 'Car not found' });

  const targetUserId = userId || car.ownerId;
  const dpp = car.dpp as any;

  // Create insurance VC
  const credentialId = uuidv4();
  const policyNumber = `DIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const startDate = new Date();
  const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // issuer links to the insurance company's resolvable Legal Participant VC
  const baseUrl = getVCBaseUrl();
  const insurerCredentialUrl = `${baseUrl}/vc/org-cred-digit-001`;

  const credentialSubject = {
    policyNumber,
    insuredName: dpp?.ownershipChain?.currentOwner?.ownerName || 'Mario Sanchez',
    insuredDid: `did:smartsense:${targetUserId}`,
    vin,
    make: car.make,
    model: car.model,
    year: car.year,
    policyType: coverageType || 'Comprehensive',
    coverageAmount: 50000,
    annualPremium: premiumBreakdown?.total || 1200,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    insurer: 'Digit Insurance',
  };

  const credential = await prisma.credential.create({
    data: {
      id: credentialId,
      type: 'InsuranceVC',
      issuerId: insurerCredentialUrl,
      issuerName: 'Digit Insurance',
      subjectId: targetUserId,
      expiresAt: endDate,
      status: 'active',
      credentialSubject,
    },
  });

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'InsuranceVC',
    issuerDid: 'did:web:digit-insurance',
    subjectDid: `did:smartsense:${targetUserId}`,
    credentialSubject,
  }).catch(() => {});

  // Add to wallet
  let wallet = await prisma.wallet.findUnique({ where: { userId: targetUserId! } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId: targetUserId! } });
  }
  await prisma.walletCredential.upsert({
    where: { walletId_credentialId: { walletId: wallet.id, credentialId } },
    update: {},
    create: { walletId: wallet.id, credentialId },
  });

  const policy = await prisma.insurancePolicy.create({
    data: {
      id: uuidv4(),
      policyNumber,
      userId: targetUserId!,
      vin,
      make: car.make,
      model: car.model,
      year: car.year,
      startDate,
      endDate,
      coverageType: coverageType || 'Comprehensive',
      coverageAmount: 50000,
      annualPremium: premiumBreakdown?.total || 1200,
      premiumBreakdown: premiumBreakdown || undefined,
      status: 'active',
      credentialId,
    },
  });

  res.status(201).json({ policy, credential });
});

export default router;
