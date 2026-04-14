import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { transformDppToJaspar } from '../services/underwriting/dpp-to-jaspar-transformer';
import { calculateInsuranceScore } from '../services/underwriting/insurance-scoring-engine';
import { recommendPackage } from '../services/underwriting/package-recommendation-engine';

const router = Router();

/**
 * POST /api/underwriting/transform-and-score
 *
 * Accepts a vehicle data payload (DPP format from EDC exchange),
 * transforms it to the JASPAR-like insurer schema, scores it, and
 * returns the full underwriting result.
 *
 * Does NOT persist until /confirm is called.
 */
router.post('/transform-and-score', requireRole('insurance_agent'), async (req, res) => {
  const { vin, sourceData } = req.body;

  if (!vin || !sourceData) {
    return res.status(400).json({ error: 'vin and sourceData are required' });
  }

  // Transform
  const { jaspar, report } = transformDppToJaspar(sourceData, 'EDC');

  // Score
  const scoreResult = calculateInsuranceScore(jaspar);

  // Package recommendation
  const packageRecommendation = recommendPackage(scoreResult);

  // Create a pending run record
  const runId = uuidv4();
  await prisma.underwritingTransformationRun.create({
    data: {
      id: runId,
      vin,
      sourceProfile: report.sourceProfile,
      targetProfile: report.targetProfile,
      sourcePayload: sourceData as any,
      transformedPayload: jaspar as any,
      transformationReport: report as any,
      completenessPercent: report.completenessPercent,
      totalScore: scoreResult.totalScore,
      scoreBand: scoreResult.scoreBand.id,
      factorScores: scoreResult.factorScores as any,
      recommendedPackageId: packageRecommendation.packageId,
      recommendationReason: packageRecommendation.recommendationReason,
      status: 'pending',
    },
  });

  res.json({
    runId,
    jasparPayload: jaspar,
    transformationReport: report,
    scoreResult: {
      totalScore: scoreResult.totalScore,
      maxPossibleScore: scoreResult.maxPossibleScore,
      percentageScore: scoreResult.percentageScore,
      scoreBand: scoreResult.scoreBand,
      factorScores: scoreResult.factorScores,
      isEV: scoreResult.isEV,
    },
    packageRecommendation,
  });
});

/**
 * POST /api/underwriting/confirm
 *
 * Marks a pending transformation run as confirmed (insurer accepted).
 * Call this only after the user has reviewed and accepted the recommendation.
 */
router.post('/confirm', authenticate, async (req, res) => {
  const { runId } = req.body;

  if (!runId) {
    return res.status(400).json({ error: 'runId is required' });
  }

  const run = await prisma.underwritingTransformationRun.findUnique({ where: { id: runId } });
  if (!run) return res.status(404).json({ error: 'Transformation run not found' });
  if (run.status === 'confirmed') return res.json({ message: 'Already confirmed', run });

  const updated = await prisma.underwritingTransformationRun.update({
    where: { id: runId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });

  res.json({ message: 'Transformation run confirmed', run: updated });
});

/**
 * GET /api/underwriting/:vin
 *
 * Returns the latest confirmed underwriting run for a VIN.
 */
router.get('/:vin', authenticate, async (req, res) => {
  const run = await prisma.underwritingTransformationRun.findFirst({
    where: { vin: req.params.vin, status: 'confirmed' },
    orderBy: { createdAt: 'desc' },
  });
  if (!run) return res.status(404).json({ error: 'No confirmed underwriting run found for this VIN' });
  res.json(run);
});

export default router;
