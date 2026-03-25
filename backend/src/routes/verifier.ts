/**
 * OpenID4VP-style Verifier Routes
 * Handles presentation requests from Tokio Marine & Nichido Fire Insurance,
 * receives VPs from the wallet, processes them through the full
 * DID resolution + manufacturer validation pipeline.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { authenticate } from '../middleware/auth';
import {
  parseVP,
  extractCredentials,
  validateVP,
  PresentationRequest,
  PresentationSession,
  SessionStep,
} from '../services/vp-processor';
import {
  resolveDid,
  SERVICE_TYPES,
} from '../services/did-resolver';
import { discoverDataService } from '../services/dataservice-discovery';
import {
  queryCatalog,
  initiateNegotiation,
  waitForAgreement,
  initiateTransfer,
  getTransferProcess,
  getAuthCode,
  fetchAssetData,
  EdcProviderConfig,
} from '../services/edcConsumerService';

const REGISTRY_BASE = process.env.APP_BASE_URL || 'http://localhost:8000';
const router = Router();

// --------------- Step Names ---------------

const VP_FLOW_STEPS = [
  'VP Received & Parsed',
  'Credentials Extracted from VP',
  'VP Signature & Structure Validated',
  'Issuer DID Resolved',
  'DataService Endpoint Discovered',
  'DSP URL & Provider BPNL Extracted',
  'EDC Catalog Queried',
  'Contract Negotiation Initiated',
  'Agreement Finalized',
  'Data Transfer via EDC',
  'Vehicle DPP Data Received',
];

// --------------- Helper ---------------

async function updateSession(sessionId: string, updates: Partial<PresentationSession>) {
  const session = await prisma.presentationSession.findUnique({ where: { id: sessionId } });
  if (session) {
    await prisma.presentationSession.update({ where: { id: sessionId }, data: updates as any });
  }
}

async function updateSessionStep(sessionId: string, stepNum: number, status: SessionStep['status'], details?: Record<string, unknown>, durationMs?: number) {
  const session = await prisma.presentationSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const steps = (session.steps as any[]) || [];
  const step = steps.find((s: any) => s.step === stepNum);
  if (step) {
    step.status = status;
    if (status === 'running') step.startedAt = new Date().toISOString();
    if (status === 'completed' || status === 'failed') {
      step.completedAt = new Date().toISOString();
      if (durationMs !== undefined) step.durationMs = durationMs;
    }
    if (details) step.details = details;
  }
  await prisma.presentationSession.update({ where: { id: sessionId }, data: { steps } });
}

// --------------- Routes ---------------

/**
 * POST /presentation-request
 * Tokio Marine creates a presentation request (OpenID4VP Authorization Request)
 */
router.post('/presentation-request', authenticate, async (req, res) => {
  const { purpose, expectedCredentialTypes, requestedClaims } = req.body;

  const nonce = uuidv4();
  const requestId = uuidv4();

  const request = await prisma.presentationRequest.create({
    data: {
      id: requestId,
      verifierId: 'company-tokiomarine-001',
      verifierName: 'Tokio Marine & Nichido Fire Insurance',
      verifierDid: 'did:eu-dataspace:company-tokiomarine-001',
      nonce,
      purpose: purpose || 'Vehicle insurance underwriting — verify ownership and access vehicle data',
      expectedCredentialTypes: expectedCredentialTypes || ['OwnershipVC'],
      requestedClaims: requestedClaims || ['vin', 'make', 'model', 'year', 'ownerId'],
      callbackUrl: `${REGISTRY_BASE}/api/verifier/callback`,
      status: 'pending',
      expiresAt: new Date(Date.now() + 1 * 60 * 1000), // 1 min
    },
  });

  // Create a session to track processing
  const session = await prisma.presentationSession.create({
    data: {
      id: uuidv4(),
      requestId,
      status: 'waiting',
      steps: VP_FLOW_STEPS.map((name, i) => ({
        step: i + 1,
        name,
        status: 'pending' as const,
      })),
      startedAt: new Date(),
    },
  });

  // Build QR payload (OpenID4VP-style authorization request)
  const qrPayload = {
    type: 'openid4vp-authorization-request',
    client_id: request.verifierDid,
    client_metadata: {
      client_name: request.verifierName,
      logo_uri: null,
    },
    nonce,
    presentation_definition: {
      id: requestId,
      input_descriptors: [
        {
          id: 'ownership_vc',
          name: 'Vehicle Ownership Credential',
          purpose: request.purpose,
          constraints: {
            fields: [
              { path: ['$.type'], filter: { type: 'array', contains: { const: 'OwnershipVC' } } },
              { path: ['$.credentialSubject.vin'], optional: false },
            ],
          },
        },
      ],
    },
    response_uri: request.callbackUrl,
    response_type: 'vp_token',
    response_mode: 'direct_post',
    request_id: requestId,
  };

  // Deep link for same-device flow
  const deepLink = `smartsense-wallet://present?request_id=${requestId}&callback=${encodeURIComponent(request.callbackUrl!)}&nonce=${nonce}`;

  res.status(201).json({
    ...request,
    sessionId: session.id,
    qrPayload,
    deepLink,
    qrData: JSON.stringify(qrPayload),
  });
});

/**
 * GET /presentation-request/:id
 * Wallet fetches presentation request details (e.g. after scanning QR)
 */
router.get('/presentation-request/:id', async (req, res) => {
  const request = await prisma.presentationRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Presentation request not found' });

  // Check expiry
  if (request.expiresAt && new Date(request.expiresAt) < new Date() && request.status === 'pending') {
    await prisma.presentationRequest.update({ where: { id: req.params.id }, data: { status: 'expired' } });
    return res.status(410).json({ error: 'Presentation request has expired' });
  }

  res.json(request);
});

/**
 * POST /callback
 * Wallet submits VP here. This triggers the full processing pipeline.
 */
router.post('/callback', async (req, res) => {
  const { requestId, vpToken } = req.body;

  if (!requestId || !vpToken) {
    return res.status(400).json({ error: 'requestId and vpToken are required' });
  }

  const request = await prisma.presentationRequest.findUnique({ where: { id: requestId } });
  if (!request) return res.status(404).json({ error: 'Presentation request not found' });
  if (request.status !== 'pending') {
    return res.status(409).json({ error: `Request already ${request.status}` });
  }

  // Find session
  const session = await prisma.presentationSession.findFirst({ where: { requestId } });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Mark request as fulfilled
  await prisma.presentationRequest.update({ where: { id: requestId }, data: { status: 'fulfilled' } });
  await updateSession(session.id, { status: 'processing', vpToken } as any);

  // Process VP asynchronously (the insurance portal polls session status)
  processVPAsync(session.id, vpToken, request as any).catch(err => {
    console.error('[Verifier] VP processing error:', err.message);
  });

  res.json({ sessionId: session.id, status: 'processing' });
});

/**
 * GET /session/:id
 * Insurance portal polls this to get step-by-step progress
 */
router.get('/session/:id', async (req, res) => {
  const session = await prisma.presentationSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

/**
 * GET /session-by-request/:requestId
 * Insurance portal can also look up session by request ID
 */
router.get('/session-by-request/:requestId', async (req, res) => {
  const session = await prisma.presentationSession.findFirst({ where: { requestId: req.params.requestId } });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

/**
 * POST /decline
 * Wallet declines the presentation request
 */
router.post('/decline', async (req, res) => {
  const { requestId } = req.body;
  const request = await prisma.presentationRequest.findUnique({ where: { id: requestId } });
  if (!request) return res.status(404).json({ error: 'Request not found' });

  await prisma.presentationRequest.update({ where: { id: requestId }, data: { status: 'declined' } });

  const session = await prisma.presentationSession.findFirst({ where: { requestId } });
  if (session) {
    await updateSession(session.id, { status: 'failed', error: 'User declined the presentation request' } as any);
  }

  res.json({ status: 'declined' });
});

/**
 * GET /did/:did
 * Public DID resolution endpoint
 */
router.get('/did/:did(*)', async (req, res) => {
  const result = await resolveDid(req.params.did);
  if (!result.didDocument) {
    return res.status(404).json({ error: 'DID not found', did: req.params.did });
  }
  res.json(result);
});

// --------------- VP Processing Pipeline ---------------

async function processVPAsync(sessionId: string, vpToken: unknown, request: PresentationRequest) {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    // Step 1: Parse VP
    await updateSessionStep(sessionId, 1, 'running');
    await sleep(400); // Simulate processing time
    let t0 = Date.now();
    const vp = parseVP(vpToken as string | object);
    await updateSessionStep(sessionId, 1, 'completed', {
      holder: vp.holder,
      credentialCount: vp.verifiableCredential.length,
      hasProof: !!vp.proof,
    }, Date.now() - t0);

    // Step 2: Extract credentials
    await updateSessionStep(sessionId, 2, 'running');
    await sleep(300);
    t0 = Date.now();
    const credentials = extractCredentials(vp);
    const ownershipCred = credentials.find(c => c.type.includes('OwnershipVC'));

    if (!ownershipCred) {
      throw new Error('No OwnershipVC found in the presentation');
    }

    const vin = ownershipCred.subject.vin as string;
    if (!vin) throw new Error('OwnershipVC does not contain a VIN');

    await updateSession(sessionId, { extractedCredentials: credentials, vehicleVin: vin } as any);
    await updateSessionStep(sessionId, 2, 'completed', {
      credentialTypes: credentials.map(c => c.type.join(', ')),
      issuer: ownershipCred.issuer,
      vin,
      holder: ownershipCred.subject.ownerId || ownershipCred.subject.ownerDid,
    }, Date.now() - t0);

    // Step 3: Validate VP
    await updateSessionStep(sessionId, 3, 'running');
    await sleep(500);
    t0 = Date.now();
    const validation = validateVP(vp, {
      expectedCredentialTypes: request.expectedCredentialTypes,
      expectedChallenge: request.nonce,
      expectedDomain: 'tokio-marine',
      vehicleVin: vin,
    });

    if (!validation.valid) {
      throw new Error(`VP validation failed: ${validation.errors.join('; ')}`);
    }

    await updateSessionStep(sessionId, 3, 'completed', {
      valid: true,
      challengeMatched: true,
      holderVerified: true,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    }, Date.now() - t0);

    // Step 4: Resolve issuer DID
    await updateSessionStep(sessionId, 4, 'running');
    await sleep(600);
    t0 = Date.now();
    const issuerDid = ownershipCred.issuer;
    const didResult = await resolveDid(issuerDid);

    if (!didResult.didDocument) {
      throw new Error(`Could not resolve issuer DID: ${issuerDid}`);
    }

    await updateSession(sessionId, { issuerDid, resolvedDidDocument: didResult.didDocument } as any);
    await updateSessionStep(sessionId, 4, 'completed', {
      issuerDid,
      serviceEndpointCount: (didResult.didDocument.service || []).length,
      verificationMethodCount: (didResult.didDocument.verificationMethod || []).length,
    }, Date.now() - t0);

    // Step 5: Discover DataService endpoint from DID
    await updateSessionStep(sessionId, 5, 'running');
    await sleep(400);
    t0 = Date.now();

    let dataServiceResult;
    try {
      dataServiceResult = discoverDataService(didResult.didDocument);
    } catch (err: any) {
      throw new Error(`DataService discovery failed: ${err.message}`);
    }

    await updateSession(sessionId, { selectedEndpoint: { type: 'DataService', url: dataServiceResult.serviceEndpoint } } as any);
    await updateSessionStep(sessionId, 5, 'completed', {
      serviceId: dataServiceResult.serviceId,
      serviceType: 'DataService',
      endpoint: dataServiceResult.serviceEndpoint,
      allServices: (didResult.didDocument.service || []).map(s => s.type),
    }, Date.now() - t0);

    // Step 6: Extract DSP URL and BPNL
    await updateSessionStep(sessionId, 6, 'running');
    await sleep(300);
    t0 = Date.now();

    const provider: EdcProviderConfig = {
      dspUrl: dataServiceResult.dspUrl,
      bpnl: dataServiceResult.issuerBpnl,
    };

    await updateSessionStep(sessionId, 6, 'completed', {
      dspUrl: provider.dspUrl,
      providerBpnl: provider.bpnl,
      protocol: 'dataspace-protocol-http',
    }, Date.now() - t0);

    // Step 7: Query EDC Catalog
    await updateSessionStep(sessionId, 7, 'running');
    t0 = Date.now();

    const { assetId, offerId } = await queryCatalog(vin, provider);

    await updateSessionStep(sessionId, 7, 'completed', {
      assetId,
      offerId: offerId.length > 30 ? offerId.slice(0, 30) + '...' : offerId,
      assetRule: `asset_${vin}`,
    }, Date.now() - t0);

    // Step 8: Initiate Contract Negotiation
    await updateSessionStep(sessionId, 8, 'running');
    t0 = Date.now();

    const negotiationId = await initiateNegotiation(offerId, assetId, provider);

    await updateSessionStep(sessionId, 8, 'completed', {
      negotiationId,
      policyType: 'odrl:Offer',
    }, Date.now() - t0);

    // Step 9: Wait for Agreement Finalization
    await updateSessionStep(sessionId, 9, 'running');
    t0 = Date.now();

    const contractAgreementId = await waitForAgreement(negotiationId);

    await updateSessionStep(sessionId, 9, 'completed', {
      contractAgreementId,
      state: 'FINALIZED',
    }, Date.now() - t0);

    // Step 10: Data Transfer via EDC (transfer + EDR + auth)
    await updateSessionStep(sessionId, 10, 'running');
    t0 = Date.now();

    const transferId = await initiateTransfer(assetId, contractAgreementId, provider);
    await sleep(2000);
    await getTransferProcess(contractAgreementId);
    const { endpoint: dataPlaneEndpoint, authorization } = await getAuthCode(transferId);

    await updateSessionStep(sessionId, 10, 'completed', {
      transferId,
      transferType: 'HttpData-PULL',
      dataPlaneEndpoint,
    }, Date.now() - t0);

    // Step 11: Fetch DPP Data from Data Plane
    await updateSessionStep(sessionId, 11, 'running');
    t0 = Date.now();

    const vehicleData = await fetchAssetData(dataPlaneEndpoint, authorization);

    await updateSession(sessionId, {
      vehicleData,
      status: 'completed',
      completedAt: new Date().toISOString(),
    } as any);
    await updateSessionStep(sessionId, 11, 'completed', {
      dataReceived: true,
      fieldsCount: vehicleData && typeof vehicleData === 'object' ? Object.keys(vehicleData).length : 0,
      source: 'edc-data-plane',
      protocol: 'IDSA DSP + HttpData-PULL',
    }, Date.now() - t0);

  } catch (error: any) {
    // Find the running step and mark it failed
    const session = await prisma.presentationSession.findUnique({ where: { id: sessionId } });
    if (session) {
      const steps = (session.steps as any[]) || [];
      const runningStep = steps.find((s: any) => s.status === 'running');
      if (runningStep) {
        await updateSessionStep(sessionId, runningStep.step, 'failed', { error: error.message });
      }
    }
    await updateSession(sessionId, {
      status: 'failed',
      error: error.message,
      completedAt: new Date().toISOString(),
    } as any);
  }
}

export default router;
