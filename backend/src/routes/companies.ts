import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireRole } from '../middleware/auth';
import { issueCredentialSimple } from '../services/waltid';

const router = Router();

router.get('/', (req, res) => {
  const companies = db.get('companies').value();
  res.json(companies);
});

router.get('/:id', (req, res) => {
  const company = db.get('companies').find({ id: req.params.id }).value();
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

  const credential = {
    id: credentialId,
    type: 'OrgVC',
    issuerId: 'eu-dataspace',
    issuerName: 'EU APAC Dataspace',
    subjectId: companyId,
    issuedAt: new Date().toISOString(),
    status: 'active',
    credentialSubject: {
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
      incorporationDate: new Date().toISOString()
    }
  };

  db.get('credentials').push(credential).write();

  // Also issue via walt.id OID4VCI (non-blocking)
  issueCredentialSimple({
    type: 'OrgVC',
    issuerDid: 'did:web:eu-dataspace',
    subjectDid: `did:eu-dataspace:${companyId}`,
    credentialSubject: credential.credentialSubject,
  }).catch(() => {});

  const company = {
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
    registeredAt: new Date().toISOString(),
    credentialId
  };

  db.get('companies').push(company).write();
  res.status(201).json({ company, credential });
});

export default router;
