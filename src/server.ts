/**
 * @file src/server.ts
 * @description HTTP server entry point.
 *              Connects to MongoDB, creates the Express app, and starts listening.
 */

import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { config } from './config/env';
import { logger } from './utils/logger';

const PORT = config.port;

async function bootstrap(): Promise<void> {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 2. Create Express app
    const app = createApp();

    // 3. Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`[Server] 🚀 Longitudinal Health Agent API is running.`, {
        port: PORT,
        environment: config.nodeEnv,
        url: `http://localhost:${PORT}`,
        health: `http://localhost:${PORT}/health`,
      });
    });

    // ─── Graceful Shutdown ──────────────────────────────────

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`[Server] Received ${signal}. Starting graceful shutdown…`);

      server.close(async () => {
        logger.info('[Server] HTTP server closed.');
        await disconnectDatabase();
        logger.info('[Server] Graceful shutdown complete. Exiting.');
        process.exit(0);
      });

      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        logger.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('[Server] Unhandled promise rejection.', { reason });
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error('[Server] Uncaught exception. Exiting.', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[Server] Failed to bootstrap application.', { error: message });
    process.exit(1);
  }
}

void bootstrap();
