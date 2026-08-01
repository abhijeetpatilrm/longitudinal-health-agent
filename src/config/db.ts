/**
 * @file src/config/db.ts
 * @description MongoDB connection management via Mongoose.
 *              Handles connect / disconnect with structured logging.
 */

import mongoose from 'mongoose';
import { config } from './env';
import { logger } from '../utils/logger';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    logger.debug('[DB] Already connected to MongoDB.');
    return;
  }

  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    } as mongoose.ConnectOptions);

    isConnected = true;
    logger.info('[DB] Successfully connected to MongoDB.', {
      uri: config.mongodb.uri.replace(/\/\/.*@/, '//<credentials>@'),
    });

    mongoose.connection.on('error', (err: Error) => {
      logger.error('[DB] MongoDB connection error.', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('[DB] MongoDB disconnected.');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      logger.info('[DB] MongoDB reconnected.');
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[DB] Failed to connect to MongoDB.', { error: message });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('[DB] Disconnected from MongoDB.');
}

export function getConnectionState(): string {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'unknown';
}
