/**
 * @file src/middlewares/safetyFilter.ts
 * @description Multi-layer AI safety guardrail system.
 *
 * Phase 2 additions:
 *   - `checkInputSafety(text)` — screens USER INPUT before calling LLM
 *   - `CRASH_DIET` rule (< 800 kcal/day in AI output)
 *   - `SAFETY_DISCLAIMER` — standardised polite response constant
 *   - `buildSafetyViolationAuditPayload()` — audit log payload builder
 *   - `logSafetyViolation()` — one-call helper for agentWorkflow
 */

import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';
import { SafetyViolationError } from './errorHandler';
import { AgentAuditLogModel } from '../models/AgentAuditLog.model';
import { AuditActionType, AuditStatus } from '../types';

// ─────────────────────────────────────────────────────────────
// SAFETY RULES
// ─────────────────────────────────────────────────────────────

interface SafetyRule {
  id: string;
  description: string;
  pattern: RegExp;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** If true, this rule applies to user INPUT as well as AI output */
  checkInput: boolean;
}

/**
 * Unified rule set applied to both user input (checkInput: true) and AI output.
 *
 * Ordering: CRITICAL rules are checked first so the most dangerous violations
 * surface immediately.
 */
const SAFETY_RULES: SafetyRule[] = [
  // ── Crash diet — NEW Phase 2 ──────────────────────────────
  {
    id: 'CRASH_DIET',
    description: 'AI recommending calorie intake below 800 kcal/day',
    // Matches "600 calories", "750 kcal", "500-calorie diet", etc.
    pattern: /\b([1-7]\d{2})\s*(cal(?:ories?)?|kcal)(?:\s*(?:\/|per)\s*day)?\b/i,
    severity: 'CRITICAL',
    checkInput: false,
  },

  // ── Medication / prescription ─────────────────────────────
  {
    id: 'MEDICATION_PRESCRIBE',
    description: 'Agent prescribing specific medications',
    pattern:
      /\b(prescribe|take\s+\d+\s*mg|dosage\s+of|metformin|ozempic|semaglutide|wegovy|insulin|lisinopril|atorvastatin)\b/i,
    severity: 'CRITICAL',
    checkInput: true,
  },

  // ── Medical diagnosis ─────────────────────────────────────
  {
    id: 'DIAGNOSIS',
    description: 'Agent making or confirming medical diagnoses',
    pattern:
      /\b(you\s+have|diagnosed\s+with|you\s+are\s+suffering\s+from|you\s+likely\s+have|you\s+may\s+have)\b.{0,60}\b(diabetes|cancer|heart\s+disease|anemia|hypertension|hypothyroidism|celiac|crohn)\b/i,
    severity: 'HIGH',
    checkInput: true,
  },

  // ── Disordered eating ─────────────────────────────────────
  {
    id: 'PURGING_ADVICE',
    description: 'Advice promoting disordered eating behaviours',
    pattern:
      /\b(purge|vomit after|use\s+laxatives?|restrict\s+to\s+zero|fast\s+for\s+\d+\s*days|starvation\s+diet|eat\s+nothing)\b/i,
    severity: 'CRITICAL',
    checkInput: true,
  },

  // ── Supplement overdose ───────────────────────────────────
  {
    id: 'SUPPLEMENT_OVERDOSE',
    description: 'Recommending dangerous supplement quantities',
    pattern: /\b(\d{4,}\s*(mg|iu|mcg|μg))\b/i,
    severity: 'HIGH',
    checkInput: false,
  },

  // ── Extreme calorie range (< 500 in output) ───────────────
  {
    id: 'EXTREME_RESTRICTION',
    description: 'Extremely low calorie recommendations (< 500 kcal)',
    pattern: /\b([1-4]\d{2})\s*(cal(?:ories?)?|kcal)\b/i,
    severity: 'CRITICAL',
    checkInput: false,
  },

  // ── Prompt injection attempts ─────────────────────────────
  {
    id: 'PROMPT_INJECTION',
    description: 'Potential LLM prompt injection in user input',
    pattern:
      /\b(ignore\s+(?:previous|all|your)\s+instructions?|disregard\s+(?:the\s+)?system\s+prompt|you\s+are\s+now|pretend\s+(?:you\s+are|to\s+be)|act\s+as\s+(?:a\s+)?different|jailbreak)\b/i,
    severity: 'HIGH',
    checkInput: true,
  },

  // ── Clinical treatment claims ─────────────────────────────
  {
    id: 'UNVERIFIED_TREATMENT',
    description: 'Unverified clinical treatment claims',
    pattern:
      /\b(this\s+will\s+cure|guaranteed\s+to\s+treat|clinically\s+proven\s+to\s+reverse|miracle\s+(?:cure|treatment))\b/i,
    severity: 'HIGH',
    checkInput: false,
  },
];

// ─────────────────────────────────────────────────────────────
// DISCLAIMER CONSTANT
// ─────────────────────────────────────────────────────────────

/**
 * Standard polite safety disclaimer returned to the client when a
 * CRITICAL or HIGH safety violation is detected.
 */
export const SAFETY_DISCLAIMER =
  'I cannot provide medical diagnoses, prescribe treatments or medications, ' +
  'or recommend extreme dietary restrictions. For personalised medical advice, ' +
  'please consult a qualified healthcare professional. I can help with general ' +
  'evidence-based nutrition guidance, activity planning, and lifestyle tips.';

// ─────────────────────────────────────────────────────────────
// CORE SAFETY CHECK FUNCTIONS
// ─────────────────────────────────────────────────────────────

export interface SafetyViolation {
  ruleId: string;
  description: string;
  severity: SafetyRule['severity'];
}

export interface SafetyCheckResult {
  safe: boolean;
  violations: SafetyViolation[];
}

/**
 * Checks AI OUTPUT text against the full rule set.
 */
export function checkAiOutputSafety(text: string): SafetyCheckResult {
  const violations = SAFETY_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => ({
    ruleId: rule.id,
    description: rule.description,
    severity: rule.severity,
  }));
  return { safe: violations.length === 0, violations };
}

/**
 * Checks USER INPUT text against rules marked `checkInput: true`.
 * Called before sending anything to the LLM.
 */
export function checkInputSafety(text: string): SafetyCheckResult {
  const violations = SAFETY_RULES.filter((rule) => rule.checkInput && rule.pattern.test(text)).map(
    (rule) => ({
      ruleId: rule.id,
      description: rule.description,
      severity: rule.severity,
    })
  );
  return { safe: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────
// AUDIT LOG HELPERS
// ─────────────────────────────────────────────────────────────

export interface SafetyViolationAuditPayload {
  user_id: Types.ObjectId;
  action_type: AuditActionType;
  input_payload: Record<string, unknown>;
  violations: SafetyViolation[];
}

/**
 * Builds the payload for AgentAuditLog when a safety violation occurs.
 */
export function buildSafetyViolationAuditPayload(data: SafetyViolationAuditPayload): {
  user_id: Types.ObjectId;
  action_type: AuditActionType;
  input_payload: Record<string, unknown>;
  raw_ai_output: Record<string, unknown>;
  corrected_output: null;
  uncertainty_score: number;
  status: AuditStatus;
  error_message: string;
  timestamp: Date;
} {
  return {
    user_id: data.user_id,
    action_type: data.action_type,
    input_payload: data.input_payload,
    raw_ai_output: {
      blocked: true,
      violations: data.violations,
      disclaimer: SAFETY_DISCLAIMER,
    },
    corrected_output: null,
    uncertainty_score: 1.0, // Maximum uncertainty — blocked output
    status: AuditStatus.SAFETY_VIOLATION,
    error_message: `Safety violations detected: ${data.violations.map((v) => v.ruleId).join(', ')}`,
    timestamp: new Date(),
  };
}

/**
 * Persists a SAFETY_VIOLATION audit log entry in one call.
 * Used by agentWorkflow.ts when input or output is blocked.
 */
export async function logSafetyViolation(data: SafetyViolationAuditPayload): Promise<void> {
  try {
    await AgentAuditLogModel.create(buildSafetyViolationAuditPayload(data));
    logger.warn('[Safety] SAFETY_VIOLATION audit entry persisted.', {
      userId: data.user_id.toString(),
      actionType: data.action_type,
      violations: data.violations.map((v) => v.ruleId),
    });
  } catch (err) {
    logger.error('[Safety] Failed to persist safety violation audit log.', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// EXPRESS MIDDLEWARE
// ─────────────────────────────────────────────────────────────

/**
 * Express middleware that reads `res.locals.aiOutput` (string) and
 * runs the full output safety check.
 * Attach `res.locals.aiOutput` in your service before this runs.
 */
export function safetyFilterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const aiOutput = res.locals['aiOutput'] as string | undefined;

  if (!aiOutput) {
    next();
    return;
  }

  const result = checkAiOutputSafety(aiOutput);
  res.locals['safetyResult'] = result;

  const criticalViolations = result.violations.filter((v) => v.severity === 'CRITICAL');

  if (criticalViolations.length > 0) {
    logger.warn('[Safety] CRITICAL output violation — blocking response.', {
      path: req.path,
      violations: criticalViolations.map((v) => v.ruleId),
    });
    next(new SafetyViolationError(SAFETY_DISCLAIMER, criticalViolations));
    return;
  }

  if (result.violations.length > 0) {
    logger.warn('[Safety] Non-critical safety flags in AI output.', {
      path: req.path,
      violations: result.violations.map((v) => v.ruleId),
    });
  }

  next();
}

/**
 * Express middleware that reads `req.body.rawNote` (or `req.body.notes`)
 * and runs input safety checks before any LLM call.
 */
export function inputSafetyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const body = req.body as Record<string, unknown>;
  const text =
    (typeof body['rawNote'] === 'string' ? body['rawNote'] : null) ??
    (typeof body['notes'] === 'string' ? body['notes'] : null) ??
    '';

  if (!text) {
    next();
    return;
  }

  const result = checkInputSafety(text);

  if (!result.safe) {
    const highSeverity = result.violations.filter(
      (v) => v.severity === 'CRITICAL' || v.severity === 'HIGH'
    );
    if (highSeverity.length > 0) {
      logger.warn('[Safety] Unsafe user input detected — blocking before LLM call.', {
        path: req.path,
        violations: highSeverity.map((v) => v.ruleId),
      });
      next(new SafetyViolationError(SAFETY_DISCLAIMER, highSeverity));
      return;
    }
  }

  next();
}
