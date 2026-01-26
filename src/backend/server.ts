/**
 * Express server setup - main entry point for the backend API server.
 * Configures Express middleware, mounts routes, and starts the HTTP server.
 * This will serve as the web-based API alternative to Electron IPC.
 */

import express, { Application } from 'express';
import cors from 'cors';
import vaultsRouter from './routes/vaults';
import jobsRouter from './routes/jobs';
import applicationsRouter from './routes/applications';
import knowledgeBaseRouter from './routes/knowledgeBase';
import settingsRouter from './routes/settings';
import contentRouter from './routes/content';
import aiRouter from './routes/ai';

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/vaults', vaultsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/knowledge-base', knowledgeBaseRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/content', contentRouter);
app.use('/api/ai', aiRouter);

// Start function
export const start = (): void => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

// Start server when run directly
if (require.main === module) {
  start();
}

export default app;
