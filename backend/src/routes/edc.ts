import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { negotiateAndFetchData } from '../services/edcConsumerService';

const router = Router();

// Full EDC negotiation flow — returns car data from partner's data plane
router.post('/negotiate', authenticate, async (req, res) => {
  const { vin } = req.body;

  if (!vin) {
    return res.status(400).json({ error: 'VIN is required' });
  }

  try {
    console.log(`[EDC Route] Starting negotiation for VIN: ${vin}, requested by user: ${(req as any).user?.sub || 'unknown'}`);
    const startTime = Date.now();
    const data = await negotiateAndFetchData(vin);
    const duration = Date.now() - startTime;
    console.log(`[EDC Route] Negotiation complete for VIN: ${vin} (took ${duration}ms)`);
    res.json(data);
  } catch (err: any) {
    console.error(`[EDC Route] Negotiation failed for VIN ${vin}:`, err.message);
    if (err.response) {
      console.error(`[EDC Route] HTTP Status: ${err.response.status}`);
      console.error(`[EDC Route] Response:`, JSON.stringify(err.response.data, null, 2));
    }
    res.status(502).json({
      error: 'EDC data negotiation failed',
      details: err.message,
    });
  }
});

export default router;
