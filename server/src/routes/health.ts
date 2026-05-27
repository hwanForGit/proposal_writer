import { Router } from 'express';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'proposal-writer-server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
