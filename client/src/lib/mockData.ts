import type { TrendInconsistency, AdherenceData, HealthPlan, AuditLog } from '../types/index.ts';

export const MOCK_TRENDS_DATA = {
  summary: {
    user_id: 'TEST_USER_001',
    start_date: '2023-10-01',
    end_date: '2023-10-14',
    weekly_summaries: [
      {
        week_start: '2023-10-01',
        avg_daily_calories: 2150,
        avg_protein_g: 135,
        avg_sleep_hours: 6.5,
        total_days_logged: 7,
      },
      {
        week_start: '2023-10-08',
        avg_daily_calories: 1980,
        avg_protein_g: 155,
        avg_sleep_hours: 7.2,
        total_days_logged: 7,
      }
    ]
  },
  inconsistencies: {
    has_critical_gaps: false,
    missing_days: [],
    flags: [
      {
        type: 'MISSING_DAYS',
        severity: 'MEDIUM',
        description: 'You have consistently logged meals, but missed activity tracking for 3 days.',
        date: '2023-10-10'
      }
    ]
  } as TrendInconsistency,
  adherence: {
    avg_calorie_adherence_pct: 0.92,
    avg_protein_adherence_pct: 0.88,
    avg_sleep_adherence_pct: 0.75
  } as AdherenceData,
  dailySeries: Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const isGoodDay = i % 3 !== 0;
    return {
      date: d.toISOString().split('T')[0],
      weight: 75.5 - (i * 0.1) + (Math.random() * 0.3),
      calories: isGoodDay ? 2000 + Math.random() * 300 : 2800 + Math.random() * 500,
      protein: 130 + Math.random() * 40,
      carbs: 200 + Math.random() * 50,
      fats: 60 + Math.random() * 20,
      targetCalories: 2200,
      sleep: 6 + Math.random() * 2.5,
      mood: Math.floor(5 + Math.random() * 5)
    };
  })
};

export const MOCK_HEALTH_PLAN: HealthPlan = {
  _id: 'mock_plan_001',
  user_id: 'TEST_USER_001',
  status: 'DRAFT',
  created_at: new Date().toISOString(),
  target_daily_calories: 2100,
  target_protein_g: 160,
  target_sleep_hours: 8,
  target_activity_minutes: 45,
  recommendations: [
    {
      category: 'NUTRITION',
      suggestion: 'Prioritize Evening Protein',
      rationale: 'Shift 30g of your daily protein intake to dinner to improve overnight recovery.',
      kb_citation_id: 'Dietary protein distribution positively influences muscle protein synthesis over 24 hours. (KB Ref: Nutr-2014)'
    },
    {
      category: 'SLEEP',
      suggestion: 'Sleep Routine Optimization',
      rationale: 'Your mood drops significantly on days following < 6.5 hours of sleep. Implement a 10 PM screen curfew.',
      kb_citation_id: 'Blue light exposure before bed suppresses melatonin production by up to 50%. (KB Ref: Sleep-2018)'
    },
    {
      category: 'NUTRITION',
      suggestion: 'Caloric Consistency',
      rationale: 'Avoid the weekend spike! You are averaging 2800 calories on Saturdays.',
      kb_citation_id: 'Weekend overeating can fully negate a 5-day caloric deficit. (KB Ref: Metab-2020)'
    }
  ],
  user_feedback: null,
  version_number: 2
};

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    _id: 'audit_001',
    timestamp: new Date().toISOString(),
    action_type: 'PLAN_SUGGESTION',
    status: 'SUCCESS',
    input_payload: { prompt: 'Generate 14 day plan for male, 75kg, goal: fat loss' },
    corrected_output: null,
    uncertainty_score: 0.15
  },
  {
    _id: 'audit_002',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    action_type: 'MEAL_EXTRACTION',
    status: 'SUCCESS',
    input_payload: { text: 'Had 2 eggs and avocado toast' },
    corrected_output: { meals: [{ food_item: 'Eggs and Avocado Toast', estimated_calories: 520, protein_g: 18 }] },
    uncertainty_score: 0.45
  },
  {
    _id: 'audit_003',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    action_type: 'SAFETY_VIOLATION',
    status: 'BLOCKED',
    input_payload: { text: 'How do I cure my diabetes with cinnamon?' },
    corrected_output: null,
    uncertainty_score: 0.95
  }
];
