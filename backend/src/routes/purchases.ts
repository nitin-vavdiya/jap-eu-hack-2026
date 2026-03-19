import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';

const router = Router();

router.get('/', (req, res) => {
  const purchases = db.get('purchases').value();
  res.json(purchases);
});

router.post('/', requireRole('customer'), async (req, res) => {
  const userId = req.user?.preferred_username || req.body.userId;
  const { vin, userInfo } = req.body;

  const car = db.get('cars').find({ vin }).value();
  if (!car) return res.status(404).json({ error: 'Car not found' });
  if (car.status === 'sold') return res.status(400).json({ error: 'Car already sold' });

  const credentialId = uuidv4();
  const purchaseId = uuidv4();
  const purchaseDate = new Date().toISOString();
  const ownerName = userInfo?.name || [req.user?.given_name, req.user?.family_name].filter(Boolean).join(' ') || 'Mario Sanchez';

  // Create Ownership VC
  const credential = {
    id: credentialId,
    type: 'OwnershipVC',
    issuerId: 'tata-motors',
    issuerName: 'TATA Motors',
    subjectId: userId,
    issuedAt: purchaseDate,
    status: 'active',
    credentialSubject: {
      ownerName,
      ownerDid: `did:smartsense:${userId}`,
      vin,
      make: car.make,
      model: car.model,
      year: car.year,
      purchaseDate,
      purchasePrice: car.price,
      dealerName: 'TATA Motors Official'
    }
  };

  db.get('credentials').push(credential).write();

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OwnershipVC',
    issuerDid: 'did:web:tata-motors',
    subjectDid: `did:smartsense:${userId}`,
    credentialSubject: credential.credentialSubject,
  }).catch(() => {});

  // Update car status and owner
  db.get('cars').find({ vin }).assign({
    status: 'sold',
    ownerId: userId,
    'dpp.ownershipChain.currentOwner': {
      ownerName,
      ownerId: userId,
      purchaseDate,
      purchasePrice: car.price,
      country: userInfo?.country || 'IT'
    }
  }).write();

  // Add to wallet
  const wallet = db.get('wallet').get(userId).value();
  if (wallet) {
    db.get('wallet').get(userId).get('credentialIds').push(credentialId).write();
  } else {
    db.get('wallet').set(userId, { credentialIds: [credentialId] }).write();
  }

  const purchase = {
    id: purchaseId,
    userId,
    vin,
    make: car.make,
    model: car.model,
    year: car.year,
    price: car.price,
    purchaseDate,
    dealerName: 'TATA Motors Official',
    credentialId
  };

  db.get('purchases').push(purchase).write();
  res.status(201).json({ purchase, credential });
});

export default router;
