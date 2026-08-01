import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileJson, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { DEMO_USER_ID } from '../../lib/constants.ts';
import { Alert } from '../ui/Alert.tsx';

interface AuditLogEntry {
  _id: string;
  action_type: string;
  status: string;
  uncertainty_score: number;
  input_payload: Record<string, unknown>;
  raw_ai_output?: Record<string, unknown>;
  corrected_output: Record<string, unknown> | null;
  timestamp: string;
}

interface AuditResponse {
  logs: AuditLogEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const ACTION_OPTIONS = [
  { value: '', label: 'All events' },
  { value: 'MEAL_EXTRACTION', label: 'Meal extraction' },
  { value: 'PLAN_SUGGESTION', label: 'Plan suggestion' },
  { value: 'RETROSPECTIVE_GEN', label: 'Retrospective review' },
  { value: 'USER_REJECTED_PLAN', label: 'Plan rejection' },
  { value: 'USER_CORRECTION', label: 'User correction' },
  { value: 'SAFETY_VIOLATION', label: 'Safety violation' },
];

function actionTone(actionType: string) {
  switch (actionType) {
    case 'MEAL_EXTRACTION':
      return 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200';
    case 'PLAN_SUGGESTION':
    case 'RETROSPECTIVE_GEN':
      return 'border-violet-400/20 bg-violet-500/10 text-violet-200';
    case 'USER_REJECTED_PLAN':
      return 'border-rose-400/20 bg-rose-500/10 text-rose-200';
    case 'USER_CORRECTION':
      return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200';
    case 'SAFETY_VIOLATION':
      return 'border-rose-400/20 bg-rose-500/10 text-rose-200';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'SUCCESS':
      return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200';
    case 'USER_CORRECTED':
    case 'USER_REJECTED':
    case 'REJECTED':
      return 'border-amber-400/20 bg-amber-500/10 text-amber-200';
    case 'SAFETY_VIOLATION':
      return 'border-rose-400/20 bg-rose-500/10 text-rose-200';
    default:
      return 'border-white/10 bg-white/5 text-slate-200';
  }
}

function confidenceWidth(uncertainty: number) {
  return Math.round((1 - uncertainty) * 100);
}

function isRejectedVersion(log: AuditLogEntry) {
  return log.action_type === 'USER_REJECTED_PLAN' || log.status === 'USER_REJECTED' || log.status === 'REJECTED';
}

export default function AuditTab() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadLogs = async () => {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        if (filter) query.append('action_type', filter);

        const res = await api.get(`/audit/${DEMO_USER_ID}?${query.toString()}`);
        if (!mounted) return;
        const payload = res.data.data as AuditResponse;
        setLogs(payload.logs ?? []);
      } catch (err: any) {
        if (mounted) {
          setError(err.response?.data?.error?.message || 'Failed to load audit logs.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadLogs();

    return () => {
      mounted = false;
    };
  }, [filter]);

  const timeline = useMemo(() => {
    return logs
      .filter((log) => ['PLAN_SUGGESTION', 'RETROSPECTIVE_GEN', 'MEAL_EXTRACTION', 'USER_CORRECTION'].includes(log.action_type))
      .slice(0, 4)
      .map((log, index) => {
        const planVersion = Number((log.raw_ai_output as { plan_version?: number } | undefined)?.plan_version ?? index + 1);
        const statusLabel = log.action_type === 'RETROSPECTIVE_GEN' ? (log.input_payload as { action?: string } | undefined)?.action || 'REVIEWED' : log.status;

        return {
          id: log._id,
          version: `v${planVersion}.0`,
          status: String(statusLabel),
          actionType: log.action_type,
          timestamp: log.timestamp,
          rejected: isRejectedVersion(log),
        };
      });
  }, [logs]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          Agent audit trail
        </div>
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-white">Plan Version History & Audit Trail</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
            Review plan versions, safety events, user overrides, and the raw payload that flowed through the agent.
          </p>
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Action filter</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">Audit ledger</h3>
          </div>
          <label className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Filter by action type</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="mt-2 w-full bg-transparent text-white outline-none"
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value || 'ALL'} value={option.value} className="bg-slate-900 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <Alert type="error" title="Audit Error" message={error} />}

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-5 w-5 text-violet-300" />
          <h3 className="text-lg font-semibold">Version Timeline</h3>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {timeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 px-4 py-10 text-center text-slate-400 md:col-span-4">
              No plan lifecycle events yet.
            </div>
          ) : (
            timeline.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedLog(logs.find((log) => log._id === entry.id) ?? null)}
                className="rounded-[24px] border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-emerald-400/30 hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {entry.version}
                      </span>
                      {entry.rejected && (
                        <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
                          [REJECTED]
                        </span>
                      )}
                    </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${actionTone(entry.actionType)}`}>
                    {entry.status}
                  </span>
                </div>
                <p className="mt-4 text-lg font-semibold text-white">{entry.actionType}</p>
                <p className="mt-2 text-sm text-slate-400">{format(new Date(entry.timestamp), 'MMM d, yyyy • HH:mm')}</p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-white">
          <FileJson className="h-5 w-5 text-cyan-300" />
          <h3 className="text-lg font-semibold">Audit Ledger</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-white/10 bg-slate-950/60 p-10 text-center text-slate-400">
            No audit logs found for this filter.
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[26px] border border-white/10">
            <div className="divide-y divide-white/[0.08] bg-slate-950/55">
              {logs.map((log) => {
                const confidence = confidenceWidth(log.uncertainty_score);

                return (
                  <div key={log._id} className="grid gap-4 p-5 lg:grid-cols-[1.1fr_0.9fr_0.7fr_auto] lg:items-center">
                    <div>
                      <p className="text-sm font-semibold text-white">{format(new Date(log.timestamp), 'MMM d, yyyy')}</p>
                      <p className="mt-1 text-xs text-slate-500">{format(new Date(log.timestamp), 'HH:mm:ss')}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${actionTone(log.action_type)}`}>
                        {log.action_type}
                      </span>
                      {isRejectedVersion(log) && (
                        <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
                          [REJECTED]
                        </span>
                      )}
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(log.status)}`}>
                        {log.status}
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                        <span>Confidence</span>
                        <span>{confidence}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/[0.08]">
                        <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${confidence}%` }} />
                      </div>
                    </div>

                    <div className="flex justify-start lg:justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
                      >
                        <FileJson className="h-3.5 w-3.5" />
                        Inspect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl rounded-[30px] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-slate-950/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">JSON inspector</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">{selectedLog.action_type}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-slate-900/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Raw AI input</p>
                <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap text-xs leading-6 text-emerald-200">
                  {JSON.stringify(selectedLog.input_payload, null, 2)}
                </pre>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-slate-900/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {selectedLog.action_type === 'MEAL_EXTRACTION' ? 'Structured output payload' : 'Final structured payload'}
                </p>
                <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap text-xs leading-6 text-cyan-200">
                  {JSON.stringify(selectedLog.corrected_output || selectedLog.raw_ai_output || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Confidence: {confidenceWidth(selectedLog.uncertainty_score)}%</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Status: {selectedLog.status}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Action: {selectedLog.action_type}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
