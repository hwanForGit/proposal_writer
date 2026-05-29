import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { filesRouter } from './routes/files.js';
import { outlineRouter } from './routes/outline.js';
import { bodyRouter } from './routes/body.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRouter);
app.use('/api', filesRouter);
app.use('/api', outlineRouter);
app.use('/api', bodyRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(
    `[server] listening on http://localhost:${config.port} (env=${config.nodeEnv})`,
  );
});
