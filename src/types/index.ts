/**
 * @file src/types/index.ts
 * @description Central TypeScript interfaces & domain types for the
 *              Longitudinal Health & Nutrition Review Agent.
 *
 * RULE: Zero `any` usage. All AI / DB payloads must be explicitly typed.
 */

import { Types } from 'mongoose';

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export enum HealthPlanStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
}

export enum AuditActionType {
  MEAL_EXTRACTION = 'MEAL_EXTRACTION',
  RETROSPECTIVE_GEN = 'RETROSPECTIVE_GEN',
  PLAN_SUGGESTION = 'PLAN_SUGGESTION',
  SAFETY_REJECT = 'SAFETY_REJECT',
  USER_CORRECTION = 'USER_CORRECTION',
  USER_REJECTED_PLAN = 'USER_REJECTED_PLAN',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  USER_CORRECTED = 'USER_CORRECTED',
  USER_REJECTED = 'USER_REJECTED',
  SAFETY_VIOLATION = 'SAFETY_VIOLATION',
  FAILED = 'FAILED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum ActivityType {
  WALKING = 'WALKING',
  RUNNING = 'RUNNING',
  CYCLING = 'CYCLING',
  SWIMMING = 'SWIMMING',
  STRENGTH_TRAINING = 'STRENGTH_TRAINING',
  YOGA = 'YOGA',
  HIIT = 'HIIT',
  OTHER = 'OTHER',
}

export enum RecommendationCategory {
  NUTRITION = 'NUTRITION',
  ACTIVITY = 'ACTIVITY',
  SLEEP = 'SLEEP',
  HYDRATION = 'HYDRATION',
  MENTAL_HEALTH = 'MENTAL_HEALTH',
  MEDICAL = 'MEDICAL',
}

// ─────────────────────────────────────────────
// NESTED / VALUE TYPES
// ─────────────────────────────────────────────

export interface IBaselineGoals {
  target_weight_kg: number | null;
  target_daily_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fats_g: number;
  target_sleep_hours: number;
  target_activity_minutes_per_day: number;
  target_water_ml: number;
}

export interface IMeal {
  food_item: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  serving_size_description: string | null;
  is_ai_extracted: boolean;
  is_user_corrected: boolean;
}

export interface IActivity {
  activity_type: ActivityType;
  duration_minutes: number;
  step_count: number | null;
  estimated_calories_burned: number;
  notes: string | null;
}

export interface IRecommendation {
  category: RecommendationCategory;
  suggestion: string;
  rationale: string;
  kb_citation_id: string | null;
}

// ─────────────────────────────────────────────
// PRIMARY DOMAIN INTERFACES
// ─────────────────────────────────────────────

/**
 * UserProfile — Core user record with goals and health context.
 */
export interface IUserProfile {
  _id: Types.ObjectId;
  name: string;
  age: number;
  gender: Gender;
  baseline_goals: IBaselineGoals;
  health_conditions: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * DailyLog — A single day's structured + free-text health entry.
 */
export interface IDailyLog {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  /** ISO date string YYYY-MM-DD */
  date: string;
  meals: IMeal[];
  activity: IActivity | null;
  sleep_hours: number | null;
  weight_kg: number | null;
  /** Mood / energy score on a 1–10 scale */
  mood_energy_score: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * HealthPlan — Versioned, status-tracked plan with KB-cited recommendations.
 */
export interface IHealthPlan {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  version_number: number;
  status: HealthPlanStatus;
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
  recommendations: IRecommendation[];
  active_from: Date | null;
  active_until: Date | null;
  user_feedback: string | null;
  rejectionReason: string | null;
  created_at: Date;
}

/**
 * AgentAuditLog — Full AI decision trail for transparency & debugging.
 */
export interface IAgentAuditLog {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  action_type: AuditActionType;
  input_payload: Record<string, unknown>;
  raw_ai_output: Record<string, unknown>;
  corrected_output: Record<string, unknown> | null;
  /** 0.0 (low confidence) → 1.0 (high confidence) */
  uncertainty_score: number;
  status: AuditStatus;
  error_message: string | null;
  timestamp: Date;
}

// ─────────────────────────────────────────────
// REQUEST / RESPONSE DTOs
// ─────────────────────────────────────────────

export interface CreateUserProfileDto {
  name: string;
  age: number;
  gender: Gender;
  baseline_goals: IBaselineGoals;
  health_conditions: string[];
}

export interface UpdateUserProfileDto {
  name?: string;
  age?: number;
  gender?: Gender;
  baseline_goals?: Partial<IBaselineGoals>;
  health_conditions?: string[];
}

export interface CreateDailyLogDto {
  userId: string;
  date: string;
  meals?: IMeal[];
  activity?: IActivity | null;
  sleepHours?: number | null;
  weight?: number | null;
  moodScore?: number | null;
  activityMinutes?: number | null;
  notes?: string | null;
}

export interface UpdateDailyLogDto {
  meals?: IMeal[];
  activity?: IActivity | null;
  sleepHours?: number | null;
  weight?: number | null;
  moodScore?: number | null;
  activityMinutes?: number | null;
  notes?: string | null;
}

export interface CreateHealthPlanDto {
  user_id: string;
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
  recommendations: IRecommendation[];
  active_from?: Date | null;
  active_until?: Date | null;
}

export interface UpdatePlanStatusDto {
  status: HealthPlanStatus;
  user_feedback?: string | null;
}

// ─────────────────────────────────────────────
// API RESPONSE WRAPPERS
// ─────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────
// KNOWLEDGE BASE
// ─────────────────────────────────────────────

export interface IKnowledgeBaseEntry {
  id: string;
  category: RecommendationCategory;
  title: string;
  evidence_summary: string;
  source_reference: string;
  applicable_conditions: string[];
  tags: string[];
}
