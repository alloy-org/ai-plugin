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
export function openAiModels() {
  return Object.keys(OPENAI_TOKEN_LIMITS);
}

// --------------------------------------------------------------------------
export function isModelOllama(model) {
  return !openAiModels().includes(model);
}

export const DALL_E_DEFAULT = "1024x1024~dall-e-3";
export const DALL_E_TEST_DEFAULT = "512x512~dall-e-2";
export const DEFAULT_CHARACTER_LIMIT = 12000;
export const DEFAULT_OPENAI_TEST_MODEL = "gpt-5.1"
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
// Each of anthropic/deepseek/gemini/grok/openai/perplexity manually verified as of June 2025
export const PROVIDER_API_KEY_RETRIEVE_URL = {
  anthropic: "https://console.anthropic.com/settings/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  gemini: "https://console.cloud.google.com/apis/credentials",
  grok: "https://console.x.ai/team/default/api-keys", // Originally Claude thought it https://x.com/settings/grok/api-keys"
  openai: "https://platform.openai.com/api-keys", // https://platform.openai.com/docs/api-reference/authentication
  perplexity: "https://www.perplexity.ai/account/api/keys",
}

// --------------------------------------------------------------------------
// As of June 2025
export const PROVIDER_DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-0",
  deepseek: "deepseek-chat",
  gemini: "gemini-2.5-flash",
  grok: "grok-3-beta",
  openai: "gpt-4o",
  perplexity: "sonar-pro",
}

// --------------------------------------------------------------------------
export const PROVIDER_DEFAULT_MODEL_IN_TEST = {
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
  gemini: "gemini-2.5-flash-lite-preview-06-17",
  grok: "grok-3-beta",
  openai: "gpt-4o",
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
export const ANTHROPIC_TOKEN_LIMITS = {
  "claude-opus-4-0": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-sonnet-4-0": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-3-7-sonnet-latest": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "claude-3-5-sonnet-latest": 128 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
export const DEEPSEEK_TOKEN_LIMITS = {
  "deepseek-chat": 64 * KILOBYTE * TOKEN_CHARACTERS,
  "deepseek-reasoner": 64 * KILOBYTE * TOKEN_CHARACTERS,
  "deepseek-r1-0528": 64 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
export const GEMINI_TOKEN_LIMITS = {
  "gemini-2.5-pro": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.5-flash": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.5-flash-lite-preview-06-17": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-2.0-flash": 512 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
export const GROK_TOKEN_LIMITS = {
  "grok-3-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-3-mini-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-2-vision-1212": 8 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-2-image-1212": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "grok-2-1212": 128 * KILOBYTE * TOKEN_CHARACTERS,
}

// --------------------------------------------------------------------------
export const OPENAI_TOKEN_LIMITS = {
  "gpt-3.5": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-16k": 16 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-1106": 16 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-instruct": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4": 8 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4.1": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4.1-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4o": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-1106-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-32k": 32 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-32k-0613": 32 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-vision-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "o3": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "o3-mini": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "o3-pro": 512 * KILOBYTE * TOKEN_CHARACTERS,
  "o4-mini":512 * KILOBYTE * TOKEN_CHARACTERS,
};

// --------------------------------------------------------------------------
export const PERPLEXITY_TOKEN_LIMITS = {
  "sonar-pro": 200 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar-reasoning-pro": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar-reasoning": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "sonar-deep-research": 128 * KILOBYTE * TOKEN_CHARACTERS,
}
