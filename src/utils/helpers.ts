/**
 * @file src/utils/helpers.ts
 * @description Common utility functions used across the application.
 */

import { Types } from 'mongoose';

/**
 * Check whether a string is a valid MongoDB ObjectId.
 */
export function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

/**
 * Convert a string to a Mongoose ObjectId — throws if invalid.
 */
export function toObjectId(id: string): Types.ObjectId {
  if (!isValidObjectId(id)) {
    throw new Error(`Invalid ObjectId: "${id}"`);
  }
  return new Types.ObjectId(id);
}

/**
 * Format a Date to ISO date string YYYY-MM-DD (UTC).
 */
export function toISODateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a YYYY-MM-DD string and return a UTC-midnight Date.
 * Throws if the format is invalid.
 */
export function parseISODate(dateStr: string): Date {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date value: "${dateStr}".`);
  }
  return date;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate the average of a numeric array. Returns null for empty arrays.
 */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Round a number to N decimal places.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Generate an array of YYYY-MM-DD strings for the last N days (inclusive of today).
 */
export function lastNDays(n: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(toISODateString(d));
  }
  return days;
}

/**
 * Safely parse a JSON string, returning null on failure.
 */
export function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove undefined keys from an object (shallow).
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
