/** API router. Everything below is mounted under /api. */
import { Router } from 'express';
import authRoutes from './authRoutes.js';
import complaintRoutes from './complaintRoutes.js';
import departmentRoutes from './departmentRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';

const router = Router();

// Mirrors the root /health probe. Serverless platforms route by path prefix,
// so a check under /api is the one guaranteed to reach this router.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

router.use('/auth', authRoutes);
router.use('/complaints', complaintRoutes);
router.use('/departments', departmentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);

export default router;
