import { useMemo, useState } from 'react';
import { api } from '../../lib/api.ts';
import { DEMO_USER_ID } from '../../lib/constants.ts';
import { Alert } from '../ui/Alert.tsx';
import { CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, Sparkles, Target, XCircle } from 'lucide-react';

interface CitationEntry {
  id: string;
  category: string;
  title: string;
  evidence_summary: string;
  source_reference: string;
}

interface RecommendationEntry {
  category: string;
  suggestion: string;
  rationale: string;
  kb_citation_id: string | null;
}

interface PlanResponse {
  _id: string;
  version_number: number;
  status: 'DRAFT' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';
  target_daily_calories: number;
  target_protein_g: number;
  target_sleep_hours: number;
  target_activity_minutes: number;
  recommendations: RecommendationEntry[];
}

interface RetrospectiveResponse {
  trendSummary?: {
    overall?: {
      avg_daily_calories: number | null;
      avg_protein_g: number | null;
      avg_sleep_hours: number | null;
      total_step_count: number;
      net_weight_delta_kg: number | null;
    };
  };
  adherenceReport?: {
    avg_calorie_adherence_pct?: number;
    avg_protein_adherence_pct?: number;
    avg_sleep_adherence_pct?: number;
    avg_activity_adherence_pct?: number;
    top_gap?: string;
  } | null;
  missingDataAlerts?: {
    has_critical_gaps?: boolean;
    missing_days?: string[];
    flags?: Array<{ type: string; date: string; description: string; severity: string }>;
  };
  proposedPlan?: PlanResponse;
  rationale?: string;
  citations?: CitationEntry[];
  safety_blocked?: boolean;
  disclaimer?: string | null;
}

export default function RetrospectiveTab() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<RetrospectiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const plan = response?.proposedPlan ?? null;
  const citations = response?.citations ?? [];
  const summary = response?.trendSummary?.overall;
  const adherence = response?.adherenceReport;
  const suggestions = plan?.recommendations ?? [];

  const citationLookup = useMemo(() => new Map(citations.map((citation) => [citation.id, citation])), [citations]);

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.post(`/plans/${DEMO_USER_ID}/generate?days=14`);
      setResponse(res.data.data as RetrospectiveResponse);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to generate plan.');
    } finally {
      setLoading(false);
    }
  };

  const approvePlan = async () => {
    if (!plan) return;

    setActionLoading(true);
    setError(null);
    try {
      await api.put(`/plans/${plan._id}/approve`);
      setResponse((current) => (current && current.proposedPlan ? { ...current, proposedPlan: { ...current.proposedPlan, status: 'ACTIVE' } } : current));
      setSuccess(`Approved and activated version ${plan.version_number}.`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to approve plan.');
    } finally {
      setActionLoading(false);
    }
  };

  const rejectPlan = async () => {
    if (!plan) return;

    setActionLoading(true);
    setError(null);
    try {
      await api.put(`/plans/${plan._id}/reject`, { reason: rejectFeedback });
      setResponse((current) => (current && current.proposedPlan ? { ...current, proposedPlan: { ...current.proposedPlan, status: 'REJECTED' } } : current));
      setRejectModalOpen(false);
      setRejectFeedback('');
      setSuccess(`Version ${plan.version_number} rejected and feedback submitted.`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to reject plan.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            Human-in-the-loop retrospective
          </div>
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-white">Plan Retrospective & Review</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              Run a 14-day review, inspect evidence-backed recommendations, then approve or request changes with full traceability.
            </p>
          </div>
        </div>

        <button
          onClick={generatePlan}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run 14-Day AI Retrospective
        </button>
      </div>

      {error && <Alert type="error" title="Retrospective Error" message={error} />}
      {success && <Alert type="success" title="Success" message={success} />}

      {!plan && !loading && (
        <div className="rounded-[32px] border border-dashed border-white/15 bg-white/5 p-14 text-center shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/15 bg-emerald-500/10">
            <FileText className="h-10 w-10 text-emerald-300" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold text-white">Ready for retrospective analysis</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Generate a versioned plan, inspect the rationale, and decide whether the agent should activate the draft or revise it.
          </p>
        </div>
      )}

      {plan && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              v{plan.version_number}.0
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${plan.status === 'ACTIVE' ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : plan.status === 'REJECTED' ? 'border border-rose-400/20 bg-rose-500/10 text-rose-300' : 'border border-amber-400/20 bg-amber-500/10 text-amber-300'}`}>
              {plan.status}
            </span>
            {response?.safety_blocked && (
              <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
                Safety Blocked
              </span>
            )}
          </div>

          <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-violet-300" />
              <h3 className="text-lg font-semibold">Retrospective Narrative</h3>
            </div>
            <p className="mt-4 max-w-5xl text-base leading-7 text-slate-300">{response?.rationale || response?.disclaimer || 'No narrative summary was returned.'}</p>
            {summary && (
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Calories</p>
                  <p className="mt-2 text-xl font-semibold text-white">{summary.avg_daily_calories ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Protein</p>
                  <p className="mt-2 text-xl font-semibold text-white">{summary.avg_protein_g ?? 0} g</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Sleep</p>
                  <p className="mt-2 text-xl font-semibold text-white">{summary.avg_sleep_hours ?? 0} h</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Steps</p>
                  <p className="mt-2 text-xl font-semibold text-white">{summary.total_step_count ?? 0}</p>
                </div>
              </div>
            )}

            {adherence && (
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Calorie adherence</p>
                  <p className="mt-2 text-xl font-semibold text-white">{Math.round((adherence.avg_calorie_adherence_pct ?? 0) * 100)}%</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Protein adherence</p>
                  <p className="mt-2 text-xl font-semibold text-white">{Math.round((adherence.avg_protein_adherence_pct ?? 0) * 100)}%</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Sleep adherence</p>
                  <p className="mt-2 text-xl font-semibold text-white">{Math.round((adherence.avg_sleep_adherence_pct ?? 0) * 100)}%</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Top gap</p>
                  <p className="mt-2 text-xl font-semibold text-white">{adherence.top_gap || 'N/A'}</p>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-white">
                <Target className="h-5 w-5 text-emerald-300" />
                <h3 className="text-lg font-semibold">Proposed Versioned Plan</h3>
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Calories</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{plan.target_daily_calories} kcal</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Protein</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{plan.target_protein_g} g</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Sleep</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{plan.target_sleep_hours} h</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Activity</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{plan.target_activity_minutes} min</p>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-white">
                <Sparkles className="h-5 w-5 text-cyan-300" />
                <h3 className="text-lg font-semibold">Actionable Suggestions & Evidence</h3>
              </div>
              <div className="mt-5 space-y-4">
                {suggestions.map((recommendation) => {
                  const citation = recommendation.kb_citation_id ? citationLookup.get(recommendation.kb_citation_id) : null;
                  const isExpanded = expandedCitation === recommendation.suggestion;

                  return (
                    <article key={recommendation.suggestion} className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 transition hover:border-emerald-400/30">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{recommendation.category}</p>
                          <h4 className="mt-2 text-lg font-semibold text-white">{recommendation.suggestion}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedCitation(isExpanded ? null : recommendation.suggestion)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
                        >
                          Evidence
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-slate-400">{recommendation.rationale}</p>

                      {isExpanded && (
                        <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4 text-sm text-cyan-50">
                          {citation ? (
                            <>
                              <p className="font-semibold text-cyan-100">{citation.title}</p>
                              <p className="mt-2 text-cyan-50/85">{citation.evidence_summary}</p>
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-200/80">{citation.source_reference}</p>
                            </>
                          ) : (
                            <p className="text-cyan-50/85">Citation ID: {recommendation.kb_citation_id || 'Not provided'}</p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          {plan.status === 'DRAFT' && (
            <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={() => setRejectModalOpen(true)}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" />
                Reject / Request Changes
              </button>
              <button
                type="button"
                onClick={approvePlan}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve & Activate Version {plan.version_number}
              </button>
            </div>
          )}
        </div>
      )}

      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-slate-950/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Human approval modal</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">Request changes from the agent</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <textarea
              value={rejectFeedback}
              onChange={(event) => setRejectFeedback(event.target.value)}
              className="mt-5 min-h-[180px] w-full rounded-[24px] border border-white/10 bg-slate-900/80 p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-rose-400/40 focus:ring-4 focus:ring-rose-500/10"
              placeholder="Reduce the protein target and soften the sleep target because the plan is too aggressive..."
            />

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={rejectPlan}
                disabled={!rejectFeedback.trim() || actionLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg hover:shadow-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Submit Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
