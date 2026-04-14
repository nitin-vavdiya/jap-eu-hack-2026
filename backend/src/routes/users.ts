import { Router } from 'express';
import prisma from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /users/me
 * Returns JWT claims from the Bearer token plus the CompanyUser DB record
 * (including company summary and role) if one exists for this user.
 */
router.get('/me', authenticate, async (req, res) => {
  const companyUser = await prisma.companyUser.findUnique({
    where: { keycloakId: req.user!.sub },
    include: {
      role: true,
      company: { select: { id: true, name: true, did: true } },
    },
  });
  res.json({
    sub: req.user!.sub,
    email: req.user!.email,
    preferredUsername: req.user!.preferred_username,
    givenName: req.user!.given_name,
    familyName: req.user!.family_name,
    roles: req.user!.realm_access?.roles ?? [],
    companyUser: companyUser ?? null,
  });
});

export default router;
