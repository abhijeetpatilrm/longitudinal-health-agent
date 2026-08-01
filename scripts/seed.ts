/**
 * @file scripts/seed.ts
 * @description Seed script — bootstraps 1 test user + 14 days of mock DailyLogs
 *              + an initial ACTIVE HealthPlan in MongoDB.
 *
 * Usage:
 *   npm run seed
 *   ts-node scripts/seed.ts
 *
 * Idempotent: re-running skips creation if data already exists.
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import { UserProfileModel } from '../src/models/UserProfile.model';
import { DailyLogModel } from '../src/models/DailyLog.model';
import { HealthPlanModel } from '../src/models/HealthPlan.model';
import { AgentAuditLogModel } from '../src/models/AgentAuditLog.model';
import {
  Gender,
  ActivityType,
  HealthPlanStatus,
  RecommendationCategory,
  AuditActionType,
  AuditStatus,
} from '../src/types';

// ─── Config ──────────────────────────────────────────────────

const MONGODB_URI =
  process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/longitudinal_health_agent';

const TEST_USER_NAME = 'Alex Johnson (Seed)';

// ─── Helpers ─────────────────────────────────────────────────

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function randomBetween(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(1));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Seed Data Generators ─────────────────────────────────────

function generateMealsForDay(dayIndex: number): {
  food_item: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  serving_size_description: string | null;
  is_ai_extracted: boolean;
  is_user_corrected: boolean;
}[] {
  const breakfast = [
    {
      food_item: 'Oatmeal with blueberries and honey',
      estimated_calories: 320,
      protein_g: 8,
      carbs_g: 60,
      fats_g: 5,
      serving_size_description: '250g bowl',
      is_ai_extracted: true,
      is_user_corrected: false,
    },
    {
      food_item: 'Greek yoghurt with granola',
      estimated_calories: 280,
      protein_g: 18,
      carbs_g: 35,
      fats_g: 6,
      serving_size_description: '200g',
      is_ai_extracted: true,
      is_user_corrected: false,
    },
    {
      food_item: 'Scrambled eggs on whole grain toast',
      estimated_calories: 380,
      protein_g: 24,
      carbs_g: 28,
      fats_g: 14,
      serving_size_description: '2 eggs + 2 slices',
      is_ai_extracted: false,
      is_user_corrected: false,
    },
  ][dayIndex % 3];

  const lunch = [
    {
      food_item: 'Grilled chicken salad with quinoa',
      estimated_calories: 520,
      protein_g: 42,
      carbs_g: 38,
      fats_g: 16,
      serving_size_description: '400g plate',
      is_ai_extracted: true,
      is_user_corrected: dayIndex % 4 === 0,
    },
    {
      food_item: 'Turkey and avocado sandwich on sourdough',
      estimated_calories: 480,
      protein_g: 30,
      carbs_g: 44,
      fats_g: 18,
      serving_size_description: '1 large sandwich',
      is_ai_extracted: false,
      is_user_corrected: false,
    },
    {
      food_item: 'Lentil soup with crusty bread',
      estimated_calories: 420,
      protein_g: 22,
      carbs_g: 62,
      fats_g: 8,
      serving_size_description: '350ml soup + 1 roll',
      is_ai_extracted: true,
      is_user_corrected: false,
    },
  ][dayIndex % 3];

  const dinner = [
    {
      food_item: 'Baked salmon with roasted sweet potato and broccoli',
      estimated_calories: 580,
      protein_g: 44,
      carbs_g: 42,
      fats_g: 22,
      serving_size_description: '200g salmon + 150g veg',
      is_ai_extracted: true,
      is_user_corrected: false,
    },
    {
      food_item: 'Chicken stir-fry with brown rice',
      estimated_calories: 620,
      protein_g: 40,
      carbs_g: 68,
      fats_g: 14,
      serving_size_description: '350g stir-fry + 150g rice',
      is_ai_extracted: false,
      is_user_corrected: false,
    },
    {
      food_item: 'Beef and vegetable curry with basmati rice',
      estimated_calories: 680,
      protein_g: 38,
      carbs_g: 74,
      fats_g: 20,
      serving_size_description: '300g curry + 200g rice',
      is_ai_extracted: true,
      is_user_corrected: dayIndex % 5 === 0,
    },
  ][dayIndex % 3];

  const snack = {
    food_item: 'Apple with almond butter',
    estimated_calories: 180,
    protein_g: 5,
    carbs_g: 22,
    fats_g: 9,
    serving_size_description: '1 medium apple + 1 tbsp almond butter',
    is_ai_extracted: false,
    is_user_corrected: false,
  };

  return [breakfast, lunch, dinner, snack];
}

function generateActivity(dayIndex: number): {
  activity_type: ActivityType;
  duration_minutes: number;
  step_count: number | null;
  estimated_calories_burned: number;
  notes: string | null;
} | null {
  // Rest day every 4th day
  if (dayIndex % 4 === 3) return null;

  const activities = [
    {
      activity_type: ActivityType.RUNNING,
      duration_minutes: randomInt(25, 45),
      step_count: randomInt(4000, 6000),
      estimated_calories_burned: randomInt(280, 420),
      notes: '5K morning run — felt great',
    },
    {
      activity_type: ActivityType.WALKING,
      duration_minutes: randomInt(40, 60),
      step_count: randomInt(6000, 10_000),
      estimated_calories_burned: randomInt(160, 240),
      notes: null,
    },
    {
      activity_type: ActivityType.STRENGTH_TRAINING,
      duration_minutes: randomInt(45, 60),
      step_count: null,
      estimated_calories_burned: randomInt(250, 350),
      notes: 'Upper body + core circuit',
    },
    {
      activity_type: ActivityType.CYCLING,
      duration_minutes: randomInt(30, 50),
      step_count: null,
      estimated_calories_burned: randomInt(300, 450),
      notes: 'Commute + leisure',
    },
    {
      activity_type: ActivityType.YOGA,
      duration_minutes: randomInt(30, 45),
      step_count: null,
      estimated_calories_burned: randomInt(100, 160),
      notes: 'Evening wind-down flow',
    },
  ][dayIndex % 5];

  return activities;
}

// ─── Main Seed Function ──────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n🌱 Starting seed script…\n');

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log('✅ Connected to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@'));

  // ─── 1. User Profile ────────────────────────────────────────

  let user = await UserProfileModel.findOne({ name: TEST_USER_NAME });

  if (user) {
    console.log(`⚠️  User "${TEST_USER_NAME}" already exists (id: ${user._id.toString()}). Skipping user creation.`);
  } else {
    user = await UserProfileModel.create({
      name: TEST_USER_NAME,
      age: 32,
      gender: Gender.MALE,
      baseline_goals: {
        target_weight_kg: 78,
        target_daily_calories: 2200,
        target_protein_g: 165,
        target_carbs_g: 220,
        target_fats_g: 73,
        target_sleep_hours: 7.5,
        target_activity_minutes_per_day: 45,
        target_water_ml: 2500,
      },
      health_conditions: ['mild_hypertension', 'vitamin_d_deficiency'],
    });
    console.log(`✅ Created user profile: ${user._id.toString()}`);
  }

  const userId = user._id;

  // ─── 2. Daily Logs — 14 Days ────────────────────────────────

  let logsCreated = 0;
  let logsSkipped = 0;

  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const date = dateString(daysAgo);
    const existing = await DailyLogModel.findOne({ user_id: userId, date });

    if (existing) {
      logsSkipped++;
      continue;
    }

    const dayIndex = 13 - daysAgo;
    const meals = generateMealsForDay(dayIndex);
    const activity = generateActivity(dayIndex);

    await DailyLogModel.create({
      user_id: userId,
      date,
      meals,
      activity,
      sleep_hours: randomBetween(5.5, 9.0),
      weight_kg: parseFloat((80.5 - dayIndex * 0.1 + randomBetween(-0.3, 0.3)).toFixed(1)),
      mood_energy_score: randomInt(5, 9),
      notes: dayIndex % 3 === 0
        ? 'Had a productive day. Drank plenty of water.'
        : dayIndex % 3 === 1
        ? 'Busy at work, skipped afternoon snack.'
        : null,
    });

    logsCreated++;
  }

  console.log(`✅ Daily logs — created: ${logsCreated}, skipped (already exist): ${logsSkipped}`);

  // ─── 3. Health Plan ──────────────────────────────────────────

  const existingPlan = await HealthPlanModel.findOne({ user_id: userId });

  if (existingPlan) {
    console.log(`⚠️  Health plan already exists for this user. Skipping.`);
  } else {
    const plan = await HealthPlanModel.create({
      user_id: userId,
      version_number: 1,
      status: HealthPlanStatus.ACTIVE,
      target_daily_calories: 2200,
      target_protein_g: 165,
      target_sleep_hours: 7.5,
      target_activity_minutes: 45,
      active_from: new Date(),
      active_until: null,
      user_feedback: null,
      recommendations: [
        {
          category: RecommendationCategory.NUTRITION,
          suggestion: 'Increase dietary fibre intake to 28–30g/day by adding legumes and whole grains.',
          rationale: 'High fibre intake improves glycaemic control and supports gut microbiome diversity.',
          kb_citation_id: 'KB-006',
        },
        {
          category: RecommendationCategory.ACTIVITY,
          suggestion: 'Maintain 45 minutes of moderate-to-vigorous activity 5 days/week.',
          rationale: 'WHO guidelines recommend ≥150 min/week of moderate aerobic activity for cardiovascular health.',
          kb_citation_id: 'KB-003',
        },
        {
          category: RecommendationCategory.SLEEP,
          suggestion: 'Aim for a consistent 10:30 PM bedtime and avoid screens 1 hour before sleep.',
          rationale: 'Sleep hygiene improvements reduce sleep latency and improve restorative sleep quality.',
          kb_citation_id: 'KB-010',
        },
        {
          category: RecommendationCategory.HYDRATION,
          suggestion: 'Drink 2.5L of water per day. Start each meal with 500ml of water.',
          rationale: 'Pre-meal water intake reduces caloric consumption by ~13% and supports blood pressure management.',
          kb_citation_id: 'KB-005',
        },
      ],
    });
    console.log(`✅ Created health plan v${plan.version_number} (${plan.status}): ${plan._id.toString()}`);
  }

  // ─── 4. Sample Audit Log Entry ───────────────────────────────

  const existingAudit = await AgentAuditLogModel.findOne({ user_id: userId });

  if (existingAudit) {
    console.log(`⚠️  Audit log already exists. Skipping.`);
  } else {
    await AgentAuditLogModel.create({
      user_id: userId,
      action_type: AuditActionType.MEAL_EXTRACTION,
      input_payload: {
        rawText: 'Had oatmeal with blueberries for breakfast, chicken salad for lunch',
        date: dateString(13),
      },
      raw_ai_output: {
        stub: true,
        note: 'Phase 1 seed — real AI output populated in Phase 2',
      },
      corrected_output: null,
      uncertainty_score: 0.12,
      status: AuditStatus.SUCCESS,
      error_message: null,
      timestamp: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000),
    });
    console.log('✅ Created sample audit log entry.');
  }

  // ─── Summary ─────────────────────────────────────────────────

  const [userCount, logCount, planCount, auditCount] = await Promise.all([
    UserProfileModel.countDocuments(),
    DailyLogModel.countDocuments({ user_id: userId }),
    HealthPlanModel.countDocuments({ user_id: userId }),
    AgentAuditLogModel.countDocuments({ user_id: userId }),
  ]);

  console.log('\n📊 Seed Summary:');
  console.table({
    'Total Users': userCount,
    'Daily Logs (this user)': logCount,
    'Health Plans (this user)': planCount,
    'Audit Logs (this user)': auditCount,
  });

  console.log('\n✅ Seed complete!\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('\n❌ Seed failed:', message);
  void mongoose.disconnect().finally(() => process.exit(1));
});
