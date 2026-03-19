import { Router } from 'express';
import db from '../db';
import { optionalAuth, requireRole } from '../middleware/auth';
import { createAsset, createContractDefinition } from '../services/edcService';

const router = Router();

const ENABLE_EDC = process.env.ENABLE_EDC !== 'false';

router.get('/', (req, res) => {
  const cars = db.get('cars').value();
  res.json(cars);
});

router.get('/:vin', (req, res) => {
  const car = db.get('cars').find({ vin: req.params.vin }).value();
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(car);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { v4: uuidv4 } = require('uuid');
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

  db.get('cars').push(car).write();
  res.status(201).json(car);
});

router.put('/:vin', requireRole('admin'), (req, res) => {
  const car = db.get('cars').find({ vin: req.params.vin });
  if (!car.value()) return res.status(404).json({ error: 'Car not found' });
  car.assign(req.body).write();
  res.json(car.value());
});

export default router;
