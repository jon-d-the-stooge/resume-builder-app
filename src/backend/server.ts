/**
 * Express server setup - main entry point for the backend API server.
 * Configures Express middleware, mounts routes, and starts the HTTP server.
 * This will serve as the web-based API alternative to Electron IPC.
 */

// Load and validate environment configuration (fails fast on missing required vars)
import { config } from './config';

import express, { Application } from 'express';
import cors from 'cors';
import vaultsRouter from './routes/vaults';
import jobsRouter from './routes/jobs';
import applicationsRouter from './routes/applications';
import knowledgeBaseRouter from './routes/knowledgeBase';
import settingsRouter from './routes/settings';
import contentRouter from './routes/content';
import aiRouter from './routes/ai';
import adminRouter from './routes/admin';
import usageRouter from './routes/usage';
import { rateLimiter } from './middleware/rateLimiter';
import { authenticateRequest } from './middleware/auth';

const app: Application = express();

// CORS configuration - allow all localhost origins in development
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      return callback(null, true);
    }
    // Allow any localhost origin (any port)
    if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint (unauthenticated - for load balancers/monitoring)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Apply authentication to all /api routes below this point
app.use('/api', authenticateRequest);

// Current user endpoint - returns the authenticated user
app.get('/api/me', (req, res) => {
  res.json(req.user);
});

// Routes
app.use('/api/vaults', vaultsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/knowledge-base', knowledgeBaseRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/content', contentRouter);
app.use('/api/ai', rateLimiter, aiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/usage', usageRouter);

// Start function
export const start = (): void => {
  app.listen(config.server.port, () => {
    console.log(`Server listening on port ${config.server.port}`);
  });
};

// Start server when run directly
if (require.main === module) {
  start();
}

export default app;
