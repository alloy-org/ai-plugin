import { OPENAI_API_KEY_TEXT } from "constants/prompt-strings"
import { AI_MODEL_LABEL, AI_LEGACY_MODEL_LABEL, IS_TEST_ENVIRONMENT, PROVIDER_SETTING_KEY_LABELS, settingKeyLabel } from "constants/settings"
import {
  MIN_API_KEY_CHARACTERS,
  MODELS_PER_PROVIDER,
  OPENAI_TOKEN_LIMITS,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_ENDPOINTS,
  REMOTE_AI_PROVIDER_EMS,
} from "constants/provider"

// --------------------------------------------------------------------------
export async function apiKeyFromAppOrUser(app, providerEm) {
  const apiKey = apiKeyFromApp(app, providerEm) || await apiKeyFromUser(app, providerEm);
  if (!apiKey) {
    app.alert("Couldn't find a valid OpenAI API key. An OpenAI account is necessary to generate images.");
    return null;
  }
  return apiKey;
}

// --------------------------------------------------------------------------
export function apiKeyFromApp(app, providerEm) {
  const providerKeyLabel = settingKeyLabel(providerEm);
  if (app.settings[providerKeyLabel]) {
    return app.settings[providerKeyLabel].trim();
  } else if (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]) { // Legacy setting name
    const deprecatedKey = (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]).trim();
    app.setSetting(settingKeyLabel("openai"), deprecatedKey);
    return deprecatedKey;
  } else {
    if (IS_TEST_ENVIRONMENT) {
      throw new Error(`Couldnt find a ${ providerEm } key in ${ app.settings }`);
    } else {
      app.alert("Please configure your OpenAI key in plugin settings.");
    }
    return null;
  }
}

// --------------------------------------------------------------------------
export async function apiKeyFromUser(app, providerEm) {
  const apiKey = await app.prompt(OPENAI_API_KEY_TEXT);
  if (apiKey) {
    app.setSetting(settingKeyLabel(providerEm), apiKey);
  }
  return apiKey;
}

// --------------------------------------------------------------------------
// Get configured providers sorted by user's preference from AI_MODEL_LABEL setting
// @param {object} appSettings - The app.settings object
// @param {string} modelsSetting - The value of AI_MODEL_LABEL setting
// @returns {string[]} Array of provider identifiers sorted by user preference
export function configuredProvidersSorted(appSettings) {
  const modelsSetting = appSettings[AI_MODEL_LABEL];
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
export function preferredModel(app, lastUsedModel = null) {
  const models = preferredModels(app);
  if (lastUsedModel && models.includes(lastUsedModel)) {
    return lastUsedModel;
  }
  return models?.at(0);
}

// --------------------------------------------------------------------------
// @returns {string[]} Array of preferred models from AI_MODEL_LABEL setting,
// or default models for all configured providers if setting is not defined
export function preferredModels(app) {
  if (!app || !app.settings) return [];
  const preferredModelsFromSetting = parsePreferredModels(app.settings[AI_MODEL_LABEL])
  if (preferredModelsFromSetting) return preferredModelsFromSetting;

  // Fallback to default models for all providers
  const providers = configuredProvidersSorted(app.settings);
  return providers.map(providerEm => PROVIDER_DEFAULT_MODEL[providerEm]);
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
