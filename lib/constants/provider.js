import { CORS_PROXY, PROVIDER_SETTING_KEY_LABELS } from "./settings"
import { KILOBYTE, TOKEN_CHARACTERS } from "./units"

// --------------------------------------------------------------------------
// Get configured providers sorted by user's preference from AI_MODEL_LABEL setting
// @param {object} appSettings - The app.settings object
// @param {string} modelsSetting - The value of AI_MODEL_LABEL setting
// @returns {string[]} Array of provider identifiers sorted by user preference
export function configuredProvidersSorted(appSettings, modelsSetting) {
  const preferredModels = parsePreferredModels(modelsSetting);
  const sortedProviders = [];

  // Add providers in the order they appear in preferredModels (if they're configured)
  for (const model of preferredModels) {
    const providerEm = providerFromModel(model);
    const settingKey = PROVIDER_SETTING_KEY_LABELS[providerEm];
    const minKeyLength = MIN_API_KEY_CHARACTERS[providerEm];
    const isConfigured = appSettings[settingKey]?.trim()?.length >= minKeyLength;

    if (isConfigured && !sortedProviders.includes(providerEm)) {
      sortedProviders.push(providerEm);
    }
  }

  // Add any configured providers not yet in sortedProviders
  for (const providerEm of REMOTE_AI_PROVIDER_EMS) {
    const settingKey = PROVIDER_SETTING_KEY_LABELS[providerEm];
    const minKeyLength = MIN_API_KEY_CHARACTERS[providerEm];
    const isConfigured = appSettings[settingKey]?.trim()?.length >= minKeyLength;

    if (isConfigured && !sortedProviders.includes(providerEm)) {
      sortedProviders.push(providerEm);
    }
  }

  return sortedProviders;
}

// --------------------------------------------------------------------------
export function defaultProviderModel(providerEm) {
  return PROVIDER_DEFAULT_MODEL[providerEm];
}

// --------------------------------------------------------------------------
export function openAiTokenLimit(model) {
  return OPENAI_TOKEN_LIMITS[model];
}

// --------------------------------------------------------------------------
export function isModelOllama(model) {
  return !remoteAiModels().includes(model);
}

// --------------------------------------------------------------------------
// Get the model that will be used for a provider from AI_MODEL_LABEL setting
// @param {string} modelsSetting - The value of AI_MODEL_LABEL setting
// @param {string} providerEm - The provider identifier (e.g., "openai", "anthropic")
// @returns {string} The model name for this provider, or the default model if not found
export function modelForProvider(modelsSetting, providerEm) {
  const preferredModels = parsePreferredModels(modelsSetting);
  const providerModels = MODELS_PER_PROVIDER[providerEm];

  // Find the first preferred model that belongs to this provider
  for (const model of preferredModels) {
    if (providerModels && providerModels.includes(model)) {
      return model;
    }
  }

  // Default to the provider's default model
  return PROVIDER_DEFAULT_MODEL[providerEm];
}

// --------------------------------------------------------------------------
// Parse the AI_MODEL_LABEL setting into an array of model names
export function parsePreferredModels(modelsSetting) {
  if (!modelsSetting || typeof modelsSetting !== "string") return [];
  return modelsSetting.split(",").map(m => m.trim()).filter(Boolean);
}

// --------------------------------------------------------------------------
// Get the API endpoint URL for a given provider and model
// Some providers (like Gemini) include the model name and/or API key in the URL
// See: https://ai.google.dev/gemini-api/docs/text-generation#generate-text
export function providerEndpointUrl(model, apiKey) {
  const providerEm = providerFromModel(model);
  let endpoint = PROVIDER_ENDPOINTS[providerEm];
  endpoint = endpoint.replace('{model-name}', model);
  // Gemini uses API key as URL query parameter
  if (providerEm === "gemini") {
    endpoint = `${ endpoint }?key=${ apiKey }`;
  }
  // Anthropic blocks CORS requests, so we route through a proxy
  return endpoint;
}

// --------------------------------------------------------------------------
// Determine which provider a model belongs to based on the model name
export function providerFromModel(model) {
  for (const [providerEm, models] of Object.entries(MODELS_PER_PROVIDER)) {
    if (models.includes(model)) {
      return providerEm;
    }
  }
  throw new Error(`Model ${ model } not found in any provider`);
}

// --------------------------------------------------------------------------
export function providerNameFromProviderEm(providerEm) {
  const providerNames = {
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    gemini: "Gemini",
    grok: "Grok",
    openai: "OpenAI",
    perplexity: "Perplexity",
  };
  return providerNames[providerEm] || providerEm.charAt(0).toUpperCase() + providerEm.slice(1);
}

// --------------------------------------------------------------------------
export function remoteAiModels() {
  return Object.values(MODELS_PER_PROVIDER).flat();
}

export const DALL_E_DEFAULT = "1024x1024~dall-e-3";
export const DALL_E_TEST_DEFAULT = "512x512~dall-e-2";
// https://platform.openai.com/docs/models
export const LOOK_UP_OLLAMA_MODEL_ACTION_LABEL = "Look up available Ollama models";
// Minimum API key lengths for each provider
export const MIN_API_KEY_CHARACTERS = {
  anthropic: 80,   // sk-ant-api03- prefix + long string
  deepseek: 40,    // Standard API key length
  gemini: 30,      // AIza prefix + ~35 chars
  grok: 40,        // xai- prefix + ~48 chars
  openai: 50,      // sk- prefix + ~48 chars
  perplexity: 40,  // pplx- prefix + ~44 chars
};
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
  gemini: "https://aistudio.google.com/app/api-keys",
  grok: "https://console.x.ai/team/default/api-keys", // Originally Claude thought it https://x.com/settings/grok/api-keys"
  openai: "https://platform.openai.com/api-keys", // https://platform.openai.com/docs/api-reference/authentication
  perplexity: "https://www.perplexity.ai/account/api/keys",
}

// --------------------------------------------------------------------------
// As of December 2025
export const PROVIDER_DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-5",
  deepseek: "deepseek-chat",
  gemini: "gemini-2.5-flash",
  grok: "grok-4-1-fast",
  openai: "gpt-5.1",
  perplexity: "sonar-pro",
}

// --------------------------------------------------------------------------
export const PROVIDER_DEFAULT_MODEL_IN_TEST = {
  anthropic: "claude-sonnet-4-5",
  deepseek: "deepseek-chat",
  gemini: "gemini-2.5-flash",
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

export const REMOTE_AI_PROVIDER_EMS = Object.keys(PROVIDER_ENDPOINTS);

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
  "gemini-3-pro-preview": 1024 * KILOBYTE * TOKEN_CHARACTERS,
  "gemini-3-pro-image-preview": 64 * KILOBYTE * TOKEN_CHARACTERS,
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
  // perplexity: Object.keys(PERPLEXITY_TOKEN_LIMITS),
}
