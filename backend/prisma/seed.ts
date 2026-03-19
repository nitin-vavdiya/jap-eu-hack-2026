import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Seed Companies
  const companies = [
    {
      id: 'company-tata-001',
      name: 'TATA Motors',
      vatId: 'IN-TATA-VAT-2024',
      eoriNumber: 'INEORI0012345',
      cin: 'L28920MH1945PLC004520',
      gstNumber: '27AAACT2727Q1ZW',
      country: 'India',
      city: 'Mumbai',
      address: 'Bombay House, 24 Homi Mody Street, Mumbai 400001',
      adminName: 'Ratan Tata',
      adminEmail: 'admin@tatamotors.com',
      did: 'did:eu-dataspace:company-tata-001',
      registeredAt: new Date('2024-01-15T09:00:00.000Z'),
      credentialId: 'cred-org-tata-001',
    },
    {
      id: 'company-digit-001',
      name: 'Digit Insurance',
      vatId: 'IN-DIGIT-VAT-2024',
      country: 'IN',
      city: 'Bengaluru',
      address: 'Embassy Tech Village, Outer Ring Road, Bengaluru 560103',
      adminName: 'Kamesh Goyal',
      adminEmail: 'admin@godigit.com',
      did: 'did:eu-dataspace:company-digit-001',
      registeredAt: new Date('2024-02-01T09:00:00.000Z'),
      credentialId: 'cred-org-digit-001',
    },
  ];

  for (const company of companies) {
    await prisma.company.upsert({
      where: { id: company.id },
      update: company,
      create: company,
    });
  }
  console.log(`Seeded ${companies.length} companies`);

  // Seed Credentials
  const credentials = [
    {
      id: 'cred-org-tata-001',
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: 'company-tata-001',
      issuedAt: new Date('2024-01-15T09:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        companyName: 'TATA Motors',
        companyDid: 'did:eu-dataspace:company-tata-001',
        registrationNumber: 'L28920MH1945PLC004520',
        vatId: 'IN-TATA-VAT-2024',
        eoriNumber: 'INEORI0012345',
        cin: 'L28920MH1945PLC004520',
        gstNumber: '27AAACT2727Q1ZW',
        country: 'India',
        city: 'Mumbai',
        address: 'Bombay House, 24 Homi Mody Street, Mumbai 400001',
        adminName: 'Ratan Tata',
        adminEmail: 'admin@tatamotors.com',
        incorporationDate: '1945-09-01T00:00:00.000Z',
      },
    },
    {
      id: 'cred-org-digit-001',
      type: 'OrgVC',
      issuerId: 'eu-dataspace',
      issuerName: 'EU APAC Dataspace',
      subjectId: 'company-digit-001',
      issuedAt: new Date('2024-02-01T09:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        companyName: 'Digit Insurance',
        companyDid: 'did:eu-dataspace:company-digit-001',
        registrationNumber: 'U66000KA2016PTC126215',
        vatId: 'IN-DIGIT-VAT-2024',
        country: 'IN',
        city: 'Bengaluru',
        address: 'Embassy Tech Village, Outer Ring Road, Bengaluru 560103',
        adminName: 'Kamesh Goyal',
        adminEmail: 'admin@godigit.com',
        incorporationDate: '2016-09-20T00:00:00.000Z',
        insuranceLicense: 'IRDAI/HLT/2017/001',
        authorizedEUDistributor: true,
      },
    },
    {
      id: 'cred-self-mario-001',
      type: 'SelfVC',
      issuerId: 'smartsense-idp',
      issuerName: 'SmartSense Identity Provider',
      subjectId: 'mario-sanchez',
      issuedAt: new Date('2024-01-10T10:00:00.000Z'),
      expiresAt: new Date('2027-01-10T10:00:00.000Z'),
      status: 'active',
      credentialSubject: {
        name: 'Mario Sanchez',
        email: 'mario.sanchez@email.it',
        nationality: 'Italian',
        dateOfBirth: '1985-06-15',
        did: 'did:smartsense:mario-sanchez',
      },
    },
  ];

  for (const cred of credentials) {
    await prisma.credential.upsert({
      where: { id: cred.id },
      update: cred,
      create: cred,
    });
  }
  console.log(`Seeded ${credentials.length} credentials`);

  // Seed Cars
  const cars = [
    {
      id: 'car-nexon-ev-001',
      vin: 'TATA2024NEXONEV001',
      make: 'TATA',
      model: 'Nexon EV',
      year: 2024,
      price: 22500,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '40.5 kWh', range: '437 km', lastInspectionDate: '2024-01-20T10:00:00.000Z' },
        damageHistory: { hasDamage: false, incidents: [] },
        serviceHistory: { services: [{ date: '2024-01-20T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Mumbai', mileage: 5 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-01-10T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: null },
        manufacturerCredential: { credentialId: 'cred-org-tata-001', legalParticipantId: 'org-cred-tata-001', issuer: 'TATA Motors Limited', type: 'OrgVC', issuedAt: '2024-01-15T09:00:00.000Z', status: 'active' },
      },
    },
    {
      id: 'car-harrier-001',
      vin: 'TATA2024HARRIER001',
      make: 'TATA',
      model: 'Harrier',
      year: 2024,
      price: 28000,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 100, lastInspectionDate: '2024-02-01T10:00:00.000Z' },
        damageHistory: { hasDamage: false, incidents: [] },
        serviceHistory: { services: [{ date: '2024-02-01T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Pune', mileage: 8 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-01-25T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: null },
        manufacturerCredential: { credentialId: 'cred-org-tata-001', legalParticipantId: 'org-cred-tata-001', issuer: 'TATA Motors Limited', type: 'OrgVC', issuedAt: '2024-01-15T09:00:00.000Z', status: 'active' },
      },
    },
    {
      id: 'car-punch-ev-001',
      vin: 'TATA2024PUNCHEV001',
      make: 'TATA',
      model: 'Punch EV',
      year: 2024,
      price: 15500,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '35 kWh', range: '421 km', lastInspectionDate: '2024-03-01T10:00:00.000Z' },
        damageHistory: { hasDamage: false, incidents: [] },
        serviceHistory: { services: [{ date: '2024-03-01T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Delhi', mileage: 3 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-02-20T00:00:00.000Z', manufacturingPlant: 'Sanand Plant, Gujarat', currentOwner: null },
        manufacturerCredential: { credentialId: 'cred-org-tata-001', legalParticipantId: 'org-cred-tata-001', issuer: 'TATA Motors Limited', type: 'OrgVC', issuedAt: '2024-01-15T09:00:00.000Z', status: 'active' },
      },
    },
    {
      id: 'car-safari-001',
      vin: 'TATA2024SAFARI0001',
      make: 'TATA',
      model: 'Safari',
      year: 2024,
      price: 32000,
      status: 'available',
      dpp: {
        stateOfHealth: { engineHealth: 100, lastInspectionDate: '2024-02-15T10:00:00.000Z' },
        damageHistory: { hasDamage: false, incidents: [] },
        serviceHistory: { services: [{ date: '2024-02-15T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Chennai', mileage: 12 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-02-01T00:00:00.000Z', manufacturingPlant: 'Pune Plant, Maharashtra', currentOwner: null },
        manufacturerCredential: { credentialId: 'cred-org-tata-001', legalParticipantId: 'org-cred-tata-001', issuer: 'TATA Motors Limited', type: 'OrgVC', issuedAt: '2024-01-15T09:00:00.000Z', status: 'active' },
      },
    },
    {
      id: 'car-curvv-ev-001',
      vin: 'TATA2024CURVVEV001',
      make: 'TATA',
      model: 'Curvv EV',
      year: 2025,
      price: 26000,
      status: 'available',
      dpp: {
        stateOfHealth: { batteryHealth: 100, batteryCapacity: '55 kWh', range: '502 km', lastInspectionDate: '2025-01-10T10:00:00.000Z' },
        damageHistory: { hasDamage: false, incidents: [] },
        serviceHistory: { services: [{ date: '2025-01-10T10:00:00.000Z', type: 'Pre-delivery Inspection', dealer: 'TATA Motors Bangalore', mileage: 6 }] },
        ownershipChain: { manufacturer: 'TATA Motors', manufacturingDate: '2024-12-20T00:00:00.000Z', manufacturingPlant: 'Sanand Plant, Gujarat', currentOwner: null },
        manufacturerCredential: { credentialId: 'cred-org-tata-001', legalParticipantId: 'org-cred-tata-001', issuer: 'TATA Motors Limited', type: 'OrgVC', issuedAt: '2024-01-15T09:00:00.000Z', status: 'active' },
      },
    },
  ];

  for (const car of cars) {
    await prisma.car.upsert({
      where: { vin: car.vin },
      update: car,
      create: car,
    });
  }
  console.log(`Seeded ${cars.length} cars`);

  // Seed Wallet for mario-sanchez
  const wallet = await prisma.wallet.upsert({
    where: { userId: 'mario-sanchez' },
    update: {},
    create: { userId: 'mario-sanchez' },
  });

  await prisma.walletCredential.upsert({
    where: { walletId_credentialId: { walletId: wallet.id, credentialId: 'cred-self-mario-001' } },
    update: {},
    create: { walletId: wallet.id, credentialId: 'cred-self-mario-001' },
  });
  console.log('Seeded wallet for mario-sanchez');

  // Seed OrgCredentials
  const orgCredentials = [
    {
      id: 'org-cred-tata-001',
      companyId: 'company-tata-001',
      legalName: 'TATA Motors Limited',
      legalRegistrationNumber: { vatId: 'IN27AAACT2727Q1ZW', eoriNumber: 'IN987654321000', localId: 'L28920MH1945PLC004415', taxId: 'AAACT2727Q' },
      legalAddress: { streetAddress: 'Bombay House, 24 Homi Mody Street', locality: 'Mumbai', postalCode: '400001', countryCode: 'IN', countrySubdivisionCode: 'IN-MH' },
      headquartersAddress: { streetAddress: 'Bombay House, 24 Homi Mody Street', locality: 'Mumbai', postalCode: '400001', countryCode: 'IN', countrySubdivisionCode: 'IN-MH' },
      website: 'https://www.tatamotors.com',
      contactEmail: 'admin@tatamotors.com',
      did: 'did:web:participant.gxdch.io:tata-motors',
      validFrom: new Date('2024-01-15T09:00:00.000Z'),
      validUntil: new Date('2027-01-15T09:00:00.000Z'),
      verificationStatus: 'draft',
      verificationAttempts: [],
      issuedVCs: [],
    },
    {
      id: 'org-cred-digit-001',
      companyId: 'company-digit-001',
      legalName: 'Go Digit General Insurance Limited',
      legalRegistrationNumber: { vatId: 'IN29AADCG1234R1ZN', localId: 'U66000KA2016PTC126215', taxId: 'AADCG1234R' },
      legalAddress: { streetAddress: 'Embassy Tech Village, Outer Ring Road', locality: 'Bengaluru', postalCode: '560103', countryCode: 'IN', countrySubdivisionCode: 'IN-KA' },
      headquartersAddress: { streetAddress: 'Embassy Tech Village, Outer Ring Road', locality: 'Bengaluru', postalCode: '560103', countryCode: 'IN', countrySubdivisionCode: 'IN-KA' },
      website: 'https://www.godigit.com',
      contactEmail: 'admin@godigit.com',
      did: 'did:web:participant.gxdch.io:digit-insurance',
      validFrom: new Date('2024-02-01T09:00:00.000Z'),
      validUntil: new Date('2027-02-01T09:00:00.000Z'),
      verificationStatus: 'draft',
      verificationAttempts: [],
      issuedVCs: [],
    },
  ];

  for (const org of orgCredentials) {
    await prisma.orgCredential.upsert({
      where: { id: org.id },
      update: org,
      create: org,
    });
  }
  console.log(`Seeded ${orgCredentials.length} org credentials`);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
