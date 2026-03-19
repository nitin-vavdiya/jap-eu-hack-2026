import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { authenticate } from '../middleware/auth';
import { getVCBaseUrl } from '../services/gaiax/vc-builder';

const router = Router();

router.get('/', async (req, res) => {
  const credentials = await prisma.credential.findMany();
  res.json(credentials);
});

router.get('/company/:companyId', async (req, res) => {
  const credentials = await prisma.credential.findMany({
    where: { issuerId: req.params.companyId },
  });
  res.json(credentials);
});

// Public credential resolution endpoint — makes credential URIs resolvable
router.get('/:id', async (req, res) => {
  const credential = await prisma.credential.findUnique({ where: { id: req.params.id } });
  if (!credential) return res.status(404).json({ error: 'Credential not found' });

  const baseUrl = getVCBaseUrl();

  // For OrgVC, resolve issuer to the Legal Participant VC URL
  let issuer: string = credential.issuerId;
  if (credential.type === 'OrgVC' && credential.subjectId) {
    const orgCred = await prisma.orgCredential.findFirst({ where: { companyId: credential.subjectId } });
    if (orgCred) {
      issuer = `${baseUrl}/vc/${orgCred.id}`;
    }
  }

  res.json({
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', credential.type],
    id: `${baseUrl}/api/credentials/${credential.id}`,
    issuer,
    issuerName: credential.issuerName,
    validFrom: credential.issuedAt,
    ...(credential.expiresAt ? { validUntil: credential.expiresAt } : {}),
    status: credential.status,
    credentialSubject: credential.credentialSubject,
  });
});

router.post('/', authenticate, async (req, res) => {
  const credential = await prisma.credential.create({
    data: {
      id: uuidv4(),
      type: req.body.type,
      issuerId: req.body.issuerId,
      issuerName: req.body.issuerName,
      subjectId: req.body.subjectId,
      status: req.body.status || 'active',
      credentialSubject: req.body.credentialSubject || {},
    },
  });
  res.status(201).json(credential);
});

export default router;
