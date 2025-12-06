import { KILOBYTE, TOKEN_CHARACTERS } from "./units"

// --------------------------------------------------------------------------
export function defaultProviderModel(providerEm) {
  return PROVIDER_DEFAULT_MODEL[providerEm];
}

// --------------------------------------------------------------------------
export function openAiTokenLimit(model) {
  return OPENAI_TOKEN_LIMITS[model];
}

// --------------------------------------------------------------------------
export function remoteAiModels() {
  return Object.values(MODELS_PER_PROVIDER).flat();
}

// --------------------------------------------------------------------------
export function isModelOllama(model) {
  return !remoteAiModels().includes(model);
}

export const DALL_E_DEFAULT = "1024x1024~dall-e-3";
export const DALL_E_TEST_DEFAULT = "512x512~dall-e-2";
export const DEFAULT_CHARACTER_LIMIT = 12000;
// https://platform.openai.com/docs/models
export const LOOK_UP_OLLAMA_MODEL_ACTION_LABEL = "Look up available Ollama models";
// A poorly informed but-hard-to-Google guesstimate at how many characters an OpenAI API key must contain. Bills is 51:
export const MIN_OPENAI_KEY_CHARACTERS = 50;
export const OLLAMA_URL = "http://localhost:11434";
// Arbitrarily guesstimated. Needs refinement
export const OLLAMA_TOKEN_CHARACTER_LIMIT = 20000;
export const OLLAMA_MODEL_PREFERENCES = [
  "mistral",
  "openhermes2.5-mistral",
  "llama2",
];

// --------------------------------------------------------------------------
// Each of anthropic/deepseek/gemini/grok/openai/perplexity manually verified as of December 2025
export const PROVIDER_API_KEY_RETRIEVE_URL = {
  anthropic: "https://console.anthropic.com/settings/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  gemini: "https://console.cloud.google.com/apis/credentials",
  grok: "https://console.x.ai/team/default/api-keys", // Originally Claude thought it https://x.com/settings/grok/api-keys"
  openai: "https://platform.openai.com/api-keys", // https://platform.openai.com/docs/api-reference/authentication
  perplexity: "https://www.perplexity.ai/account/api/keys",
}

// --------------------------------------------------------------------------
// As of December 2025
export const PROVIDER_DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-5",
  deepseek: "deepseek-chat",
  gemini: "gemini-3-pro",
  grok: "grok-4-1-fast",
  openai: "gpt-5.1",
  perplexity: "sonar-pro",
}

// --------------------------------------------------------------------------
export const PROVIDER_DEFAULT_MODEL_IN_TEST = {
  anthropic: "claude-sonnet-4-5",
  deepseek: "deepseek-chat",
  gemini: "gemini-3-pro",
  grok: "grok-3-beta",
  openai: "gpt-5.1",
  perplexity: "sonar-pro",
}

// --------------------------------------------------------------------------
export const PROVIDER_ENDPOINTS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/{model-name}:generateContent",
  grok: "https://api.x.ai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions", // https://platform.openai.com/docs/api-reference/chat/create
  perplexity: "https://api.perplexity.ai/chat/completions",
}

// --------------------------------------------------------------------------
// Updated December 2025 based on https://platform.claude.com/docs/en/about-claude/models
export const ANTHROPIC_TOKEN_LIMITS = {
  // Latest models (Claude 4.5 family)
  "claude-sonnet-4-5": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-sonnet-4-5-20250929": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-haiku-4-5": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-haiku-4-5-20251001": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-opus-4-5": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-opus-4-5-20251101": 200 * KILOBYTE * TOKEN_CHARACTERS,
  // Legacy models (Claude 4 family)
  "claude-opus-4-1": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-opus-4-1-20250805": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-sonnet-4-0": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-sonnet-4-20250514": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-3-7-sonnet-latest": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-3-7-sonnet-20250219": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-opus-4-0": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-opus-4-20250514": 200 * KILOBYTE * TOKEN_CHARACTERS,
  // Legacy models (Claude 3.5 family)
  "claude-3-5-haiku-latest": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-3-5-haiku-20241022": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-3-5-sonnet-latest": 200 * KILOBYTE * TOKEN_CHARACTERS,
  // Legacy models (Claude 3 family)
  "claude-3-haiku-20240307": 200 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
// Updated December 2025 based on https://api-docs.deepseek.com/
export const DEEPSEEK_TOKEN_LIMITS = {
  "deepseek-chat": 64 * KILOBYTE * TOKEN_CHARACTERS,
  "deepseek-reasoner": 64 * KILOBYTE * TOKEN_CHARACTERS,
  "deepseek-r1": 64 * KILOBYTE * TOKEN_CHARACTERS,
  "deepseek-r1-0528": 64 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
// Updated December 2025 based on https://ai.google.dev/gemini-api/docs/models/gemini
export const GEMINI_TOKEN_LIMITS = {
  // Gemini 3 family (latest)
  "gemini-3-pro": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  // Gemini 2.5 family
  "gemini-2.5-pro": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.5-flash": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.5-flash-lite": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.5-flash-lite-preview-06-17": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  // Gemini 2.0 family
  "gemini-2.0-flash": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.0-flash-lite": 1024 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
// Updated December 2025 based on https://docs.x.ai/docs/models
export const GROK_TOKEN_LIMITS = {
  // Grok 4 family (latest)
  "grok-4-1-fast": 2048 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-4-fast": 2048 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-4": 256 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-4-0709": 256 * KILOBYTE * TOKEN_CHARACTERS,
  // Grok 3 family
  "grok-3": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-3-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-3-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-3-mini-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
  // Grok 2 family
  "grok-2-vision-1212": 8 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-2-image-1212": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-2-1212": 128 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
// Updated December 2025 based on https://platform.openai.com/docs/models
export const OPENAI_TOKEN_LIMITS = {
  // GPT-5 family (latest)
  "gpt-5": 400 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-5.1": 400 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-5.1-codex-max": 400 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-5-fast": 400 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-5-thinking": 400 * KILOBYTE * TOKEN_CHARACTERS,
  // GPT-4.1 family
  "gpt-4.1": 1000 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4.1-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
  // GPT-4o family
  "gpt-4o": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4o-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
  // O-series models
  "o3": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "o3-mini": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "o3-pro": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "o4-mini": 200 * KILOBYTE * TOKEN_CHARACTERS,
  // Legacy GPT-4 models
  "gpt-4": 8 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-1106-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-32k": 32 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-32k-0613": 32 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-vision-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
  // Legacy GPT-3.5 models
  "gpt-3.5": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-16k": 16 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-1106": 16 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-instruct": 4 * KILOBYTE * TOKEN_CHARACTERS,
};

// --------------------------------------------------------------------------
// Updated December 2025 based on https://docs.perplexity.ai/guides/model-cards
export const PERPLEXITY_TOKEN_LIMITS = {
  "sonar-pro": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar-reasoning-pro": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar-reasoning": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar-deep-research": 128 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
export const MODELS_PER_PROVIDER = {
  anthropic: Object.keys(ANTHROPIC_TOKEN_LIMITS),
  deepseek: Object.keys(DEEPSEEK_TOKEN_LIMITS),
  gemini: Object.keys(GEMINI_TOKEN_LIMITS),
  grok: Object.keys(GROK_TOKEN_LIMITS),
  openai: Object.keys(OPENAI_TOKEN_LIMITS),
  perplexity: Object.keys(PERPLEXITY_TOKEN_LIMITS),
}
