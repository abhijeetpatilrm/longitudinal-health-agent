/**
 * @file src/services/ai/agentWorkflow.ts
 * @description Phase 2 — Fully-wired agentic workflow orchestration.
 *
 * Implements two production-grade workflows:
 *   A. runMealExtraction  — parse free-text notes → structured meals + activity
 *   B. runPlanSuggestion  — deterministic stats + KB citations → Gemini draft plan
 *
 * Both workflows:
 *   1. Screen input with checkInputSafety() BEFORE calling the LLM
 *   2. Screen AI output with checkAiOutputSafety() AFTER
 *   3. Persist a full AgentAuditLog entry (success OR violation)
 *   4. Return polite SAFETY_DISCLAIMER on any block
 */

import { Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

import { aiClient } from '../../config/aiClient';
import { AgentAuditLogModel } from '../../models/AgentAuditLog.model';
import { DailyLogModel } from '../../models/DailyLog.model';
import { HealthPlanModel } from '../../models/HealthPlan.model';
import { UserProfileModel } from '../../models/UserProfile.model';

import {
  checkInputSafety,
  checkAiOutputSafety,
  logSafetyViolation,
  SAFETY_DISCLAIMER,
} from '../../middlewares/safetyFilter';

import {
  calculateWeeklyMonthlySummary,
  calculateTrendDirection,
  detectMissingDataAndInconsistencies,
  calculatePlanAdherence,
  TrendableField,
} from '../health/trendEngine';

import {
  AuditActionType,
  AuditStatus,
  IKnowledgeBaseEntry,
  HealthPlanStatus,
  RecommendationCategory,
} from '../../types';

import { logger } from '../../utils/logger';
import { AppError, NotFoundError } from '../../middlewares/errorHandler';

// ─────────────────────────────────────────────────────────────
// KNOWLEDGE BASE LOADER
// ─────────────────────────────────────────────────────────────

let _knowledgeBase: IKnowledgeBaseEntry[] | null = null;

function loadKnowledgeBase(): IKnowledgeBaseEntry[] {
  if (_knowledgeBase) return _knowledgeBase;
  const kbPath = path.resolve(process.cwd(), 'src/data/knowledgeBase.json');
  const raw = fs.readFileSync(kbPath, 'utf-8');
  _knowledgeBase = JSON.parse(raw) as IKnowledgeBaseEntry[];
  logger.debug('[AgentWorkflow] Knowledge base loaded.', { entries: _knowledgeBase.length });
  return _knowledgeBase;
}

/**
 * Returns the top N knowledge base entries most relevant to the given gap tags.
 * Scoring: +2 per matching tag, +1 per matching applicable_condition.
 */
function queryKnowledgeBase(gapTags: string[], topN = 3): IKnowledgeBaseEntry[] {
  const kb = loadKnowledgeBase();
  const normalised = gapTags.map((t) => t.toLowerCase());

  const scored = kb.map((entry) => {
    const tagScore = entry.tags.filter((t) => normalised.includes(t.toLowerCase())).length * 2;
    const condScore = entry.applicable_conditions.filter((c) =>
      normalised.some((t) => c.toLowerCase().includes(t))
    ).length;
    return { entry, score: tagScore + condScore };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.entry);
}

// ─────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────

export interface ExtractedMeal {
  food_item: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  serving_size_description: string | null;
  is_ai_extracted: true;
  is_user_corrected: false;
}

export interface ExtractedActivity {
  activity_type: string;
  duration_minutes: number;
  notes: string | null;
}

export interface MealExtractionOutput {
  meals: ExtractedMeal[];
  activity: ExtractedActivity | null;
  uncertainty_score: number;
  warnings: string[];
  safety_blocked: boolean;
  disclaimer: string | null;
}

export interface PlanRetrospective {
  trendSummary: ReturnType<typeof calculateWeeklyMonthlySummary>;
  deterministicMetrics: {
    calorie_trend: ReturnType<typeof calculateTrendDirection>;
    weight_trend: ReturnType<typeof calculateTrendDirection>;
    sleep_trend: ReturnType<typeof calculateTrendDirection>;
  };
  adherenceReport: ReturnType<typeof calculatePlanAdherence> | null;
  missingDataAlerts: ReturnType<typeof detectMissingDataAndInconsistencies>;
  proposedPlan: {
    _id: string;
    version_number: number;
    status: HealthPlanStatus;
    target_daily_calories: number;
    target_protein_g: number;
    target_sleep_hours: number;
    target_activity_minutes: number;
    recommendations: Array<{
      category: string;
      suggestion: string;
      rationale: string;
      kb_citation_id: string | null;
    }>;
  };
  rationale: string;
  citations: IKnowledgeBaseEntry[];
  safety_blocked: boolean;
  disclaimer: string | null;
}

// ─────────────────────────────────────────────────────────────
// WORKFLOW A — MEAL EXTRACTION
// ─────────────────────────────────────────────────────────────

/** Shape the LLM must return for meal extraction */
interface RawMealExtractionResult {
  meals: Array<{
    food_item: string;
    estimated_calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size_description: string | null;
  }>;
  activity: {
    activity_type: string;
    duration_minutes: number;
    notes: string | null;
  } | null;
  confidence_notes: string[];
}

const MEAL_EXTRACTION_SYSTEM_PROMPT = `
You are a precision nutrition assistant specialising in USDA/NHS food database knowledge.

Parse the user's free-text note and extract ALL food items and any physical activity mentioned.

Return a single JSON object with this exact structure:
{
  "meals": [
    {
      "food_item": "Scrambled eggs (2 large)",
      "estimated_calories": 182,
      "protein_g": 13.4,
      "carbs_g": 1.8,
      "fats_g": 13.6,
      "serving_size_description": "2 large eggs, scrambled with butter"
    }
  ],
  "activity": {
    "activity_type": "WALKING",
    "duration_minutes": 30,
    "notes": "morning walk"
  } | null,
  "confidence_notes": ["Calorie estimate for coffee is approximate without knowing milk quantity"]
}

Rules:
1. Use USDA Branded Food / FoodData Central as reference for nutritional values
2. Be conservative — when uncertain, use the lower estimate and add a confidence_note
3. activity_type must be one of: WALKING, RUNNING, CYCLING, SWIMMING, STRENGTH_TRAINING, YOGA, HIIT, OTHER
4. If no activity is mentioned, set activity to null
5. Return ONLY the JSON — no markdown, no explanation, no commentary
`.trim();

/**
 * Computes uncertainty score from the extracted meal data.
 * Higher score = less confidence:
 *   - More confidence_notes → higher uncertainty
 *   - Zero macros on a non-zero calorie item → high uncertainty
 *   - More than 8 items → moderate uncertainty (complex meal)
 */
function computeUncertaintyScore(result: RawMealExtractionResult): number {
  let score = 0;

  // Confidence notes penalty
  score += Math.min(result.confidence_notes.length * 0.1, 0.3);

  // Zero-macro items
  const zeroMacroItems = result.meals.filter(
    (m) => m.estimated_calories > 0 && m.protein_g === 0 && m.carbs_g === 0 && m.fats_g === 0
  );
  score += Math.min(zeroMacroItems.length * 0.1, 0.3);

  // Many items = complex, harder to be accurate
  if (result.meals.length > 8) score += 0.1;

  // Very low calories on a meal that should have more
  const suspiciousLow = result.meals.filter(
    (m) => m.estimated_calories > 0 && m.estimated_calories < 10
  );
  score += Math.min(suspiciousLow.length * 0.05, 0.1);

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

/**
 * runMealExtraction — Phase 2 full implementation.
 *
 * @param rawNote  - Free-text user note (e.g. "2 eggs, toast, black coffee, 30 min walk")
 * @param userId   - MongoDB ObjectId string of the logged-in user
 * @param date     - YYYY-MM-DD date string for the log entry
 */
export async function runMealExtraction(
  rawNote: string,
  userId: string,
  date: string
): Promise<MealExtractionOutput> {
  const userObjectId = new Types.ObjectId(userId);
  const startedAt = new Date();

  logger.info('[AgentWorkflow] Starting MEAL_EXTRACTION.', {
    userId,
    date,
    noteLength: rawNote.length,
  });

  // ── 1. Input safety check ────────────────────────────────────
  const inputSafety = checkInputSafety(rawNote);
  if (!inputSafety.safe) {
    await logSafetyViolation({
      user_id: userObjectId,
      action_type: AuditActionType.MEAL_EXTRACTION,
      input_payload: { rawNote, date },
      violations: inputSafety.violations,
    });
    logger.warn('[AgentWorkflow] MEAL_EXTRACTION blocked — unsafe input.', {
      violations: inputSafety.violations.map((v) => v.ruleId),
    });
    return {
      meals: [],
      activity: null,
      uncertainty_score: 1.0,
      warnings: inputSafety.violations.map((v) => v.description),
      safety_blocked: true,
      disclaimer: SAFETY_DISCLAIMER,
    };
  }

  let rawAiOutput: Record<string, unknown> = {};
  let status: AuditStatus = AuditStatus.SUCCESS;
  let errorMessage: string | null = null;
  let uncertaintyScore = 0.5;

  try {
    // ── 2. Call Gemini in JSON mode ───────────────────────────
    const { parsed, raw } = await aiClient.completeWithJsonSchema<RawMealExtractionResult>({
      systemPrompt: MEAL_EXTRACTION_SYSTEM_PROMPT,
      userMessage: rawNote,
      context: { date, userId },
      temperature: 0.1, // Low temp for factual extraction
    });

    rawAiOutput = raw.rawResponse;

    // ── 3. Output safety check ────────────────────────────────
    const outputSafety = checkAiOutputSafety(JSON.stringify(parsed));
    if (!outputSafety.safe) {
      status = AuditStatus.SAFETY_VIOLATION;
      await logSafetyViolation({
        user_id: userObjectId,
        action_type: AuditActionType.MEAL_EXTRACTION,
        input_payload: { rawNote, date },
        violations: outputSafety.violations,
      });
      return {
        meals: [],
        activity: null,
        uncertainty_score: 1.0,
        warnings: outputSafety.violations.map((v) => v.description),
        safety_blocked: true,
        disclaimer: SAFETY_DISCLAIMER,
      };
    }

    // ── 4. Validate and map meals ─────────────────────────────
    const extractedMeals: ExtractedMeal[] = (parsed.meals ?? []).map((m) => ({
      food_item: String(m.food_item ?? 'Unknown item'),
      estimated_calories: Math.max(0, Number(m.estimated_calories) || 0),
      protein_g: Math.max(0, Number(m.protein_g) || 0),
      carbs_g: Math.max(0, Number(m.carbs_g) || 0),
      fats_g: Math.max(0, Number(m.fats_g) || 0),
      serving_size_description: m.serving_size_description
        ? String(m.serving_size_description)
        : null,
      is_ai_extracted: true as const,
      is_user_corrected: false as const,
    }));

    // ── 5. Validate and map activity ──────────────────────────
    const extractedActivity: ExtractedActivity | null = parsed.activity
      ? {
          activity_type: String(parsed.activity.activity_type ?? 'OTHER'),
          duration_minutes: Math.max(0, Number(parsed.activity.duration_minutes) || 0),
          notes: parsed.activity.notes ? String(parsed.activity.notes) : null,
        }
      : null;

    // ── 6. Compute uncertainty score ─────────────────────────
    uncertaintyScore = computeUncertaintyScore(parsed);

    logger.info('[AgentWorkflow] MEAL_EXTRACTION complete.', {
      mealsExtracted: extractedMeals.length,
      activityExtracted: !!extractedActivity,
      uncertaintyScore,
      tokens: raw.usage.totalTokens,
    });

    return {
      meals: extractedMeals,
      activity: extractedActivity,
      uncertainty_score: uncertaintyScore,
      warnings: parsed.confidence_notes ?? [],
      safety_blocked: false,
      disclaimer: null,
    };
  } catch (err) {
    if (status === AuditStatus.SUCCESS) status = AuditStatus.FAILED;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[AgentWorkflow] MEAL_EXTRACTION failed.', { error: errorMessage });
    throw err;
  } finally {
    // Always persist audit log
    if (status !== AuditStatus.SAFETY_VIOLATION) {
      await AgentAuditLogModel.create({
        user_id: userObjectId,
        action_type: AuditActionType.MEAL_EXTRACTION,
        input_payload: { rawNote, date },
        raw_ai_output: rawAiOutput,
        corrected_output: null,
        uncertainty_score: uncertaintyScore,
        status,
        error_message: errorMessage,
        timestamp: startedAt,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// WORKFLOW B — PLAN SUGGESTION
// ─────────────────────────────────────────────────────────────

/** Shape the LLM must return for plan generation */
interface RawPlanRecommendation {
  category: string;
  suggestion: string;
  rationale: string;
  kb_citation_id: string | null;
}

interface RawPlanResult {
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
  recommendations: RawPlanRecommendation[];
  rationale_summary: string;
}

const PLAN_SUGGESTION_SYSTEM_PROMPT = `
You are a longitudinal health coach and registered nutritionist (advisory capacity).
You generate evidence-based, personalised health plans based on a user's tracked data.

You will receive a JSON object containing:
- user_profile: age, gender, health conditions, and current goals
- trend_summary: aggregated weekly/monthly statistics
- adherence_report: compliance with current plan (if any)
- missing_data_alerts: flagged inconsistencies and gaps
- knowledge_base_citations: relevant evidence-based guidelines

Return a single JSON object with this exact structure:
{
  "target_daily_calories": 2100,
  "target_protein_g": 160,
  "target_sleep_hours": 7.5,
  "target_activity_minutes": 45,
  "recommendations": [
    {
      "category": "NUTRITION",
      "suggestion": "Specific, actionable suggestion here",
      "rationale": "Evidence-based explanation citing the provided KB entry",
      "kb_citation_id": "KB-001"
    }
  ],
  "rationale_summary": "One paragraph explaining the overall plan rationale based on the data"
}

Rules:
1. Never prescribe medications or make specific medical diagnoses
2. Base calorie targets on the user's profile and trend data (conservative adjustments only)
3. category must be one of: NUTRITION, ACTIVITY, SLEEP, HYDRATION, MENTAL_HEALTH, MEDICAL
4. Provide exactly 3-5 recommendations prioritised by the biggest identified gaps
5. Reference kb_citation_id from the provided knowledge_base_citations when relevant
6. Return ONLY the JSON — no markdown, no commentary
`.trim();

/**
 * Maps the top adherence gap to KB search tags.
 */
function gapToTags(
  topGap: 'calories' | 'protein' | 'sleep' | 'activity' | 'none',
  hasLowCalories: boolean,
  hasWeightSpike: boolean
): string[] {
  const tags: string[] = [];
  switch (topGap) {
    case 'calories':    tags.push('nutrition', 'caloric_balance', 'weight_management'); break;
    case 'protein':     tags.push('protein', 'satiety', 'body_composition'); break;
    case 'sleep':       tags.push('sleep', 'sleep_hygiene', 'recovery'); break;
    case 'activity':    tags.push('walking', 'exercise', 'aerobic', 'cardiovascular'); break;
    default:            tags.push('general_health', 'mediterranean', 'whole_foods'); break;
  }
  if (hasLowCalories) tags.push('ultra_processed', 'nutrition_quality');
  if (hasWeightSpike) tags.push('metabolic_health');
  return tags;
}

/**
 * runPlanSuggestion — Phase 2 full implementation.
 *
 * @param userId        - MongoDB ObjectId string
 * @param timeFrameDays - How many days of history to analyse (default 14)
 */
export async function runPlanSuggestion(
  userId: string,
  timeFrameDays = 14
): Promise<PlanRetrospective> {
  const userObjectId = new Types.ObjectId(userId);
  const startedAt = new Date();

  logger.info('[AgentWorkflow] Starting PLAN_SUGGESTION.', { userId, timeFrameDays });

  // ── 1. Fetch data from DB ─────────────────────────────────────
  const [user, activePlan] = await Promise.all([
    UserProfileModel.findById(userObjectId).lean(),
    HealthPlanModel.findOne({ user_id: userObjectId, status: HealthPlanStatus.ACTIVE }).lean(),
  ]);

  if (!user) throw new NotFoundError('UserProfile', userId);

  // Fetch logs for the requested time frame
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - timeFrameDays);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const logs = await DailyLogModel.find({
    user_id: userObjectId,
    date: { $gte: cutoffStr },
  }).sort({ date: 1 }).lean();

  const rejectedPlans = await HealthPlanModel.find({
    user_id: userObjectId,
    status: HealthPlanStatus.REJECTED,
  })
    .sort({ version_number: -1 })
    .limit(3)
    .lean();

  if (logs.length === 0) {
    throw new AppError(
      `No daily logs found for user ${userId} in the last ${timeFrameDays} days. Please log some data first.`,
      400,
      'INSUFFICIENT_DATA'
    );
  }

  // ── 2. Deterministic analysis ─────────────────────────────────
  const trendSummary = calculateWeeklyMonthlySummary(logs);

  const deterministicMetrics = {
    calorie_trend: calculateTrendDirection(logs, 'daily_calories' as TrendableField),
    weight_trend: calculateTrendDirection(logs, 'weight_kg' as TrendableField),
    sleep_trend: calculateTrendDirection(logs, 'sleep_hours' as TrendableField),
  };

  const missingDataAlerts = detectMissingDataAndInconsistencies(logs);

  const adherenceReport = activePlan
    ? calculatePlanAdherence(activePlan, logs)
    : null;

  // ── 3. KB lookup based on gaps ────────────────────────────────
  const topGap = adherenceReport?.top_gap ?? 'none';
  const hasLowCalories = missingDataAlerts.flags.some((f) => f.type === 'LOW_CALORIE');
  const hasWeightSpike = missingDataAlerts.flags.some((f) => f.type === 'WEIGHT_SPIKE');
  const gapTags = gapToTags(topGap as 'calories' | 'protein' | 'sleep' | 'activity' | 'none', hasLowCalories, hasWeightSpike);
  const citations = queryKnowledgeBase(gapTags, 3);

  logger.debug('[AgentWorkflow] KB citations selected.', {
    gapTags,
    citations: citations.map((c) => c.id),
  });

  // ── 4. Build LLM input ────────────────────────────────────────
  const llmInput = {
    user_profile: {
      age: user.age,
      gender: user.gender,
      health_conditions: user.health_conditions,
      baseline_goals: user.baseline_goals,
    },
    trend_summary: {
      days_analysed: logs.length,
      date_range: trendSummary.date_range,
      overall: trendSummary.overall,
      calorie_trend: deterministicMetrics.calorie_trend.direction,
      weight_trend: deterministicMetrics.weight_trend.direction,
      sleep_trend: deterministicMetrics.sleep_trend.direction,
      missing_days_count: missingDataAlerts.missing_days.length,
      data_flags: missingDataAlerts.flags.map((f) => ({
        type: f.type,
        date: f.date,
        severity: f.severity,
      })),
    },
    adherence_report: adherenceReport
      ? {
          plan_version: adherenceReport.plan_version,
          avg_calorie_adherence_pct: adherenceReport.avg_calorie_adherence_pct,
          avg_protein_adherence_pct: adherenceReport.avg_protein_adherence_pct,
          avg_sleep_adherence_pct: adherenceReport.avg_sleep_adherence_pct,
          avg_activity_adherence_pct: adherenceReport.avg_activity_adherence_pct,
          top_gap: adherenceReport.top_gap,
        }
      : null,
    knowledge_base_citations: citations.map((c) => ({
      id: c.id,
      category: c.category,
      title: c.title,
      evidence_summary: c.evidence_summary,
    })),
    current_plan_targets: activePlan
      ? {
          daily_calories: activePlan.target_daily_calories,
          protein_g: activePlan.target_protein_g,
          sleep_hours: activePlan.target_sleep_hours,
          activity_minutes: activePlan.target_activity_minutes,
        }
      : null,
    recent_rejected_plans: rejectedPlans.map((plan) => ({
      plan_id: plan._id.toString(),
      version_number: plan.version_number,
      rejection_reason: plan.rejectionReason ?? plan.user_feedback ?? null,
      status: plan.status,
      active_from: plan.active_from ? plan.active_from.toISOString() : null,
      active_until: plan.active_until ? plan.active_until.toISOString() : null,
    })),
  };

  // ── 5. Input safety check on the note (if any free-text) ─────
  // (LLM input is system-constructed JSON, so we skip checkInputSafety here)

  let rawAiOutput: Record<string, unknown> = {};
  let status: AuditStatus = AuditStatus.SUCCESS;
  let errorMessage: string | null = null;

  try {
    // ── 6. Call Gemini in JSON mode ─────────────────────────────
    const { parsed: planResult, raw } = await aiClient.completeWithJsonSchema<RawPlanResult>({
      systemPrompt: PLAN_SUGGESTION_SYSTEM_PROMPT,
      userMessage: JSON.stringify(llmInput, null, 2),
      context: {
        recent_rejected_plans: llmInput.recent_rejected_plans,
        rejection_notes: rejectedPlans
          .map((plan) => plan.rejectionReason ?? plan.user_feedback ?? null)
          .filter((note): note is string => Boolean(note)),
      },
      temperature: 0.3,
    });

    rawAiOutput = raw.rawResponse;

    // ── 7. Output safety check ──────────────────────────────────
    const outputSafety = checkAiOutputSafety(JSON.stringify(planResult));
    if (!outputSafety.safe) {
      status = AuditStatus.SAFETY_VIOLATION;
      await logSafetyViolation({
        user_id: userObjectId,
        action_type: AuditActionType.PLAN_SUGGESTION,
        input_payload: { userId, timeFrameDays },
        violations: outputSafety.violations,
      });
      // Return a safe retrospective with blocked plan
      const safeRetro: PlanRetrospective = {
        trendSummary,
        deterministicMetrics,
        adherenceReport,
        missingDataAlerts,
        proposedPlan: {
          _id: '',
          version_number: 0,
          status: HealthPlanStatus.DRAFT,
          target_daily_calories: user.baseline_goals.target_daily_calories,
          target_protein_g: user.baseline_goals.target_protein_g,
          target_sleep_hours: user.baseline_goals.target_sleep_hours,
          target_activity_minutes: user.baseline_goals.target_activity_minutes_per_day,
          recommendations: [],
        },
        rationale: SAFETY_DISCLAIMER,
        citations,
        safety_blocked: true,
        disclaimer: SAFETY_DISCLAIMER,
      };
      return safeRetro;
    }

    // ── 8. Validate plan result fields ──────────────────────────
    const targetCalories = Math.max(800, Number(planResult.target_daily_calories) || user.baseline_goals.target_daily_calories);
    const targetProtein  = Math.max(30,  Number(planResult.target_protein_g)       || user.baseline_goals.target_protein_g);
    const targetSleep    = Math.min(10, Math.max(5, Number(planResult.target_sleep_hours) || user.baseline_goals.target_sleep_hours));
    const targetActivity = Math.max(15, Number(planResult.target_activity_minutes) || user.baseline_goals.target_activity_minutes_per_day);

    const recommendations = (planResult.recommendations ?? []).map((r) => ({
      category: Object.values(RecommendationCategory).includes(r.category as RecommendationCategory)
        ? (r.category as RecommendationCategory)
        : RecommendationCategory.NUTRITION,
      suggestion: String(r.suggestion ?? ''),
      rationale:  String(r.rationale ?? ''),
      kb_citation_id: r.kb_citation_id ? String(r.kb_citation_id) : null,
    }));

    // ── 9. Persist new DRAFT HealthPlan ─────────────────────────
    const newPlan = await HealthPlanModel.create({
      user_id: userObjectId,
      version_number: 1, // pre-save hook auto-increments
      status: HealthPlanStatus.DRAFT,
      target_daily_calories: targetCalories,
      target_protein_g: targetProtein,
      target_sleep_hours: targetSleep,
      target_activity_minutes: targetActivity,
      recommendations,
      active_from: null,
      active_until: null,
      user_feedback: null,
      rejectionReason: null,
    });

    logger.info('[AgentWorkflow] PLAN_SUGGESTION complete — DRAFT plan created.', {
      planId: newPlan._id.toString(),
      planVersion: newPlan.version_number,
      recommendationCount: recommendations.length,
      tokens: raw.usage.totalTokens,
    });

    return {
      trendSummary,
      deterministicMetrics,
      adherenceReport,
      missingDataAlerts,
      proposedPlan: {
        _id: newPlan._id.toString(),
        version_number: newPlan.version_number,
        status: HealthPlanStatus.DRAFT,
        target_daily_calories: targetCalories,
        target_protein_g: targetProtein,
        target_sleep_hours: targetSleep,
        target_activity_minutes: targetActivity,
        recommendations,
      },
      rationale: String(planResult.rationale_summary ?? ''),
      citations,
      safety_blocked: false,
      disclaimer: null,
    };
  } catch (err) {
    if (status === AuditStatus.SUCCESS) status = AuditStatus.FAILED;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[AgentWorkflow] PLAN_SUGGESTION failed.', { error: errorMessage });
    throw err;
  } finally {
    if (status !== AuditStatus.SAFETY_VIOLATION) {
      await AgentAuditLogModel.create({
        user_id: userObjectId,
        action_type: AuditActionType.PLAN_SUGGESTION,
        input_payload: { userId, timeFrameDays, logsAnalysed: logs.length },
        raw_ai_output: rawAiOutput,
        corrected_output: null,
        uncertainty_score: 0.3, // Plan suggestion is lower uncertainty than meal extraction
        status,
        error_message: errorMessage,
        timestamp: startedAt,
      });
    }
  }
}
