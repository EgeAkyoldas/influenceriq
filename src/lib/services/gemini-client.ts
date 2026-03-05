import { GoogleGenAI } from '@google/genai';

// ═══════════════════════════════════════════════════════
//  Centralized Gemini Client with Fallback
// ═══════════════════════════════════════════════════════

interface GeminiConfig {
  apiKey: string;
  label: string;
}

// Parse all GEMINI keys from env: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc.
function loadAPIKeys(): GeminiConfig[] {
  const keys: GeminiConfig[] = [];

  // Primary key
  if (process.env.GEMINI_API_KEY) {
    keys.push({ apiKey: process.env.GEMINI_API_KEY, label: 'primary' });
  }

  // Numbered fallback keys: GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
  for (let i = 2; i <= 10; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key) {
      keys.push({ apiKey: key, label: `fallback-${i}` });
    }
  }

  if (keys.length === 0) {
    throw new Error('No GEMINI_API_KEY configured in .env.local');
  }

  return keys;
}

// Model fallback order
const MODEL_FALLBACK: string[] = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

interface GenerateOptions {
  model?: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  jsonMode?: boolean;  // if true, forces responseMimeType: application/json
}

interface StreamGenerateOptions extends GenerateOptions {
  onChunk?: (text: string) => void;
}

// Track which key/model combo last worked
let lastWorkingKeyIndex = 0;
let lastWorkingModel = MODEL_FALLBACK[0];

/**
 * Generate content with automatic key + model fallback.
 * Tries each API key with the preferred model, then falls back to other models.
 */
export async function generateWithFallback(options: GenerateOptions): Promise<string> {
  const keys = loadAPIKeys();
  const modelOrder = options.model
    ? [options.model, ...MODEL_FALLBACK.filter(m => m !== options.model)]
    : [lastWorkingModel, ...MODEL_FALLBACK.filter(m => m !== lastWorkingModel)];

  // Start from last working key
  const keyOrder = [
    ...keys.slice(lastWorkingKeyIndex),
    ...keys.slice(0, lastWorkingKeyIndex),
  ];

  const errors: string[] = [];

  for (const key of keyOrder) {
    for (const model of modelOrder) {
      try {
        const ai = new GoogleGenAI({ apiKey: key.apiKey });

        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxOutputTokens ?? 2048,
            ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        });

        const text = response.text?.trim() || '';

        // Remember what worked
        lastWorkingKeyIndex = keys.indexOf(key);
        lastWorkingModel = model;

        if (key.label !== 'primary' || model !== modelOrder[0]) {
          console.log(`[Gemini] ✅ Fallback succeeded: key=${key.label}, model=${model}`);
        }

        return text;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`[${key.label}/${model}] ${msg}`);
        console.warn(`[Gemini] ⚠️ Failed key=${key.label}, model=${model}: ${msg.substring(0, 100)}`);
      }
    }
  }

  throw new Error(`All Gemini API keys/models failed:\n${errors.join('\n')}`);
}

/**
 * Stream content with automatic key + model fallback.
 * Returns an async iterable of text chunks.
 */
export async function streamWithFallback(options: StreamGenerateOptions): Promise<AsyncIterable<string>> {
  const keys = loadAPIKeys();
  const modelOrder = options.model
    ? [options.model, ...MODEL_FALLBACK.filter(m => m !== options.model)]
    : [lastWorkingModel, ...MODEL_FALLBACK.filter(m => m !== lastWorkingModel)];

  const keyOrder = [
    ...keys.slice(lastWorkingKeyIndex),
    ...keys.slice(0, lastWorkingKeyIndex),
  ];

  const errors: string[] = [];

  for (const key of keyOrder) {
    for (const model of modelOrder) {
      try {
        const ai = new GoogleGenAI({ apiKey: key.apiKey });

        const response = await ai.models.generateContentStream({
          model,
          contents: options.contents,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxOutputTokens ?? 2048,
          },
        });

        // Remember what worked
        lastWorkingKeyIndex = keys.indexOf(key);
        lastWorkingModel = model;

        if (key.label !== 'primary' || model !== modelOrder[0]) {
          console.log(`[Gemini] ✅ Stream fallback: key=${key.label}, model=${model}`);
        }

        // Wrap the response into a simpler async iterable of text strings
        return (async function* () {
          for await (const chunk of response) {
            const text = chunk.text || '';
            if (text) yield text;
          }
        })();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`[${key.label}/${model}] ${msg}`);
        console.warn(`[Gemini] ⚠️ Stream failed key=${key.label}, model=${model}: ${msg.substring(0, 100)}`);
      }
    }
  }

  throw new Error(`All Gemini API keys/models failed for streaming:\n${errors.join('\n')}`);
}

/**
 * Get info about configured keys and models.
 */
export function getGeminiStatus() {
  const keys = loadAPIKeys();
  return {
    totalKeys: keys.length,
    keyLabels: keys.map(k => k.label),
    modelFallback: MODEL_FALLBACK,
    lastWorkingKey: keys[lastWorkingKeyIndex]?.label || 'none',
    lastWorkingModel,
  };
}
