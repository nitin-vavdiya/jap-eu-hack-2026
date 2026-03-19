import { Router } from 'express';
import db from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', (req, res) => {
  const credentials = db.get('credentials').value();
  res.json(credentials);
});

router.get('/company/:id', (req, res) => {
  const credentials = db.get('credentials').filter({ issuerId: req.params.id }).value();
  res.json(credentials);
});

router.post('/', authenticate, (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const credential = { id: uuidv4(), ...req.body };
  db.get('credentials').push(credential).write();
  res.status(201).json(credential);
});

export default router;
