import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { issueCredentialSimple, verifyPresentationOID4VP } from '../services/waltid';

const router = Router();

router.post('/issue', authenticate, async (req, res) => {
  const { type, issuerDid, subjectDid, credentialSubject } = req.body;

  if (!type || !issuerDid || !subjectDid || !credentialSubject) {
    return res.status(400).json({ error: 'Missing required fields: type, issuerDid, subjectDid, credentialSubject' });
  }

  const result = await issueCredentialSimple({ type, issuerDid, subjectDid, credentialSubject });
  if (!result) {
    return res.status(503).json({ error: 'walt.id issuer service unavailable' });
  }

  res.json(result);
});

router.post('/verify', authenticate, async (req, res) => {
  const { presentationDefinition } = req.body;

  if (!presentationDefinition) {
    return res.status(400).json({ error: 'Missing presentationDefinition' });
  }

  const result = await verifyPresentationOID4VP({ presentationDefinition });
  if (!result) {
    return res.status(503).json({ error: 'walt.id verifier service unavailable' });
  }

  res.json(result);
});

export default router;
