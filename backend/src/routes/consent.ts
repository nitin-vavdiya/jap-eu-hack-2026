import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

// Check if consent already exists (idempotency)
router.get('/check', (req, res) => {
  const { userId, vin, requesterId } = req.query as { userId: string; vin: string; requesterId: string };
  const existing = db.get('consent').find({
    userId,
    vin,
    requesterId,
    status: 'approved'
  }).value();
  if (existing) {
    return res.json({ exists: true, consent: existing });
  }
  return res.json({ exists: false });
});

// Get pending consents for a user
router.get('/pending/:userId', (req, res) => {
  const pending = db.get('consent').filter({
    userId: req.params.userId,
    status: 'pending'
  }).value();
  res.json(pending);
});

// Get consent history for a user
router.get('/history/:userId', (req, res) => {
  const history = db.get('consent').filter({ userId: req.params.userId }).value();
  res.json(history);
});

// Get specific consent by ID
router.get('/:id', (req, res) => {
  const consent = db.get('consent').find({ id: req.params.id }).value();
  if (!consent) return res.status(404).json({ error: 'Consent not found' });
  res.json(consent);
});

// Create consent request
router.post('/request', authenticate, (req, res) => {
  const { requesterId, requesterName, userId, vin, purpose, dataRequested, dataExcluded } = req.body;

  // Check if pending already exists
  const existingPending = db.get('consent').find({ userId, vin, requesterId, status: 'pending' }).value();
  if (existingPending) {
    return res.json(existingPending);
  }

  const consent = {
    id: uuidv4(),
    requesterId,
    requesterName,
    userId,
    vin,
    purpose,
    dataRequested: dataRequested || [],
    dataExcluded: dataExcluded || [],
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  db.get('consent').push(consent).write();
  res.status(201).json(consent);
});

// Approve consent
router.put('/:id/approve', authenticate, (req, res) => {
  const consent = db.get('consent').find({ id: req.params.id });
  if (!consent.value()) return res.status(404).json({ error: 'Consent not found' });
  consent.assign({ status: 'approved', resolvedAt: new Date().toISOString() }).write();
  res.json(consent.value());
});

// Deny consent
router.put('/:id/deny', authenticate, (req, res) => {
  const consent = db.get('consent').find({ id: req.params.id });
  if (!consent.value()) return res.status(404).json({ error: 'Consent not found' });
  consent.assign({ status: 'denied', resolvedAt: new Date().toISOString() }).write();
  res.json(consent.value());
});

export default router;
