import { Router } from 'express';
import db from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:userId', authenticate, (req, res) => {
  const wallet = db.get('wallet').get(req.params.userId).value();
  if (!wallet) return res.json({ userId: req.params.userId, credentialIds: [], credentials: [] });

  const credentials = wallet.credentialIds.map((id: string) =>
    db.get('credentials').find({ id }).value()
  ).filter(Boolean);

  res.json({ userId: req.params.userId, credentialIds: wallet.credentialIds, credentials });
});

router.post('/:userId/credentials', authenticate, (req, res) => {
  const { credentialId } = req.body;
  const wallet = db.get('wallet').get(req.params.userId).value();

  if (!wallet) {
    db.get('wallet').set(req.params.userId, { credentialIds: [credentialId] }).write();
  } else {
    if (!wallet.credentialIds.includes(credentialId)) {
      db.get('wallet').get(req.params.userId).get('credentialIds').push(credentialId).write();
    }
  }

  const updatedWallet = db.get('wallet').get(req.params.userId).value();
  const credentials = updatedWallet.credentialIds.map((id: string) =>
    db.get('credentials').find({ id }).value()
  ).filter(Boolean);

  res.json({ userId: req.params.userId, credentialIds: updatedWallet.credentialIds, credentials });
});

export default router;
