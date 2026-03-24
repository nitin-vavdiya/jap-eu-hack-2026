import { Router } from 'express';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { createAsset, createContractDefinition } from '../services/edcService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const ENABLE_EDC = process.env.ENABLE_EDC !== 'false';

router.get('/', async (req, res) => {
  const cars = await prisma.car.findMany();
  res.json(cars);
});

router.get('/:vin', async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Car not found' });

  // Backfill manufacturerCredential (or its legalParticipantId) from DB if missing
  const dpp = (car.dpp ?? {}) as Record<string, unknown>;
  const mfgCred = dpp.manufacturerCredential as Record<string, unknown> | undefined;
  if (!mfgCred?.legalParticipantId) {
    const company = await prisma.company.findFirst({
      where: { name: { contains: car.make, mode: 'insensitive' } },
    });
    if (company) {
      const orgCredential = await prisma.orgCredential.findFirst({
        where: { companyId: company.id },
      });
      const credential = await prisma.credential.findFirst({
        where: { companyId: company.id },
      });
      if (orgCredential) {
        dpp.manufacturerCredential = {
          ...mfgCred,  // preserve any fields already set by the frontend
          credentialId: credential?.id || orgCredential.id,
          legalParticipantId: orgCredential.id,
          issuer: credential?.issuerName || 'EU APAC Dataspace',
          issuerDid: company.did || undefined,
          holder: orgCredential.legalName,
          type: credential?.type || 'OrgVC',
          issuedAt: orgCredential.validFrom.toISOString(),
          status: orgCredential.verificationStatus === 'draft' ? 'active' : orgCredential.verificationStatus,
        };
        // Persist the backfill so it's only computed once
        await prisma.car.update({
          where: { vin: car.vin },
          data: { dpp: dpp as any },
        });
      }
    }
  }

  res.json({ ...car, dpp });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const car = { id: uuidv4(), ...req.body };
  const vin = car.vin;

  if (ENABLE_EDC) {
    try {
      const edcConfig = {
        baseUrl: process.env.EDC_BASE_URL || '',
        apiKey:  process.env.EDC_API_KEY  || '',
      };
      const assetResponse = await createAsset(vin, edcConfig);
      const assetId = assetResponse['@id'];
      await createContractDefinition(assetId, edcConfig);
    } catch (err: any) {
      return res.status(502).json({
        error: 'Failed to register car in EDC. Car not created.',
        details: err.message,
      });
    }
  }

  // Auto-attach manufacturer credential from DB (ensures legalParticipantId is always set)
  const dpp = (car.dpp ?? {}) as Record<string, unknown>;
  const existingMfgCred = dpp.manufacturerCredential as Record<string, unknown> | undefined;
  if (!existingMfgCred?.legalParticipantId) {
    const company = await prisma.company.findFirst({
      where: { name: { contains: car.make, mode: 'insensitive' } },
    });
    if (company) {
      const orgCredential = await prisma.orgCredential.findFirst({
        where: { companyId: company.id },
      });
      const credential = await prisma.credential.findFirst({
        where: { companyId: company.id },
      });
      if (orgCredential) {
        dpp.manufacturerCredential = {
          ...existingMfgCred,
          credentialId: credential?.id || orgCredential.id,
          legalParticipantId: orgCredential.id,
          issuer: credential?.issuerName || 'EU APAC Dataspace',
          issuerDid: company.did || undefined,
          holder: orgCredential.legalName,
          type: credential?.type || 'OrgVC',
          issuedAt: orgCredential.validFrom.toISOString(),
          status: orgCredential.verificationStatus === 'draft' ? 'active' : orgCredential.verificationStatus,
        };
      }
    }
  }

  const created = await prisma.car.create({
    data: {
      id: car.id,
      vin: car.vin,
      make: car.make,
      model: car.model,
      year: car.year,
      price: car.price,
      status: car.status || 'available',
      ownerId: car.ownerId,
      dpp: dpp as any,
    },
  });
  res.status(201).json(created);
});

router.put('/:vin', requireRole('admin'), async (req, res) => {
  const car = await prisma.car.findUnique({ where: { vin: req.params.vin } });
  if (!car) return res.status(404).json({ error: 'Car not found' });

  const updated = await prisma.car.update({
    where: { vin: req.params.vin },
    data: req.body,
  });
  res.json(updated);
});

export default router;
