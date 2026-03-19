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
  res.json(car);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const car = { id: uuidv4(), ...req.body };
  const vin = car.vin;

  if (ENABLE_EDC) {
    try {
      const assetResponse = await createAsset(vin);
      const assetId = assetResponse['@id'];
      await createContractDefinition(assetId);
    } catch (err: any) {
      return res.status(502).json({
        error: 'Failed to register car in EDC. Car not created.',
        details: err.message,
      });
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
      dpp: car.dpp || undefined,
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
