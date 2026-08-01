# AGENT_USAGE.md

## 1. Tools & Coding Agents Used
- **LLM Engine for Agentic Capabilities:** Google Gemini 1.5 Pro / Flash (used in backend for zero-shot JSON meal extraction, follow-up question synthesis, and 14-day retrospective generation).
- **Frontend & UI Refactoring Agent:** Claude 3.5 Sonnet (used for Dribbble/Cronometer-grade SaaS UI engineering, React state binding, and responsive glassmorphism component design).
- **Full-Stack Architecture & Coding Agent:** Gemini 3.1 Pro / Cursor (used for Express route architecture, Mongoose schemas, deterministic math engine, and Jest test suite generation).

---

## 2. Representative Prompts Used Across Development

### Prompt 1: Deterministic Math Engine vs. LLM Boundary (Backend Core)
> "Act as a Lead AI & Backend Architect. Design a deterministic math engine in TypeScript (`DeterministicEngine.ts`) that handles all statistical computations (7-day/30-day caloric averages, linear regression weight trajectory, caloric deltas, and missing-data anomaly detection). The Gemini LLM MUST NOT perform mathematical calculations. The LLM will only receive pre-computed, verified mathematical output as context to synthesize narrative retrospectives and guidance."

### Prompt 2: Structured JSON Extraction & Medical Safety Guardrails
> "Act as an AI Safety Specialist. Implement an Express controller (`/api/logs/:userId/extract-meals`) using Gemini 1.5 Pro with structured JSON schema enforcement (`responseSchema`). Include pre-execution safety guardrails that detect unsafe medical requests (e.g., extreme calorie restriction <800 kcal, eating disorder triggers, prescription requests). If flagged, trip a `SAFETY_VIOLATION` event with 0% confidence and return standard medical disclaimer fallbacks."

### Prompt 3: High-End Cronometer/Dribbble UI Transformation (Frontend)
> "Transform our React + Tailwind dashboard (`/client`) into an ultra-premium, Dribbble/Cronometer-grade SaaS Health Portal ('PulseAI'). Build custom SVG Radial Progress Rings for macro budget tracking (Protein, Carbs, Fats), deep obsidian dark mode (`#0B1120`), and glowing pill badges. Wire all sliders for Sleep (hrs), Weight (kg), and Mood (1-10) directly to local state and the `POST /api/logs` backend API."

### Prompt 4: Human-in-the-Loop (HITL) Plan Modification & Rejection Workflow
> "Implement an explicit approval/rejection state machine for versioned plans (`v1.0`, `v2.0`). Proposed draft plans must remain in `DRAFT` status and CANNOT mutate active user targets until explicit user approval via `PUT /api/plans/:planId/approve`. If the user rejects the plan (`PUT /api/plans/:planId/reject`), collect user rejection feedback, retain active plan baseline, mark status as `REJECTED`, log a `USER_REJECTED_PLAN` audit event, and pass this rejection context into the next retrospective generation prompt."


### Prompt 5: Comprehensive Phase 4 React Frontend Dashboard Implementation
> "Act as a Senior Frontend Architect & UI/UX Engineer. Phase 3 backend is complete. Now implement Phase 4: Full-Featured React Frontend Dashboard with Tailwind CSS, Recharts, and Lucide Icons across 4 core screens:
> 1. Daily Log & AI Meal Extractor (Structured inputs, free-text extraction, and inline human correction modal).
> 2. Analytics & Deterministic Trends (Weight/calorie visual charts, anomaly banners, and adherence score cards).
> 3. Retrospective & Draft Plan Review (Narrative summaries, evidence-backed recommendations, and explicit Approve/Reject controls).
> 4. Plan Version History & Agent Audit Trail (Version timeline badges, audit log tables, and expandable JSON payload inspection)."
---

## 3. Key Agent Mistakes, Hallucinations & Critical Corrections

During the AI-assisted development process, several critical agent missteps occurred that required human oversight and manual engineering intervention:

1. **Agent Error: UI Component Overlap & Duplicate Progress Bars**
   - *Issue:* The coding agent initially rendered standard HTML sliders *and* duplicated styled Tailwind visual bars beneath Sleep/Weight cards, causing vertical layout stretching and overlapping text inside the SVG Radial Gauge ring.
   - *Human Correction:* Forced explicit 2x2 grid layout bounds, reduced internal card padding (`p-3`/`p-4`), eliminated duplicate progress bars, and adjusted SVG text vertical offsets in `MacroRing.tsx` for zero text overlap.

2. **Agent Error: API Schema & Payload Mismatch**
   - *Issue:* The generated frontend handler originally sent flattened keys (`{ sleep, weight, mood }`) while the backend Mongoose validation expected nested fields (`{ metrics: { sleepHours, weight, moodScore } }`), resulting in a `Failed to save metrics` 400 error.
   - *Human Correction:* Standardized the API payload interface across `DailyLogTab.tsx` and `apiClient.ts`, enforcing strict ISO `YYYY-MM-DD` date formatting and explicit numeric type casting.

3. **Agent Error: Hallucinated Trend Regression**
   - *Issue:* An early prompt attempt allowed the LLM to summarize weight trends directly from raw text logs, resulting in hallucinated daily weight deltas.
   - *Human Correction:* Strictly separated the `DeterministicEngine.ts` module to compute linear regression slope ($m$) and $R^2$ variance deterministically, feeding only standard JSON statistics to the LLM.

---

## 4. Verification & Testing Strategy

To ensure high-stakes reliability and 100% adherence to problem requirements, the generated output was verified via:

- **Automated Integration Tests:** Executed Jest & Supertest suites validating `POST /api/logs`, deterministic math calculations, missing data detection, and plan state transitions (`DRAFT` -> `ACTIVE` / `REJECTED`).
- **End-to-End Network Inspection:** Inspected Chrome DevTools Network payloads during meal extraction, slider state edits, plan approvals, and rejection modal feedback submissions.
- **Audit Ledger Verification:** Confirmed that user meal overrides, rejection notes, confidence scores, and safety flags were immutably persisted to MongoDB under `/api/audit/:userId`.
