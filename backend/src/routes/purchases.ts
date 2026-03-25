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

  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) return res.status(404).json({ error: 'Car not found' });
  if (car.status === 'sold') return res.status(400).json({ error: 'Car already sold' });

  const credentialId = uuidv4();
  const purchaseId = uuidv4();
  const purchaseDate = new Date();
  const ownerName = userInfo?.name || [req.user?.given_name, req.user?.family_name].filter(Boolean).join(' ') || 'Mario Sanchez';

  // Create Ownership VC — issuer links to the seller's resolvable Legal Participant VC
  const baseUrl = getVCBaseUrl();
  const issuerCredentialUrl = `${baseUrl}/vc/org-cred-tata-001`;

  const credentialSubject = {
    ownerName,
    ownerDid: `did:smartsense:${userId}`,
    vin,
    make: car.make,
    model: car.model,
    year: car.year,
    purchaseDate: purchaseDate.toISOString(),
    purchasePrice: car.price,
    dealerName: 'Toyota Official',
  };

  const credential = await prisma.credential.create({
    data: {
      id: credentialId,
      type: 'OwnershipVC',
      issuerId: issuerCredentialUrl,
      issuerName: 'Toyota',
      subjectId: userId,
      status: 'active',
      credentialSubject,
    },
  });

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OwnershipVC',
    issuerDid: 'did:web:toyota-motors',
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
      dealerName: 'Toyota Official',
      credentialId,
    },
  });

  res.status(201).json({ purchase, credential });
});

export default router;
