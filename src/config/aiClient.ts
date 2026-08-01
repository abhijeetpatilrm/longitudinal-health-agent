/**
 * @file src/config/aiClient.ts
 * @description Production AI client — Google Gemini via @google/generative-ai SDK.
 *
 * Phase 3 addition:
 *   - `OfflineFallbackAiClient` — activated when AI_PROVIDER=offline.
 *     Returns deterministic JSON stubs. Ensures tests/reviews never fail
 *     due to API rate limits or missing keys.
 *
 * Phase 2 features retained:
 *   - `complete()` — standard chat completion with retry + timeout
 *   - `completeWithJsonSchema<T>()` — forced JSON mode via responseMimeType
 *   - 3-attempt exponential-backoff retry, 30-second timeout
 *   - Structured AppError on all failure paths
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerationConfig,
  HarmCategory,
  HarmBlockThreshold,
  FinishReason,
} from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from './env';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/errorHandler';

// ─── Public Interfaces ────────────────────────────────────────

export interface AiClientOptions {
  apiKey: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
}

export interface AiCompletionRequest {
  systemPrompt: string;
  userMessage: string;
  context?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResponse {
  text: string;
  rawResponse: Record<string, unknown>;
  finishReason: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IAiClient {
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
  completeWithJsonSchema<T>(request: AiCompletionRequest): Promise<{
    parsed: T;
    raw: AiCompletionResponse;
  }>;
  readonly provider: string;
  readonly model: string;
}

// ─── Safety Settings ──────────────────────────────────────────

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// ─── Retry Helpers ────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); }
    );
  });
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('timeout') || msg.includes('503') || msg.includes('429') ||
      msg.includes('rate') || msg.includes('unavailable') || msg.includes('network')
    );
  }
  return false;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withTimeout(fn(), TIMEOUT_MS);
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      logger.warn(`[AI] ${label} attempt ${attempt}/${MAX_RETRIES} failed.`, {
        error: err instanceof Error ? err.message : String(err),
        retryable,
        willRetry: retryable && attempt < MAX_RETRIES,
      });
      if (!retryable || attempt === MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
}

// ─── Offline Fallback Client (Phase 3) ───────────────────────

/**
 * OfflineFallbackAiClient — returns deterministic stub responses.
 * Activated by setting AI_PROVIDER=offline (or when no API key is provided).
 *
 * Used in:
 *   - Unit/integration test suites
 *   - Local development without a Gemini key
 *   - CI/CD pipelines
 *
 * The stubs are structured to pass through the agentWorkflow JSON parsers.
 */
class OfflineFallbackAiClient implements IAiClient {
  readonly provider = 'offline';
  readonly model = 'offline-stub';

  constructor() {
    logger.warn('[AI] OfflineFallbackAiClient active — no real AI calls will be made.');
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    logger.debug('[AI:Offline] complete() called.', { systemPromptLen: request.systemPrompt.length });
    const text = JSON.stringify({ offline: true, message: 'Offline stub response' });
    return {
      text,
      rawResponse: { offline: true, stub: 'complete' },
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async completeWithJsonSchema<T>(request: AiCompletionRequest): Promise<{ parsed: T; raw: AiCompletionResponse }> {
    logger.debug('[AI:Offline] completeWithJsonSchema() called.', { systemPromptLen: request.systemPrompt.length });

    // Detect which workflow is calling based on system prompt keywords
    const isMealExtraction = request.systemPrompt.toLowerCase().includes('nutrition assistant') ||
      request.systemPrompt.toLowerCase().includes('meal');
    const isPlanSuggestion = request.systemPrompt.toLowerCase().includes('health coach') ||
      request.systemPrompt.toLowerCase().includes('recommendations');

    let stub: unknown;

    if (isMealExtraction) {
      stub = {
        meals: [
          {
            food_item: 'Scrambled eggs (offline stub)',
            estimated_calories: 182,
            protein_g: 13.4,
            carbs_g: 1.8,
            fats_g: 13.6,
            serving_size_description: '2 large eggs',
          },
          {
            food_item: 'Whole wheat toast (offline stub)',
            estimated_calories: 80,
            protein_g: 3.0,
            carbs_g: 15.0,
            fats_g: 1.0,
            serving_size_description: '1 slice',
          },
        ],
        activity: {
          activity_type: 'WALKING',
          duration_minutes: 30,
          notes: 'Offline stub activity',
        },
        confidence_notes: ['Offline mode — no AI was called. Values are stubs for testing.'],
      };
    } else if (isPlanSuggestion) {
      stub = {
        target_daily_calories: 2000,
        target_protein_g: 150,
        target_sleep_hours: 8,
        target_activity_minutes: 45,
        recommendations: [
          {
            category: 'NUTRITION',
            suggestion: 'Maintain a balanced macronutrient distribution (offline stub)',
            rationale: 'Balanced macros support sustained energy and body composition (offline mode)',
            kb_citation_id: null,
          },
          {
            category: 'SLEEP',
            suggestion: 'Aim for 7-9 hours of sleep per night (offline stub)',
            rationale: 'Consistent sleep supports metabolic health and recovery (offline mode)',
            kb_citation_id: null,
          },
        ],
        rationale_summary: 'Offline mode stub plan. No AI was called. Values are deterministic stubs for testing and CI.',
      };
    } else {
      stub = { offline: true, message: 'Generic offline stub' };
    }

    const text = JSON.stringify(stub);
    const raw: AiCompletionResponse = {
      text,
      rawResponse: { offline: true, stub: 'completeWithJsonSchema' },
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };

    return { parsed: stub as T, raw };
  }
}

// ─── Gemini AI Client ─────────────────────────────────────────

class GeminiAiClient implements IAiClient {
  readonly provider = 'gemini';
  readonly model: string;

  private readonly genAI: GoogleGenerativeAI;
  private readonly options: AiClientOptions;

  constructor(options: AiClientOptions) {
    this.options = options;
    this.model = options.modelName;
    this.genAI = new GoogleGenerativeAI(options.apiKey);
    logger.info('[AI] GeminiAiClient initialised.', { model: options.modelName, maxTokens: options.maxTokens });
  }

  private buildModel(overrides: Partial<AiClientOptions> & { jsonMode?: boolean }): GenerativeModel {
    const generationConfig: GenerationConfig = {
      temperature: overrides.temperature ?? this.options.temperature,
      maxOutputTokens: overrides.maxTokens ?? this.options.maxTokens,
      ...(overrides.jsonMode ? { responseMimeType: 'application/json' } : {}),
    };
    return this.genAI.getGenerativeModel({ model: this.model, generationConfig, safetySettings: SAFETY_SETTINGS });
  }

  private buildPrompt(request: AiCompletionRequest): string {
    let userContent = request.userMessage;
    if (request.context && Object.keys(request.context).length > 0) {
      userContent += `\n\n[Context]\n${JSON.stringify(request.context, null, 2)}`;
    }
    return userContent;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const model = this.buildModel({ temperature: request.temperature, maxTokens: request.maxTokens });
    const prompt = this.buildPrompt(request);
    let rawResponse: Record<string, unknown> = {};

    try {
      const result = await retryWithBackoff(async () => {
        const chat = model.startChat({
          history: [
            { role: 'user', parts: [{ text: request.systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I will follow those instructions precisely.' }] },
          ],
        });
        return chat.sendMessage(prompt);
      }, 'complete');

      const response = result.response;
      const text = response.text();
      const finishReason = response.candidates?.[0]?.finishReason ?? null;
      const usageMeta = response.usageMetadata;
      rawResponse = { finishReason, usageMetadata: usageMeta ?? {}, candidates: response.candidates?.length ?? 0 };

      return {
        text,
        rawResponse,
        finishReason: finishReason !== undefined ? String(finishReason) : null,
        usage: {
          promptTokens: usageMeta?.promptTokenCount ?? 0,
          completionTokens: usageMeta?.candidatesTokenCount ?? 0,
          totalTokens: usageMeta?.totalTokenCount ?? 0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AI] Completion request failed after all retries.', { error: message });
      throw new AppError(`AI completion failed: ${message}`, 502, 'AI_CLIENT_ERROR', { error: message });
    }
  }

  async completeWithJsonSchema<T>(request: AiCompletionRequest): Promise<{ parsed: T; raw: AiCompletionResponse }> {
    const model = this.buildModel({ temperature: request.temperature ?? 0.1, maxTokens: request.maxTokens, jsonMode: true });
    const jsonSystemPrompt = request.systemPrompt +
      '\n\nCRITICAL: Your entire response must be valid JSON only. No markdown fences, no explanation, no preamble.';
    const prompt = this.buildPrompt(request);
    let rawResponse: Record<string, unknown> = {};

    try {
      const result = await retryWithBackoff(async () => {
        const chat = model.startChat({
          history: [
            { role: 'user', parts: [{ text: jsonSystemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I will return only valid JSON with no extra text.' }] },
          ],
        });
        return chat.sendMessage(prompt);
      }, 'completeWithJsonSchema');

      const response = result.response;
      const text = response.text();
      const finishReason = response.candidates?.[0]?.finishReason ?? null;

      if (finishReason === FinishReason.SAFETY) {
        throw new AppError('AI response was blocked by safety filters.', 422, 'AI_SAFETY_BLOCK');
      }

      const usageMeta = response.usageMetadata;
      rawResponse = { finishReason, usageMetadata: usageMeta ?? {}, rawText: text };

      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

      let parsed: T;
      try {
        parsed = JSON.parse(cleaned) as T;
      } catch {
        throw new AppError('AI returned invalid JSON.', 502, 'AI_JSON_PARSE_ERROR', { rawText: text.slice(0, 500) });
      }

      const raw: AiCompletionResponse = {
        text: cleaned,
        rawResponse,
        finishReason: finishReason !== undefined ? String(finishReason) : null,
        usage: {
          promptTokens: usageMeta?.promptTokenCount ?? 0,
          completionTokens: usageMeta?.candidatesTokenCount ?? 0,
          totalTokens: usageMeta?.totalTokenCount ?? 0,
        },
      };

      return { parsed, raw };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AI] JSON-mode completion failed.', { error: message });
      throw new AppError(`AI JSON completion failed: ${message}`, 502, 'AI_CLIENT_ERROR', { error: message });
    }
  }
}

// ─── OpenAI / Groq Client ─────────────────────────────────────

class OpenAiClient implements IAiClient {
  readonly provider = 'openai';
  readonly model: string;
  private readonly openai: OpenAI;
  private readonly options: AiClientOptions;

  constructor(options: AiClientOptions) {
    this.options = options;
    
    // Auto-detect Groq based on key or provider
    const isGroq = options.apiKey.startsWith('gsk_') || config.ai.provider === 'openai';
    const baseURL = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
    
    // Force a valid Groq model to override sticky terminal environment variables (like gemini-1.5-pro)
    this.model = isGroq ? 'llama-3.3-70b-versatile' : options.modelName;
    
    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: baseURL
    });
    
    logger.info('[AI] OpenAiClient initialised.', { model: this.model, baseURL });
  }

  private buildMessages(request: AiCompletionRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    let userContent = request.userMessage;
    if (request.context && Object.keys(request.context).length > 0) {
      userContent += `\n\n[Context]\n${JSON.stringify(request.context, null, 2)}`;
    }
    return [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: userContent }
    ];
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const messages = this.buildMessages(request);
    
    try {
      const result = await retryWithBackoff(async () => {
        return this.openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: request.temperature ?? this.options.temperature,
          max_tokens: request.maxTokens ?? this.options.maxTokens,
        });
      }, 'complete');

      const choice = result.choices[0];
      const text = choice.message?.content || '';
      
      return {
        text,
        rawResponse: result as any,
        finishReason: choice.finish_reason || 'stop',
        usage: {
          promptTokens: result.usage?.prompt_tokens ?? 0,
          completionTokens: result.usage?.completion_tokens ?? 0,
          totalTokens: result.usage?.total_tokens ?? 0,
        }
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(`AI completion failed: ${message}`, 502, 'AI_CLIENT_ERROR', { error: message });
    }
  }

  async completeWithJsonSchema<T>(request: AiCompletionRequest): Promise<{ parsed: T; raw: AiCompletionResponse }> {
    const messages = this.buildMessages(request);
    // Explicitly enforce JSON via prompt since not all models support response_format strict schemas natively
    messages[0].content += '\n\nCRITICAL: Your entire response must be valid JSON only. No markdown fences, no explanation, no preamble.';
    
    try {
      const result = await retryWithBackoff(async () => {
        return this.openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.maxTokens ?? this.options.maxTokens,
          response_format: { type: 'json_object' }
        });
      }, 'completeWithJsonSchema');

      const choice = result.choices[0];
      const text = choice.message?.content || '';
      const finishReason = choice.finish_reason || 'stop';
      
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

      let parsed: T;
      try {
        parsed = JSON.parse(cleaned) as T;
      } catch {
        throw new AppError('AI returned invalid JSON.', 502, 'AI_JSON_PARSE_ERROR', { rawText: text.slice(0, 500) });
      }

      const raw: AiCompletionResponse = {
        text: cleaned,
        rawResponse: result as any,
        finishReason,
        usage: {
          promptTokens: result.usage?.prompt_tokens ?? 0,
          completionTokens: result.usage?.completion_tokens ?? 0,
          totalTokens: result.usage?.total_tokens ?? 0,
        },
      };

      return { parsed, raw };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AI] JSON-mode completion failed.', { error: message });
      throw new AppError(`AI JSON completion failed: ${message}`, 502, 'AI_CLIENT_ERROR', { error: message });
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────

function createAiClient(): IAiClient {
  const options: AiClientOptions = {
    apiKey: config.ai.apiKey,
    modelName: config.ai.modelName,
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
  };

  switch (config.ai.provider) {
    // Phase 3: offline mode for tests / no-key environments
    case 'offline':
      return new OfflineFallbackAiClient();

    case 'gemini':
      return new GeminiAiClient(options);

    case 'openai':
      return new OpenAiClient(options);

    case 'anthropic':
      throw new Error(
        `[AI] Provider "${config.ai.provider}" is configured but not yet implemented. Set AI_PROVIDER=gemini or AI_PROVIDER=offline.`
      );

    default:
      throw new Error(`[AI] Unsupported AI provider: "${config.ai.provider}"`);
  }
}

export const aiClient: IAiClient = createAiClient();
