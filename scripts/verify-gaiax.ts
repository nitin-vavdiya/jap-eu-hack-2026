#!/usr/bin/env ts-node
/**
 * Gaia-X Loire Trust Framework Verification Script
 *
 * Usage:
 *   npx ts-node scripts/verify-gaiax.ts
 *   # or via npm script:
 *   npm run verify:gaiax
 *
 * This script:
 *   1. Tests primary endpoint set health
 *   2. Falls back to fallback sets if needed
 *   3. Submits a sample organization verification
 *   4. Prints results and exits with appropriate code
 */

import axios from 'axios';

const API = process.env.API_URL || 'http://localhost:8000/api';

interface HealthResult {
  endpointSets: Array<{
    endpointSet: string;
    compliance: { healthy: boolean; latencyMs: number; error?: string };
    registry: { healthy: boolean; latencyMs: number; error?: string };
    notary: { healthy: boolean; latencyMs: number; error?: string };
    overall: boolean;
  }>;
  selectedEndpointSet: string | null;
  mockMode: boolean;
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(msg: string) { console.log(msg); }
function success(msg: string) { log(`${COLORS.green}✓${COLORS.reset} ${msg}`); }
function fail(msg: string) { log(`${COLORS.red}✕${COLORS.reset} ${msg}`); }
function info(msg: string) { log(`${COLORS.blue}ℹ${COLORS.reset} ${msg}`); }
function warn(msg: string) { log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`); }
function header(msg: string) { log(`\n${COLORS.bold}${msg}${COLORS.reset}\n${'─'.repeat(60)}`); }

async function main() {
  log(`\n${COLORS.bold}Gaia-X Loire Trust Framework — Verification Script${COLORS.reset}`);
  log(`${COLORS.dim}Target: ${API}${COLORS.reset}\n`);

  let exitCode = 0;

  // Step 1: Backend health
  header('Step 1: Backend Health Check');
  try {
    const health = await axios.get(`${API}/health`);
    success(`Backend is running (auth: ${health.data.authEnabled ? 'ON' : 'OFF'})`);
  } catch {
    fail('Backend is not reachable at ' + API);
    log('\nMake sure the backend is running: npm run dev:backend');
    process.exit(1);
  }

  // Step 2: Gaia-X endpoint health
  header('Step 2: Gaia-X Endpoint Health');
  let healthData: HealthResult;
  try {
    const res = await axios.get(`${API}/gaiax/health`);
    healthData = res.data;

    if (healthData.mockMode) {
      warn('Mock mode is ACTIVE (GAIAX_MOCK_MODE=true)');
      info('Set GAIAX_MOCK_MODE=false for live endpoint testing');
    }

    for (const ep of healthData.endpointSets) {
      const statusIcon = ep.overall ? COLORS.green + '●' : COLORS.red + '●';
      log(`\n${statusIcon}${COLORS.reset} ${ep.endpointSet}`);
      for (const svc of ['compliance', 'registry', 'notary'] as const) {
        const s = ep[svc];
        const icon = s.healthy ? `${COLORS.green}✓` : `${COLORS.red}✕`;
        log(`  ${icon}${COLORS.reset} ${svc.padEnd(12)} ${s.latencyMs}ms ${s.error ? COLORS.dim + s.error + COLORS.reset : ''}`);
      }
    }

    if (healthData.selectedEndpointSet) {
      success(`Selected endpoint set: ${healthData.selectedEndpointSet}`);
    } else if (!healthData.mockMode) {
      warn('No healthy endpoint set found — will use mock fallback');
    }
  } catch (e: unknown) {
    const err = e as Error;
    fail('Could not check Gaia-X health: ' + err.message);
    exitCode = 1;
    healthData = { endpointSets: [], selectedEndpointSet: null, mockMode: true };
  }

  // Step 3: Create test org credential
  header('Step 3: Create Test Organization Credential');
  let credentialId: string | null = null;
  try {
    const payload = {
      legalName: 'Toyota Motor Corporation (Test)',
      legalRegistrationNumber: {
        vatId: 'JP-TOYOTA-VAT-TEST',
        localId: '0180-01-008846',
      },
      legalAddress: {
        streetAddress: '1 Toyota-cho',
        locality: 'Toyota City',
        postalCode: '471-8571',
        countryCode: 'JP',
        countrySubdivisionCode: 'JP-23',
      },
      contactEmail: 'test@toyota-global.com',
      website: 'https://www.toyota-global.com',
    };

    const res = await axios.post(`${API}/org-credentials`, payload);
    credentialId = res.data.id;
    success(`Created org credential: ${credentialId}`);
    info(`Legal name: ${res.data.legalName}`);
    info(`Status: ${res.data.verificationStatus}`);
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } }; message: string };
    fail('Failed to create org credential: ' + (err.response?.data?.error || err.message));
    exitCode = 1;
  }

  // Step 4: Trigger verification
  if (credentialId) {
    header('Step 4: Trigger Gaia-X Verification');
    try {
      const res = await axios.post(`${API}/org-credentials/${credentialId}/verify`);
      const result = res.data;

      if (result.verificationStatus === 'verified') {
        success('Verification PASSED');
        info(`Compliance: ${result.complianceResult?.status || 'N/A'}`);
        info(`Compliance Level: ${result.complianceResult?.complianceLevel || 'N/A'}`);
        info(`Endpoint Set Used: ${result.complianceResult?.endpointSetUsed || 'N/A'}`);
        info(`Attempts: ${result.verificationAttempts?.length || 0}`);
      } else {
        fail(`Verification status: ${result.verificationStatus}`);
        if (result.verificationAttempts) {
          for (const attempt of result.verificationAttempts) {
            log(`  ${attempt.step}: ${attempt.status} (${attempt.durationMs}ms) ${attempt.error || ''}`);
          }
        }
        exitCode = 1;
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } }; message: string };
      fail('Verification request failed: ' + (err.response?.data?.message || err.message));
      exitCode = 1;
    }

    // Step 5: Fetch proof
    header('Step 5: Retrieve Proof');
    try {
      const res = await axios.get(`${API}/org-credentials/${credentialId}/proof`);
      const proof = res.data;

      if (proof.complianceResult) {
        success('Compliance proof retrieved');
        info(`Status: ${proof.complianceResult.status}`);
        if (proof.complianceResult.issuedCredential) {
          info('Compliance credential present');
          log(`${COLORS.dim}${JSON.stringify(proof.complianceResult.issuedCredential, null, 2).slice(0, 500)}...${COLORS.reset}`);
        }
      }

      if (proof.notaryResult) {
        success('Notary proof retrieved');
        info(`Registration ID: ${proof.notaryResult.registrationId || 'N/A'}`);
      }

      if (proof.vcPayload) {
        success('VC payload present');
        const vc = proof.vcPayload;
        info(`VC ID: ${vc.id || 'N/A'}`);
        info(`Issuer: ${vc.issuer || 'N/A'}`);
        info(`Type: ${JSON.stringify(vc['@type'] || [])}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      fail('Could not retrieve proof: ' + err.message);
    }
  }

  // Summary
  header('Summary');
  if (exitCode === 0) {
    success(`${COLORS.bold}All checks passed!${COLORS.reset}`);
    if (healthData.mockMode) {
      warn('Note: Tests ran in mock mode. Set GAIAX_MOCK_MODE=false for live verification.');
    }
  } else {
    fail(`${COLORS.bold}Some checks failed. See details above.${COLORS.reset}`);
  }

  log('');
  process.exit(exitCode);
}

main().catch(err => {
  fail('Unexpected error: ' + err.message);
  process.exit(1);
});
