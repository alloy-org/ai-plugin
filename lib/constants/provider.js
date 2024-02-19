import { KILOBYTE, TOKEN_CHARACTERS } from "./units"

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
// https://platform.openai.com/docs/models
export const DEFAULT_OPENAI_MODEL = "gpt-4-1106-preview";
export const DEFAULT_OPENAI_TEST_MODEL = "gpt-3.5-turbo-1106";
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

export const OPENAI_TOKEN_LIMITS = {
  "gpt-3.5": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-16k": 16 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-1106": 16 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-3.5-turbo-instruct": 4 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4": 8 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-1106-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-32k": 32 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-32k-0613": 32 * KILOBYTE * TOKEN_CHARACTERS,
  "gpt-4-vision-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
};
