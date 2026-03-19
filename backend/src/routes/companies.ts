import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';

const router = Router();

router.get('/', async (req, res) => {
  const companies = await prisma.company.findMany();
  res.json(companies);
});

router.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json(company);
});

router.post('/', requireRole('company_admin'), async (req, res) => {
  const { name, vatId, eoriNumber, cin, gstNumber, country, city, address, adminName, adminEmail } = req.body;

  if (!name) return res.status(400).json({ error: 'Company name is required' });
  if (!vatId && !eoriNumber && !cin && !gstNumber) {
    return res.status(400).json({ error: 'At least one of VAT ID, EORI, CIN, GST is required' });
  }

  const companyId = uuidv4();
  const credentialId = uuidv4();

  const credentialSubject = {
    companyName: name,
    companyDid: `did:eu-dataspace:${companyId}`,
    registrationNumber: vatId || eoriNumber || cin || gstNumber,
    vatId,
    eoriNumber,
    cin,
    gstNumber,
    country,
    city,
    address,
    adminName,
    adminEmail,
    incorporationDate: new Date().toISOString(),
  };

  const credential = await prisma.credential.create({
    data: {
      id: credentialId,
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: companyId,
      status: 'active',
      credentialSubject,
    },
  });

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OrgVC',
    issuerDid: 'did:web:eu-dataspace',
    subjectDid: `did:eu-dataspace:${companyId}`,
    credentialSubject,
  }).catch(() => {});

  const company = await prisma.company.create({
    data: {
      id: companyId,
      name,
      vatId,
      eoriNumber,
      cin,
      gstNumber,
      country,
      city,
      address,
      adminName,
      adminEmail,
      did: `did:eu-dataspace:${companyId}`,
      credentialId,
    },
  });

  res.status(201).json({ company, credential });
});

export default router;
