#!/usr/bin/env ts-node
/**
 * Seed a sample organization credential for demo purposes
 */

import axios from 'axios';

const API = process.env.API_URL || 'http://localhost:8000/api';

async function seed() {
  console.log('Seeding organization credential...\n');

  const payload = {
    legalName: 'TATA Motors Limited',
    legalRegistrationNumber: {
      vatId: 'IN27AAACT2727Q1ZW',
      eoriNumber: 'IN987654321000',
      localId: 'L28920MH1945PLC004415',
      taxId: 'AAACT2727Q',
    },
    legalAddress: {
      streetAddress: 'Bombay House, 24 Homi Mody Street',
      locality: 'Mumbai',
      postalCode: '400001',
      countryCode: 'IN',
      countrySubdivisionCode: 'IN-MH',
    },
    headquartersAddress: {
      streetAddress: 'Bombay House, 24 Homi Mody Street',
      locality: 'Mumbai',
      postalCode: '400001',
      countryCode: 'IN',
      countrySubdivisionCode: 'IN-MH',
    },
    website: 'https://www.tatamotors.com',
    contactEmail: 'admin@tatamotors.com',
    did: 'did:web:participant.gxdch.io:tata-motors',
  };

  try {
    // Create credential
    const createRes = await axios.post(`${API}/org-credentials`, payload);
    const id = createRes.data.id;
    console.log(`✓ Created org credential: ${id}`);
    console.log(`  Legal Name: ${createRes.data.legalName}`);
    console.log(`  Status: ${createRes.data.verificationStatus}`);

    // Trigger verification
    console.log('\nTriggering Gaia-X verification...');
    const verifyRes = await axios.post(`${API}/org-credentials/${id}/verify`);
    console.log(`✓ Verification complete: ${verifyRes.data.verificationStatus}`);

    if (verifyRes.data.complianceResult) {
      console.log(`  Compliance: ${verifyRes.data.complianceResult.status}`);
      console.log(`  Level: ${verifyRes.data.complianceResult.complianceLevel || 'N/A'}`);
      console.log(`  Endpoint: ${verifyRes.data.complianceResult.endpointSetUsed}`);
    }

    console.log(`\n✓ Done! View at: http://localhost:3001/credential/${id}`);
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message: string };
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  }
}

seed();
