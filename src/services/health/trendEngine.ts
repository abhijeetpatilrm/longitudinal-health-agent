/**
 * @file src/services/health/trendEngine.ts
 * @description Deterministic math & trend analysis engine.
 *              Pure functions — no side effects, no DB or AI calls.
 *              Zero `any` usage. All inputs & outputs are fully typed.
 *
 * Phase 1 functions (preserved):
 *   summariseMeals, buildDailyNutritionSummaries, estimateTDEE,
 *   calculateCalorieBalance, computeTrendMetrics, computeNutritionAdherence
 *
 * Phase 2 additions:
 *   calculateWeeklyMonthlySummary, calculateTrendDirection,
 *   detectMissingDataAndInconsistencies, calculatePlanAdherence
 */

import { IDailyLog, IHealthPlan, IMeal, IActivity } from '../../types';
import { average, roundTo, toISODateString, parseISODate } from '../../utils/helpers';

// ─────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────

export interface DailyNutritionSummary {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fats_g: number;
  meal_count: number;
}

export interface TrendMetrics {
  avg_daily_calories: number | null;
  avg_daily_protein_g: number | null;
  avg_sleep_hours: number | null;
  avg_mood_energy_score: number | null;
  avg_activity_minutes: number | null;
  avg_weight_kg: number | null;
  calorie_trend: TrendDirection;
  weight_trend: TrendDirection;
  sleep_compliance_pct: number | null;
  activity_compliance_pct: number | null;
}

export interface CalorieBalance {
  intake_calories: number;
  burned_calories: number;
  net_calories: number;
  tdee_estimate: number | null;
}

export interface NutritionAdherence {
  calorie_adherence_pct: number;
  protein_adherence_pct: number;
  overall_adherence_pct: number;
}

export type TrendDirection = 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';

// ─────────────────────────────────────────────────────────────
// PHASE 2 TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Period summary for weekly or monthly breakdown.
 */
export interface PeriodSummary {
  period_label: string;        // e.g. "Week 1 (2026-07-18 – 2026-07-24)" or "July 2026"
  start_date: string;
  end_date: string;
  log_count: number;
  avg_daily_calories: number | null;
  avg_protein_g: number | null;
  avg_carbs_g: number | null;
  avg_fats_g: number | null;
  avg_sleep_hours: number | null;
  total_step_count: number;
  avg_step_count: number | null;
  weight_start_kg: number | null;
  weight_end_kg: number | null;
  weight_delta_kg: number | null;
  avg_mood_score: number | null;
}

export interface WeeklyMonthlySummary {
  total_days_logged: number;
  date_range: { start: string; end: string };
  weekly_summaries: PeriodSummary[];
  monthly_summaries: PeriodSummary[];
  overall: {
    avg_daily_calories: number | null;
    avg_protein_g: number | null;
    avg_sleep_hours: number | null;
    total_step_count: number;
    net_weight_delta_kg: number | null;
  };
}

export interface MissingDataFlag {
  type: 'MISSING_DAY' | 'WEIGHT_SPIKE' | 'LOW_CALORIE' | 'CALORIE_BURN_EXTREME';
  date: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface DataInconsistencyReport {
  missing_days: string[];
  flags: MissingDataFlag[];
  total_issues: number;
  has_critical_gaps: boolean;
}

export interface DayAdherence {
  date: string;
  calorie_adherence_pct: number;
  protein_adherence_pct: number;
  sleep_adherence_pct: number;
  activity_adherence_pct: number;
  overall_adherence_pct: number;
}

export interface PlanAdherenceReport {
  plan_version: number;
  days_analysed: number;
  daily_breakdown: DayAdherence[];
  avg_calorie_adherence_pct: number | null;
  avg_protein_adherence_pct: number | null;
  avg_sleep_adherence_pct: number | null;
  avg_activity_adherence_pct: number | null;
  avg_overall_adherence_pct: number | null;
  top_gap: 'calories' | 'protein' | 'sleep' | 'activity' | 'none';
}

// ─────────────────────────────────────────────────────────────
// INTERNAL MATH HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Least-squares linear regression slope over an array of y values.
 * Returns null if fewer than 2 data points.
 */
function linearSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;

  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = values.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * (values[i] ?? 0), 0);
  const sumXX = x.reduce((s, xi) => s + xi * xi, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function slopeToTrend(slope: number | null, threshold = 5): TrendDirection {
  if (slope === null) return 'INSUFFICIENT_DATA';
  if (slope > threshold) return 'INCREASING';
  if (slope < -threshold) return 'DECREASING';
  return 'STABLE';
}

/** Generate a sorted list of all YYYY-MM-DD dates between start and end (inclusive). */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = parseISODate(start);
  const last = parseISODate(end);
  while (cur <= last) {
    dates.push(toISODateString(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** ISO week number (1-based) for a given date string. */
function isoWeekOf(dateStr: string): string {
  const d = parseISODate(dateStr);
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** "YYYY-MM" month key for a date string. */
function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Build a PeriodSummary from a group of logs. */
function buildPeriodSummary(label: string, logs: IDailyLog[]): PeriodSummary {
  if (logs.length === 0) {
    return {
      period_label: label,
      start_date: '',
      end_date: '',
      log_count: 0,
      avg_daily_calories: null,
      avg_protein_g: null,
      avg_carbs_g: null,
      avg_fats_g: null,
      avg_sleep_hours: null,
      total_step_count: 0,
      avg_step_count: null,
      weight_start_kg: null,
      weight_end_kg: null,
      weight_delta_kg: null,
      avg_mood_score: null,
    };
  }

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  const calorieArr = sorted.map((l) => l.meals.reduce((s, m) => s + m.estimated_calories, 0));
  const proteinArr = sorted.map((l) => l.meals.reduce((s, m) => s + m.protein_g, 0));
  const carbArr = sorted.map((l) => l.meals.reduce((s, m) => s + m.carbs_g, 0));
  const fatArr = sorted.map((l) => l.meals.reduce((s, m) => s + m.fats_g, 0));
  const sleepArr = sorted.flatMap((l) => (l.sleep_hours !== null ? [l.sleep_hours] : []));
  const stepArr = sorted.flatMap((l) => (l.activity?.step_count != null ? [l.activity.step_count] : []));
  const moodArr = sorted.flatMap((l) => (l.mood_energy_score !== null ? [l.mood_energy_score] : []));

  const totalSteps = stepArr.reduce((s, v) => s + v, 0);
  const weights = sorted.flatMap((l) => (l.weight_kg !== null ? [l.weight_kg] : []));
  const weightStart = weights[0] ?? null;
  const weightEnd = weights[weights.length - 1] ?? null;
  const weightDelta =
    weightStart !== null && weightEnd !== null
      ? roundTo(weightEnd - weightStart, 2)
      : null;

  const avg = (arr: number[]) => (arr.length > 0 ? roundTo(average(arr) as number, 1) : null);

  return {
    period_label: label,
    start_date: sorted[0]?.date ?? '',
    end_date: sorted[sorted.length - 1]?.date ?? '',
    log_count: sorted.length,
    avg_daily_calories: avg(calorieArr),
    avg_protein_g: avg(proteinArr),
    avg_carbs_g: avg(carbArr),
    avg_fats_g: avg(fatArr),
    avg_sleep_hours: avg(sleepArr),
    total_step_count: totalSteps,
    avg_step_count: stepArr.length > 0 ? roundTo(totalSteps / stepArr.length, 0) : null,
    weight_start_kg: weightStart,
    weight_end_kg: weightEnd,
    weight_delta_kg: weightDelta,
    avg_mood_score: avg(moodArr),
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 1 FUNCTIONS (unchanged, re-exported)
// ─────────────────────────────────────────────────────────────

export function summariseMeals(meals: IMeal[]): Omit<DailyNutritionSummary, 'date'> {
  const total_calories = roundTo(meals.reduce((s, m) => s + m.estimated_calories, 0), 1);
  const total_protein_g = roundTo(meals.reduce((s, m) => s + m.protein_g, 0), 1);
  const total_carbs_g = roundTo(meals.reduce((s, m) => s + m.carbs_g, 0), 1);
  const total_fats_g = roundTo(meals.reduce((s, m) => s + m.fats_g, 0), 1);
  return { total_calories, total_protein_g, total_carbs_g, total_fats_g, meal_count: meals.length };
}

export function buildDailyNutritionSummaries(logs: IDailyLog[]): DailyNutritionSummary[] {
  return logs.map((log) => ({ date: log.date, ...summariseMeals(log.meals) }));
}

export function estimateTDEE(params: {
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  activity_minutes_per_day: number;
}): number {
  const { weight_kg, height_cm, age, gender, activity_minutes_per_day } = params;
  const bmr =
    gender === 'MALE'
      ? 88.362 + 13.397 * weight_kg + 4.799 * height_cm - 5.677 * age
      : 447.593 + 9.247 * weight_kg + 3.098 * height_cm - 4.33 * age;
  const multiplier =
    activity_minutes_per_day < 15 ? 1.2 :
    activity_minutes_per_day < 30 ? 1.375 :
    activity_minutes_per_day < 60 ? 1.55 :
    activity_minutes_per_day < 90 ? 1.725 : 1.9;
  return roundTo(bmr * multiplier, 0);
}

export function calculateCalorieBalance(log: IDailyLog, activity: IActivity | null): CalorieBalance {
  const intake_calories = log.meals.reduce((s, m) => s + m.estimated_calories, 0);
  const burned_calories = activity?.estimated_calories_burned ?? 0;
  return {
    intake_calories: roundTo(intake_calories, 1),
    burned_calories: roundTo(burned_calories, 1),
    net_calories: roundTo(intake_calories - burned_calories, 1),
    tdee_estimate: null,
  };
}

export function computeTrendMetrics(
  logs: IDailyLog[],
  targets: { target_sleep_hours: number; target_activity_minutes: number }
): TrendMetrics {
  const summaries = buildDailyNutritionSummaries(logs);
  const calorieValues = summaries.map((s) => s.total_calories);
  const weightValues = logs.flatMap((l) => (l.weight_kg !== null ? [l.weight_kg] : []));
  const sleepValues = logs.flatMap((l) => (l.sleep_hours !== null ? [l.sleep_hours] : []));
  const moodValues = logs.flatMap((l) => (l.mood_energy_score !== null ? [l.mood_energy_score] : []));
  const activityValues = logs.flatMap((l) => (l.activity !== null ? [l.activity.duration_minutes] : []));
  const proteinValues = summaries.map((s) => s.total_protein_g);

  const sleepCompliantDays = logs.filter((l) => l.sleep_hours !== null && l.sleep_hours >= targets.target_sleep_hours).length;
  const sleep_compliance_pct = sleepValues.length > 0 ? roundTo((sleepCompliantDays / logs.length) * 100, 1) : null;

  const activityCompliantDays = logs.filter((l) => l.activity !== null && l.activity.duration_minutes >= targets.target_activity_minutes).length;
  const activity_compliance_pct = activityValues.length > 0 ? roundTo((activityCompliantDays / logs.length) * 100, 1) : null;

  const avg = (arr: number[]) => arr.length > 0 ? roundTo(average(arr) as number, 1) : null;

  return {
    avg_daily_calories: avg(calorieValues),
    avg_daily_protein_g: avg(proteinValues),
    avg_sleep_hours: sleepValues.length > 0 ? roundTo(average(sleepValues) as number, 2) : null,
    avg_mood_energy_score: moodValues.length > 0 ? roundTo(average(moodValues) as number, 2) : null,
    avg_activity_minutes: avg(activityValues),
    avg_weight_kg: weightValues.length > 0 ? roundTo(average(weightValues) as number, 2) : null,
    calorie_trend: slopeToTrend(linearSlope(calorieValues), 30),
    weight_trend: slopeToTrend(linearSlope(weightValues), 0.1),
    sleep_compliance_pct,
    activity_compliance_pct,
  };
}

export function computeNutritionAdherence(
  log: IDailyLog,
  targets: { target_daily_calories: number; target_protein_g: number }
): NutritionAdherence {
  const summary = summariseMeals(log.meals);
  const calorie_adherence_pct = targets.target_daily_calories > 0
    ? roundTo((summary.total_calories / targets.target_daily_calories) * 100, 1) : 0;
  const protein_adherence_pct = targets.target_protein_g > 0
    ? roundTo((summary.total_protein_g / targets.target_protein_g) * 100, 1) : 0;
  return {
    calorie_adherence_pct,
    protein_adherence_pct,
    overall_adherence_pct: roundTo((calorie_adherence_pct + protein_adherence_pct) / 2, 1),
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 FUNCTION 1 — calculateWeeklyMonthlySummary
// ─────────────────────────────────────────────────────────────

/**
 * Computes average daily calories, macronutrients, sleep, step counts,
 * and weight deltas, segmented by ISO calendar week and calendar month.
 *
 * @param logs - Array of IDailyLog entries (any date range, any order)
 * @returns WeeklyMonthlySummary with per-period breakdowns and an overall rollup
 */
export function calculateWeeklyMonthlySummary(logs: IDailyLog[]): WeeklyMonthlySummary {
  if (logs.length === 0) {
    return {
      total_days_logged: 0,
      date_range: { start: '', end: '' },
      weekly_summaries: [],
      monthly_summaries: [],
      overall: {
        avg_daily_calories: null,
        avg_protein_g: null,
        avg_sleep_hours: null,
        total_step_count: 0,
        net_weight_delta_kg: null,
      },
    };
  }

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = sorted[0]?.date ?? '';
  const endDate = sorted[sorted.length - 1]?.date ?? '';

  // Group logs by ISO week
  const byWeek = new Map<string, IDailyLog[]>();
  const byMonth = new Map<string, IDailyLog[]>();

  for (const log of sorted) {
    const wk = isoWeekOf(log.date);
    const mo = monthOf(log.date);

    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(log);

    if (!byMonth.has(mo)) byMonth.set(mo, []);
    byMonth.get(mo)!.push(log);
  }

  // Build weekly summaries
  const weekly_summaries: PeriodSummary[] = [];
  let weekIndex = 1;
  for (const [wkKey, wkLogs] of byWeek.entries()) {
    const wkSorted = [...wkLogs].sort((a, b) => a.date.localeCompare(b.date));
    const label = `Week ${weekIndex} (${wkSorted[0]?.date ?? ''} – ${wkSorted[wkSorted.length - 1]?.date ?? ''}) [${wkKey}]`;
    weekly_summaries.push(buildPeriodSummary(label, wkLogs));
    weekIndex++;
  }

  // Build monthly summaries
  const monthly_summaries: PeriodSummary[] = [];
  for (const [moKey, moLogs] of byMonth.entries()) {
    const d = parseISODate(`${moKey}-01`);
    const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    monthly_summaries.push(buildPeriodSummary(monthName, moLogs));
  }

  // Overall rollup
  const allCalories = sorted.map((l) => l.meals.reduce((s, m) => s + m.estimated_calories, 0));
  const allProtein = sorted.map((l) => l.meals.reduce((s, m) => s + m.protein_g, 0));
  const allSleep = sorted.flatMap((l) => (l.sleep_hours !== null ? [l.sleep_hours] : []));
  const allSteps = sorted.flatMap((l) => (l.activity?.step_count != null ? [l.activity.step_count] : []));
  const allWeights = sorted.flatMap((l) => (l.weight_kg !== null ? [l.weight_kg] : []));

  const totalStepCount = allSteps.reduce((s, v) => s + v, 0);
  const netWeightDelta =
    allWeights.length >= 2
      ? roundTo((allWeights[allWeights.length - 1] ?? 0) - (allWeights[0] ?? 0), 2)
      : null;

  return {
    total_days_logged: sorted.length,
    date_range: { start: startDate, end: endDate },
    weekly_summaries,
    monthly_summaries,
    overall: {
      avg_daily_calories: allCalories.length > 0 ? roundTo(average(allCalories) as number, 1) : null,
      avg_protein_g: allProtein.length > 0 ? roundTo(average(allProtein) as number, 1) : null,
      avg_sleep_hours: allSleep.length > 0 ? roundTo(average(allSleep) as number, 2) : null,
      total_step_count: totalStepCount,
      net_weight_delta_kg: netWeightDelta,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 FUNCTION 2 — calculateTrendDirection
// ─────────────────────────────────────────────────────────────

/**
 * Numeric field keys extractable from IDailyLog for trend analysis.
 */
export type TrendableField =
  | 'weight_kg'
  | 'sleep_hours'
  | 'mood_energy_score'
  | 'daily_calories'     // derived: sum of meal calories
  | 'daily_protein_g'    // derived: sum of meal protein
  | 'activity_minutes'   // derived: activity.duration_minutes
  | 'step_count';        // derived: activity.step_count

export interface TrendDirectionResult {
  field: TrendableField;
  values_used: number;
  slope: number | null;
  direction: TrendDirection;
  /** Interpretation thresholds used */
  threshold_used: number;
  /** First and last values for context */
  first_value: number | null;
  last_value: number | null;
  /** Absolute change over the period */
  absolute_change: number | null;
}

/**
 * Computes linear regression slope over a chosen field across the provided logs.
 * Logs are sorted chronologically before regression.
 *
 * Thresholds (daily slope to classify as INCREASING/DECREASING):
 *   weight_kg:          0.05 kg/day
 *   sleep_hours:        0.05 hrs/day
 *   mood_energy_score:  0.05 pts/day
 *   daily_calories:     10 kcal/day
 *   daily_protein_g:    2 g/day
 *   activity_minutes:   1 min/day
 *   step_count:         50 steps/day
 */
export function calculateTrendDirection(
  logs: IDailyLog[],
  field: TrendableField
): TrendDirectionResult {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  // Extract numeric series
  const extract = (log: IDailyLog): number | null => {
    switch (field) {
      case 'weight_kg':          return log.weight_kg;
      case 'sleep_hours':        return log.sleep_hours;
      case 'mood_energy_score':  return log.mood_energy_score;
      case 'daily_calories':     return log.meals.reduce((s, m) => s + m.estimated_calories, 0);
      case 'daily_protein_g':    return log.meals.reduce((s, m) => s + m.protein_g, 0);
      case 'activity_minutes':   return log.activity?.duration_minutes ?? null;
      case 'step_count':         return log.activity?.step_count ?? null;
    }
  };

  const values = sorted.flatMap((l) => {
    const v = extract(l);
    return v !== null ? [v] : [];
  });

  // Thresholds (daily slope magnitude)
  const thresholds: Record<TrendableField, number> = {
    weight_kg:         0.05,
    sleep_hours:       0.05,
    mood_energy_score: 0.05,
    daily_calories:    10,
    daily_protein_g:   2,
    activity_minutes:  1,
    step_count:        50,
  };

  const threshold = thresholds[field];
  const slope = linearSlope(values);
  const direction = slopeToTrend(slope, threshold);

  return {
    field,
    values_used: values.length,
    slope: slope !== null ? roundTo(slope, 4) : null,
    direction,
    threshold_used: threshold,
    first_value: values[0] ?? null,
    last_value: values[values.length - 1] ?? null,
    absolute_change:
      values.length >= 2
        ? roundTo((values[values.length - 1] ?? 0) - (values[0] ?? 0), 2)
        : null,
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 FUNCTION 3 — detectMissingDataAndInconsistencies
// ─────────────────────────────────────────────────────────────

/**
 * Scans the log array to detect:
 *  1. Missing calendar days within the overall date range
 *  2. Weight change > 3 kg in 24 hours (physiologically implausible)
 *  3. Daily calorie intake < 500 kcal (dangerously low)
 *  4. Calories burned by activity exceeding total calorie intake by > 150%
 *
 * Returns a DataInconsistencyReport sorted by date.
 */
export function detectMissingDataAndInconsistencies(
  logs: IDailyLog[]
): DataInconsistencyReport {
  if (logs.length === 0) {
    return { missing_days: [], flags: [], total_issues: 0, has_critical_gaps: false };
  }

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = sorted[0]?.date ?? '';
  const endDate = sorted[sorted.length - 1]?.date ?? '';
  const loggedDates = new Set(sorted.map((l) => l.date));

  // ── 1. Missing days ──────────────────────────────────────────
  const allDays = dateRange(startDate, endDate);
  const missing_days = allDays.filter((d) => !loggedDates.has(d));

  const flags: MissingDataFlag[] = [];

  // ── 2. Weight spikes ─────────────────────────────────────────
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev?.weight_kg != null && curr?.weight_kg != null) {
      const delta = Math.abs(curr.weight_kg - prev.weight_kg);
      if (delta > 3) {
        flags.push({
          type: 'WEIGHT_SPIKE',
          date: curr.date,
          description: `Weight changed by ${roundTo(delta, 1)} kg between ${prev.date} and ${curr.date} (threshold: 3 kg/day).`,
          severity: delta > 6 ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }

  // ── 3. Low calorie intake ────────────────────────────────────
  for (const log of sorted) {
    const totalCalories = log.meals.reduce((s, m) => s + m.estimated_calories, 0);
    if (log.meals.length > 0 && totalCalories < 500) {
      flags.push({
        type: 'LOW_CALORIE',
        date: log.date,
        description: `Total calorie intake of ${roundTo(totalCalories, 0)} kcal is below the 500 kcal minimum threshold. This may indicate missing meal data or a safety concern.`,
        severity: totalCalories < 300 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // ── 4. Extreme calorie burn vs intake ────────────────────────
  for (const log of sorted) {
    const intake = log.meals.reduce((s, m) => s + m.estimated_calories, 0);
    const burned = log.activity?.estimated_calories_burned ?? 0;
    if (intake > 0 && burned > 0 && burned > intake * 1.5) {
      flags.push({
        type: 'CALORIE_BURN_EXTREME',
        date: log.date,
        description: `Activity calories burned (${roundTo(burned, 0)} kcal) exceeds 150% of intake (${roundTo(intake, 0)} kcal). This may be a logging error.`,
        severity: 'MEDIUM',
      });
    }
  }

  const total_issues = missing_days.length + flags.length;
  const has_critical_gaps =
    missing_days.length > 3 ||
    flags.some((f) => f.severity === 'HIGH');

  return { missing_days, flags, total_issues, has_critical_gaps };
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 FUNCTION 4 — calculatePlanAdherence
// ─────────────────────────────────────────────────────────────

/**
 * Calculates exact percentage compliance for calorie, protein, sleep, and
 * activity targets from the active HealthPlan against the provided logs.
 *
 * Adherence = (actual / target) × 100, capped at 200% to avoid outlier skew.
 * Sleep adherence: 100% if sleep_hours >= target, proportional below.
 * Activity adherence: 100% if duration >= target, proportional below.
 */
export function calculatePlanAdherence(
  activePlan: IHealthPlan,
  logs: IDailyLog[]
): PlanAdherenceReport {
  const cap = (v: number) => Math.min(v, 200);

  const daily_breakdown: DayAdherence[] = logs.map((log) => {
    const totalCalories = log.meals.reduce((s, m) => s + m.estimated_calories, 0);
    const totalProtein = log.meals.reduce((s, m) => s + m.protein_g, 0);

    const calorie_adherence_pct = activePlan.target_daily_calories > 0
      ? cap(roundTo((totalCalories / activePlan.target_daily_calories) * 100, 1))
      : 0;

    const protein_adherence_pct = activePlan.target_protein_g > 0
      ? cap(roundTo((totalProtein / activePlan.target_protein_g) * 100, 1))
      : 0;

    const sleepHours = log.sleep_hours ?? 0;
    const sleep_adherence_pct = activePlan.target_sleep_hours > 0
      ? cap(roundTo((sleepHours / activePlan.target_sleep_hours) * 100, 1))
      : 0;

    const activityMins = log.activity?.duration_minutes ?? 0;
    const activity_adherence_pct = activePlan.target_activity_minutes > 0
      ? cap(roundTo((activityMins / activePlan.target_activity_minutes) * 100, 1))
      : 0;

    const overall_adherence_pct = roundTo(
      (calorie_adherence_pct + protein_adherence_pct + sleep_adherence_pct + activity_adherence_pct) / 4,
      1
    );

    return {
      date: log.date,
      calorie_adherence_pct,
      protein_adherence_pct,
      sleep_adherence_pct,
      activity_adherence_pct,
      overall_adherence_pct,
    };
  });

  const avgOf = (key: keyof DayAdherence): number | null => {
    const vals = daily_breakdown.map((d) => d[key] as number);
    return vals.length > 0 ? roundTo(average(vals) as number, 1) : null;
  };

  const avgCalorie = avgOf('calorie_adherence_pct');
  const avgProtein = avgOf('protein_adherence_pct');
  const avgSleep = avgOf('sleep_adherence_pct');
  const avgActivity = avgOf('activity_adherence_pct');

  // Identify the biggest gap (lowest average adherence)
  const scores: Record<string, number | null> = {
    calories: avgCalorie,
    protein: avgProtein,
    sleep: avgSleep,
    activity: avgActivity,
  };

  let topGap: 'calories' | 'protein' | 'sleep' | 'activity' | 'none' = 'none';
  let lowestScore = Infinity;
  for (const [key, val] of Object.entries(scores)) {
    if (val !== null && val < lowestScore) {
      lowestScore = val;
      topGap = key as typeof topGap;
    }
  }

  return {
    plan_version: activePlan.version_number,
    days_analysed: logs.length,
    daily_breakdown,
    avg_calorie_adherence_pct: avgCalorie,
    avg_protein_adherence_pct: avgProtein,
    avg_sleep_adherence_pct: avgSleep,
    avg_activity_adherence_pct: avgActivity,
    avg_overall_adherence_pct: avgOf('overall_adherence_pct'),
    top_gap: topGap,
  };
}
