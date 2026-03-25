import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';
import { getVCBaseUrl } from '../services/gaiax/vc-builder';

const router = Router();

router.get('/', async (req, res) => {
  const purchases = await prisma.purchase.findMany();
  res.json(purchases);
});

router.post('/', requireRole('customer'), async (req, res) => {
  const userId = req.user?.preferred_username || req.body.userId;
  const { vin, userInfo } = req.body;

  const car = await prisma.car.findUnique({
    where: { vin },
    include: { manufacturerCompany: true },
  });
  if (!car) return res.status(404).json({ error: 'Car not found' });
  if (car.status === 'sold') return res.status(400).json({ error: 'Car already sold' });

  const credentialId = uuidv4();
  const purchaseId = uuidv4();
  const purchaseDate = new Date();
  const ownerName = userInfo?.name || [req.user?.given_name, req.user?.family_name].filter(Boolean).join(' ') || 'Mario Sanchez';

  // Resolve issuer from the car's manufacturer company and their OrgCredential
  const baseUrl = getVCBaseUrl();
  const mfgCompany = car.manufacturerCompany;
  const mfgOrgCred = mfgCompany
    ? await prisma.orgCredential.findFirst({ where: { companyId: mfgCompany.id } })
    : null;

  const issuerName = mfgOrgCred?.legalName ?? mfgCompany?.name ?? car.make;
  const issuerDid = mfgOrgCred?.did ?? mfgCompany?.did ?? `did:web:${car.make.toLowerCase().replace(/\s+/g, '-')}`;
  const issuerCredentialUrl = mfgOrgCred
    ? `${baseUrl}/api/org-credentials/${mfgOrgCred.id}`
    : `${baseUrl}/api/org-credentials/make-${car.make.toLowerCase()}`;

  const credentialSubject = {
    ownerName,
    ownerDid: `did:smartsense:${userId}`,
    vin,
    make: car.make,
    model: car.model,
    year: car.year,
    purchaseDate: purchaseDate.toISOString(),
    purchasePrice: car.price,
    dealerName: issuerName,
  };

  const credential = await prisma.credential.create({
    data: {
      id: credentialId,
      type: 'OwnershipVC',
      issuerId: issuerDid,
      issuerName,
      subjectId: userId,
      status: 'active',
      credentialSubject,
    },
  });

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OwnershipVC',
    issuerDid,
    subjectDid: `did:smartsense:${userId}`,
    credentialSubject,
  }).catch(() => {});

  // Update car status and owner
  const dpp = (car.dpp as any) || {};
  dpp.ownershipChain = dpp.ownershipChain || {};
  dpp.ownershipChain.currentOwner = {
    ownerName,
    ownerId: userId,
    purchaseDate: purchaseDate.toISOString(),
    purchasePrice: car.price,
    country: userInfo?.country || 'IT',
  };

  await prisma.car.update({
    where: { vin },
    data: {
      status: 'sold',
      ownerId: userId,
      dpp,
    },
  });

  // Add to wallet
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId } });
  }
  await prisma.walletCredential.upsert({
    where: { walletId_credentialId: { walletId: wallet.id, credentialId } },
    update: {},
    create: { walletId: wallet.id, credentialId },
  });

  const purchase = await prisma.purchase.create({
    data: {
      id: purchaseId,
      userId,
      vin,
      make: car.make,
      model: car.model,
      year: car.year,
      price: car.price,
      purchaseDate,
      dealerName: issuerName,
      credentialId,
    },
  });

  res.status(201).json({ purchase, credential });
});

export default router;
