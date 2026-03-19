import { Router } from 'express';
import prisma from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:userId', authenticate, async (req, res) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: req.params.userId },
    include: { credentials: { include: { credential: true } } },
  });

  if (!wallet) {
    return res.json({ userId: req.params.userId, credentialIds: [], credentials: [] });
  }

  const credentialIds = wallet.credentials.map((wc) => wc.credentialId);
  const credentials = wallet.credentials.map((wc) => wc.credential);

  res.json({ userId: req.params.userId, credentialIds, credentials });
});

router.post('/:userId/credentials', authenticate, async (req, res) => {
  const { credentialId } = req.body;

  let wallet = await prisma.wallet.findUnique({ where: { userId: req.params.userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId: req.params.userId } });
  }

  await prisma.walletCredential.upsert({
    where: { walletId_credentialId: { walletId: wallet.id, credentialId } },
    update: {},
    create: { walletId: wallet.id, credentialId },
  });

  const updatedWallet = await prisma.wallet.findUnique({
    where: { userId: req.params.userId },
    include: { credentials: { include: { credential: true } } },
  });

  const credentialIds = updatedWallet!.credentials.map((wc) => wc.credentialId);
  const credentials = updatedWallet!.credentials.map((wc) => wc.credential);

  res.json({ userId: req.params.userId, credentialIds, credentials });
});

export default router;
