import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { negotiateAndFetchData, EdcStepUpdate, EdcProviderConfig } from '../services/edcConsumerService';
import { resolveDid } from '../services/did-resolver';
import { discoverDataService } from '../services/dataservice-discovery';
import prisma from '../db';

const router = Router();

/**
 * Resolve the provider DSP URL and BPNL from the car manufacturer's DID document.
 * Flow: VIN → Car → Company (by make) → DID → DID Document → DataService → dspUrl + bpnl
 */
async function resolveProviderFromVin(vin: string): Promise<EdcProviderConfig> {
  const car = await prisma.car.findUnique({ where: { vin } });
  if (!car) throw new Error(`Car not found for VIN: ${vin}`);

  const company = await prisma.company.findFirst({
    where: { name: { contains: car.make, mode: 'insensitive' } },
  });
  if (!company?.did) throw new Error(`No company with DID found for manufacturer: ${car.make}`);

  const didResult = await resolveDid(company.did);
  if (!didResult.didDocument) throw new Error(`DID resolution failed for ${company.did}`);

  const dataService = discoverDataService(didResult.didDocument);
  console.log(`[EDC Route] Resolved provider from DID ${company.did}: dspUrl=${dataService.dspUrl}, bpnl=${dataService.issuerBpnl}`);

  return { dspUrl: dataService.dspUrl, bpnl: dataService.issuerBpnl };
}

// Full EDC negotiation with SSE streaming of step progress
router.post('/negotiate', authenticate, async (req, res) => {
  const { vin, consentId, stream, dspUrl, bpnl } = req.body;

  if (!vin) {
    return res.status(400).json({ error: 'VIN is required' });
  }

  // Resolve provider from manufacturer DID if not explicitly provided
  let provider: EdcProviderConfig;
  if (dspUrl && bpnl) {
    provider = { dspUrl, bpnl };
  } else {
    try {
      provider = await resolveProviderFromVin(vin);
    } catch (err: any) {
      return res.status(400).json({ error: `Could not resolve provider from VIN: ${err.message}` });
    }
  }

  const requestedBy = (req as any).user?.preferred_username || (req as any).user?.sub || 'unknown';

  // If client requests streaming, use SSE
  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const data = await negotiateAndFetchData(
        vin,
        provider,
        (update: EdcStepUpdate) => sendEvent('step', update),
        { consentId, requestedBy },
      );
      sendEvent('complete', data);
      res.end();
    } catch (err: any) {
      sendEvent('error', { error: err.message });
      res.end();
    }
    return;
  }

  // Non-streaming: original behavior
  try {
    const startTime = Date.now();
    const data = await negotiateAndFetchData(vin, provider, undefined, { consentId, requestedBy });
    const duration = Date.now() - startTime;
    console.log(`[EDC Route] Negotiation complete for VIN: ${vin} (took ${duration}ms)`);
    res.json(data);
  } catch (err: any) {
    console.error(`[EDC Route] Negotiation failed for VIN ${vin}:`, err.message);
    res.status(502).json({
      error: 'EDC data negotiation failed',
      details: err.message,
    });
  }
});

// Get all EDC transactions (for dashboard)
router.get('/transactions', async (_req, res) => {
  const transactions = await prisma.edcTransaction.findMany({ orderBy: { startedAt: 'desc' } });
  res.json(transactions);
});

// Get a single transaction by ID
router.get('/transactions/:id', async (req, res) => {
  const tx = await prisma.edcTransaction.findUnique({ where: { id: req.params.id } });
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json(tx);
});

export default router;
