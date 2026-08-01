import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

type SummaryRow = {
  check: string;
  result: 'PASS' | 'FAIL';
  details: string;
};

async function main(): Promise<void> {
  process.env['NODE_ENV'] = 'test';
  process.env['AI_PROVIDER'] = 'offline';
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['MONGODB_URI'] = 'mongodb://localhost:27017/test-db';
  process.env['RATE_LIMIT_WINDOW_MS'] = '60000';
  process.env['RATE_LIMIT_MAX'] = '10000';

  const summary: SummaryRow[] = [];
  const record = (check: string, passed: boolean, details: string) => {
    summary.push({ check, result: passed ? 'PASS' : 'FAIL', details });
  };

  const [{ MongoMemoryServer }, mongooseModule, appModule, userProfileModule, dailyLogModule, healthPlanModule, aiClientModule] = await Promise.all([
    import('mongodb-memory-server'),
    import('mongoose'),
    import('../src/app'),
    import('../src/models/UserProfile.model'),
    import('../src/models/DailyLog.model'),
    import('../src/models/HealthPlan.model'),
    import('../src/config/aiClient'),
  ]);

  const mongoose = mongooseModule.default;
  const { createApp } = appModule;
  const { UserProfileModel } = userProfileModule;
  const { DailyLogModel } = dailyLogModule;
  const { HealthPlanModel } = healthPlanModule;
  const aiClient = aiClientModule.aiClient as typeof aiClientModule.aiClient & { completeWithJsonSchema: (request: any) => Promise<any> };

  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const app = createApp();

  const user = await UserProfileModel.create({
    name: 'HITL Rejection Test User',
    age: 32,
    gender: 'OTHER',
    baseline_goals: {
      target_weight_kg: 78,
      target_daily_calories: 2200,
      target_protein_g: 160,
      target_carbs_g: 220,
      target_fats_g: 70,
      target_sleep_hours: 7.5,
      target_activity_minutes_per_day: 45,
      target_water_ml: 2500,
    },
    health_conditions: ['hypertension'],
  });

  for (const [index, calories] of [520, 610, 540].entries()) {
    await DailyLogModel.create({
      user_id: user._id,
      date: `2026-07-${28 + index}`,
      meals: [
        {
          food_item: `Seed meal ${index + 1}`,
          estimated_calories: calories,
          protein_g: 30,
          carbs_g: 40,
          fats_g: 18,
          serving_size_description: '1 plate',
          is_ai_extracted: false,
          is_user_corrected: false,
        },
      ],
      activity: null,
      sleep_hours: 7 + index * 0.5,
      weight_kg: 78 - index * 0.2,
      mood_energy_score: 7,
      notes: null,
    });
  }

  const activePlan = await HealthPlanModel.create({
    user_id: user._id,
    version_number: 1,
    status: 'ACTIVE',
    target_daily_calories: 2200,
    target_protein_g: 160,
    target_sleep_hours: 7.5,
    target_activity_minutes: 45,
    recommendations: [],
    active_from: new Date('2026-07-20T00:00:00.000Z'),
    active_until: null,
    user_feedback: null,
    rejectionReason: null,
  });

  const draftPlan = await HealthPlanModel.create({
    user_id: user._id,
    version_number: 2,
    status: 'DRAFT',
    target_daily_calories: 1900,
    target_protein_g: 150,
    target_sleep_hours: 8,
    target_activity_minutes: 50,
    recommendations: [],
    active_from: null,
    active_until: null,
    user_feedback: null,
    rejectionReason: null,
  });

  const rejectionReason = 'Calorie target too low for workout days';
  const rejectedResponse = await request(app)
    .put(`/api/plans/${draftPlan._id.toString()}/reject`)
    .send({ reason: rejectionReason });

  record(
    'API Status Code',
    rejectedResponse.status === 200,
    `PUT /api/plans/:planId/reject returned ${rejectedResponse.status}`
  );

  const rejectedPlan = (await HealthPlanModel.findById(draftPlan._id).lean()) as any;
  record(
    'Database Plan Status (REJECTED)',
    rejectedPlan?.status === 'REJECTED' && rejectedPlan?.rejectionReason === rejectionReason,
    `status=${rejectedPlan?.status ?? 'missing'}, rejectionReason=${rejectedPlan?.rejectionReason ?? 'missing'}`
  );

  const activeResponse = await request(app).get('/api/plans/TEST_USER_001/active');
  record(
    'Active Plan Safeguard',
    activeResponse.status === 200 && activeResponse.body?.data?.version_number === activePlan.version_number,
    `active version=${activeResponse.body?.data?.version_number ?? 'missing'}, expected=${activePlan.version_number}`
  );

  const auditResponse = await request(app).get('/api/audit/TEST_USER_001');
  const rejectionAudit = (auditResponse.body?.data?.logs ?? []).find((log: any) => log.action_type === 'USER_REJECTED_PLAN');
  record(
    'Audit Trail Entry',
    auditResponse.status === 200 && Boolean(rejectionAudit) && rejectionAudit.input_payload?.rejectionReason === rejectionReason,
    rejectionAudit
      ? `action=${rejectionAudit.action_type}, planId=${rejectionAudit.input_payload?.planId}, userId=${rejectionAudit.input_payload?.userId}`
      : `audit status=${auditResponse.status}`
  );

  const capturedRequests: any[] = [];
  (aiClient as any).completeWithJsonSchema = async (requestPayload: any) => {
    capturedRequests.push(requestPayload);
    const parsed = {
      target_daily_calories: 2100,
      target_protein_g: 155,
      target_sleep_hours: 7.5,
      target_activity_minutes: 45,
      recommendations: [
        {
          category: 'NUTRITION',
          suggestion: 'Keep calories slightly higher on training days.',
          rationale: 'The rejected draft was too aggressive for workout load.',
          kb_citation_id: null,
        },
        {
          category: 'ACTIVITY',
          suggestion: 'Distribute activity more evenly across the week.',
          rationale: 'Balances energy demand with recovery.',
          kb_citation_id: null,
        },
        {
          category: 'SLEEP',
          suggestion: 'Hold sleep target steady at 7.5 hours.',
          rationale: 'Protects recovery without overprescribing.',
          kb_citation_id: null,
        },
      ],
      rationale_summary: 'Stubbed response for prompt verification.',
    };

    return {
      parsed,
      raw: {
        text: JSON.stringify(parsed),
        rawResponse: { stub: true },
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    };
  };

  const generateResponse = await request(app)
    .post('/api/plans/TEST_USER_001/generate?days=14')
    .send({});

  const capturedPrompt = capturedRequests[0];
  const promptHasRejectionContext =
    Boolean(capturedPrompt?.context?.recent_rejected_plans?.length) &&
    capturedPrompt.context.recent_rejected_plans[0].rejection_reason === rejectionReason;
  record(
    'Agent Context Memory',
    generateResponse.status === 201 && promptHasRejectionContext,
    promptHasRejectionContext
      ? `captured ${capturedPrompt.context.recent_rejected_plans.length} rejected plan(s) in AI context`
      : 'AI context did not include rejected plan history'
  );

  const retrospectiveFile = fs.readFileSync(path.resolve(process.cwd(), 'client/src/components/tabs/RetrospectiveTab.tsx'), 'utf8');
  const auditFile = fs.readFileSync(path.resolve(process.cwd(), 'client/src/components/tabs/AuditTab.tsx'), 'utf8');
  const uiVersionBadgePass =
    retrospectiveFile.includes("{ reason: rejectFeedback }") &&
    retrospectiveFile.includes("status: 'REJECTED'") &&
    auditFile.includes('USER_REJECTED_PLAN') &&
    auditFile.includes('[REJECTED]');
  record(
    'UI Version Badge Render',
    uiVersionBadgePass,
    uiVersionBadgePass
      ? 'RetrospectiveTab posts `reason`, AuditTab highlights rejected versions with a red badge.'
      : 'RetrospectiveTab/AuditTab source checks failed.'
  );

  console.table(summary);

  const failed = summary.filter((row) => row.result === 'FAIL');
  await mongoose.disconnect();
  await mongoServer.stop();

  if (failed.length > 0) {
    throw new Error(`${failed.length} verification check(s) failed.`);
  }

  assert.equal(failed.length, 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});