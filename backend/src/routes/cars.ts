import { Router } from 'express';
import db from '../db';
import { optionalAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', (req, res) => {
  const cars = db.get('cars').value();
  res.json(cars);
});

router.get('/:vin', (req, res) => {
  const car = db.get('cars').find({ vin: req.params.vin }).value();
  if (!car) return res.status(404).json({ error: 'Car not found' });
  res.json(car);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const car = { id: uuidv4(), ...req.body };
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
