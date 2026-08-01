/**
 * @file src/config/env.ts
 * @description Typed environment variable loader & validator.
 *              Throws on startup if required vars are missing.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value !== undefined && value.trim() !== '' ? value.trim() : defaultValue;
}

function parseIntEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = parseInt(raw.trim(), 10);
  if (isNaN(parsed)) {
    throw new Error(`[Config] Environment variable ${key} must be a valid integer. Got: "${raw}"`);
  }
  return parsed;
}

function parseFloatEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const parsed = parseFloat(raw.trim());
  if (isNaN(parsed)) {
    throw new Error(`[Config] Environment variable ${key} must be a valid float. Got: "${raw}"`);
  }
  return parsed;
}

export type NodeEnv = 'development' | 'production' | 'test';

export interface AppConfig {
  port: number;
  nodeEnv: NodeEnv;
  mongodb: {
    uri: string;
  };
  ai: {
    provider: string;
    apiKey: string;
    modelName: string;
    maxTokens: number;
    temperature: number;
  };
  logging: {
    level: string;
    dir: string;
  };
  security: {
    corsOrigin: string;
    jwtSecret: string;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

function validateNodeEnv(value: string): NodeEnv {
  const allowed: NodeEnv[] = ['development', 'production', 'test'];
  if (!allowed.includes(value as NodeEnv)) {
    throw new Error(
      `[Config] NODE_ENV must be one of: ${allowed.join(', ')}. Got: "${value}"`
    );
  }
  return value as NodeEnv;
}

function loadConfig(): AppConfig {
  const nodeEnvRaw = optionalEnv('NODE_ENV', 'development');
  const aiProvider = optionalEnv('AI_PROVIDER', 'gemini');

  // Determine which key to require based on provider
  const aiKeyEnvVar =
    aiProvider === 'openai'
      ? 'OPENAI_API_KEY'
      : aiProvider === 'anthropic'
      ? 'ANTHROPIC_API_KEY'
      : 'GEMINI_API_KEY';

  return {
    port: parseIntEnv('PORT', 3000),
    nodeEnv: validateNodeEnv(nodeEnvRaw),
    mongodb: {
      uri: requireEnv('MONGODB_URI'),
    },
    ai: {
      provider: aiProvider,
      // Offline mode doesn't need a real API key
      apiKey: aiProvider === 'offline' ? 'offline' : requireEnv(aiKeyEnvVar),
      modelName: optionalEnv('AI_MODEL_NAME', 'gemini-1.5-pro'),
      maxTokens: parseIntEnv('AI_MAX_TOKENS', 4096),
      temperature: parseFloatEnv('AI_TEMPERATURE', 0.3),
    },
    logging: {
      level: optionalEnv('LOG_LEVEL', 'debug'),
      dir: optionalEnv('LOG_DIR', 'logs'),
    },
    security: {
      corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),
      jwtSecret: requireEnv('JWT_SECRET'),
    },
    rateLimit: {
      windowMs: parseIntEnv('RATE_LIMIT_WINDOW_MS', 60000),
      max: parseIntEnv('RATE_LIMIT_MAX', 100),
    },
  };
}

// Export singleton config — validated at import time
export const config: AppConfig = loadConfig();
