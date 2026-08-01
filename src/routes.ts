/**
 * @file src/routes.ts
 * @description Central route registration — maps all API paths to controllers.
 *
 * Phase 1 routes: Users, DailyLogs (CRUD), HealthPlans (CRUD), AuditLogs (read)
 * Phase 2 routes: extract-meals, trends, generate plan, approve/reject plan
 */

import { Router } from 'express';

// ─── Controllers ──────────────────────────────────────────────

import {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  validateCreateUser,
  validateUpdateUser,
} from './controllers/userProfile.controller';

import {
  createDailyLog,
  getUserLogs,
  getDailyLogByDate,
  updateDailyLog,
  validateCreateLog,
  validateUpdateLog,
  extractMeals,
  validateExtractMeals,
  correctMeal,
  validateCorrectMeal,
} from './controllers/dailyLog.controller';

import {
  createHealthPlan,
  getUserPlans,
  getActivePlan,
  updatePlanStatus,
  validateCreatePlan,
  validateUpdatePlanStatus,
  // Phase 2
  generateHealthPlan,
  approvePlan,
  rejectPlan,
  validateRejectPlan,
} from './controllers/healthPlan.controller';

import {
  getUserAuditLogs,
  getAuditLogDetail,
} from './controllers/agentAuditLog.controller';

import {
  getUserTrends,
} from './controllers/trends.controller';

// ─── Safety & Rate Limit middlewares ──────────────────────────
import { inputSafetyMiddleware } from './middlewares/safetyFilter';
import { aiRateLimiter } from './middlewares/rateLimiter';

const router = Router();

// ─────────────────────────────────────────────────────────────
// USER PROFILES
// ─────────────────────────────────────────────────────────────
router.post('/users',       validateCreateUser, createUserProfile);
router.get('/users/:id',    getUserProfile);
router.patch('/users/:id',  validateUpdateUser, updateUserProfile);
router.delete('/users/:id', deleteUserProfile);

// ─────────────────────────────────────────────────────────────
// TRENDS (Phase 2) — deterministic analytics, no AI
// GET /api/users/:userId/trends?days=14
// ─────────────────────────────────────────────────────────────
router.get('/users/:userId/trends', getUserTrends);

// ─────────────────────────────────────────────────────────────
// DAILY LOGS
// ─────────────────────────────────────────────────────────────
router.post('/logs',                 validateCreateLog,   createDailyLog);
router.get('/logs/:userId',          getUserLogs);
router.get('/logs/:userId/:date',    getDailyLogByDate);
router.patch('/logs/:id',            validateUpdateLog,   updateDailyLog);

// Phase 2 — AI meal extraction
// POST /api/logs/:userId/extract-meals
// Body: { rawNote: string, date: YYYY-MM-DD, append?: boolean }
router.post(
  '/logs/:userId/extract-meals',
  aiRateLimiter,           // Phase 3 rate limiting
  inputSafetyMiddleware,   // Screen input BEFORE Zod validation & LLM call
  validateExtractMeals,
  extractMeals
);

// Phase 3 — Manual correction of AI meal
// PUT /api/logs/:logId/meals/:mealId/correct
router.put('/logs/:logId/meals/:mealId/correct', validateCorrectMeal, correctMeal);

// ─────────────────────────────────────────────────────────────
// HEALTH PLANS
// ─────────────────────────────────────────────────────────────
router.post('/plans',               validateCreatePlan,        createHealthPlan);
router.get('/plans/:userId',         getUserPlans);
router.get('/plans/:userId/active',  getActivePlan);
router.patch('/plans/:id/status',    validateUpdatePlanStatus,  updatePlanStatus);

// Phase 2 — AI plan generation + approval/rejection lifecycle
// POST /api/plans/:userId/generate?days=14
router.post('/plans/:userId/generate', aiRateLimiter, generateHealthPlan);

// PUT /api/plans/:planId/approve
router.put('/plans/:planId/approve', approvePlan);

// PUT /api/plans/:planId/reject
// Body: { user_feedback: string }
router.put('/plans/:planId/reject', validateRejectPlan, rejectPlan);

// ─────────────────────────────────────────────────────────────
// AGENT AUDIT LOGS (read-only — writes happen inside workflows)
// ─────────────────────────────────────────────────────────────
router.get('/audit/:userId',        getUserAuditLogs);
router.get('/audit/:id/detail',     getAuditLogDetail);

export default router;
