// Mirroring backend types for frontend

export interface Meal {
  _id: string;
  food_item: string;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  serving_size_description: string | null;
  is_ai_extracted: boolean;
  is_user_corrected: boolean;
}

export interface DailyLog {
  _id: string;
  user_id: string;
  date: string;
  sleep_hours: number | null;
  weight_kg: number | null;
  mood_energy_score: number | null;
  activity: any | null;
  meals: Meal[];
  notes: string | null;
}

export interface PlanRecommendation {
  category: 'NUTRITION' | 'ACTIVITY' | 'SLEEP' | 'GENERAL';
  suggestion: string;
  rationale: string;
  kb_citation_id: string | null;
}

export interface HealthPlan {
  _id: string;
  user_id: string;
  version_number: number;
  status: 'DRAFT' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
  recommendations: PlanRecommendation[];
  retrospective_summary?: string | null;
  user_feedback: string | null;
  created_at: string;
}

export interface AuditLog {
  _id: string;
  action_type: string;
  status: string;
  uncertainty_score: number;
  input_payload: any;
  corrected_output: any;
  timestamp: string;
}

export interface TrendSummary {
  overall: {
    avg_daily_calories: number | null;
    avg_protein_g: number | null;
    avg_sleep_hours: number | null;
    total_step_count: number;
    net_weight_delta_kg: number | null;
  };
}

export interface TrendInconsistency {
  has_critical_gaps: boolean;
  missing_days: string[];
  flags: Array<{ type: string; date: string; description: string; severity: string }>;
}

export interface AdherenceData {
  avg_calorie_adherence_pct: number;
  avg_protein_adherence_pct: number;
  avg_sleep_adherence_pct: number;
}
