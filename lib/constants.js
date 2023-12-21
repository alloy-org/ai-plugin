const KILOBYTE = 1024;
const TOKEN_CHARACTERS = 4; // According to the gospel of random HN comment https://news.ycombinator.com/item?id=35841781

export const AI_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4')";
export const DEFAULT_CHARACTER_LIMIT = 12000; // GPT-3.5 has a 4097 token limit, and OpenAI limits that each token is 4-6 characters, implying a 16k-24k character limit. We're being conservative and limiting to 12k characters.
export const DEFAULT_OPENAI_MODEL = "gpt-4-1106-preview";
export const LOOK_UP_OLLAMA_MODEL_ACTION_LABEL = "Look up available Ollama models";
export const MAX_RESPONSE_CHOICES = 10;
export const MIN_OPENAI_KEY_CHARACTERS = 50; // A poorly informed but-hard-to-Google guesstimate at how many characters an OpenAI API key must contain. Bills is 51.
export const OLLAMA_URL = "http://localhost:11434";
export const OLLAMA_TOKEN_CHARACTER_LIMIT = 8 * KILOBYTE * TOKEN_CHARACTERS;
export const OPENAI_KEY_LABEL = "OpenAI API Key";
export const OPENAI_TOKEN_LIMITS = {
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
export const PLUGIN_NAME = "AmpleAI";

export function openAiTokenLimit(model) {
  return OPENAI_TOKEN_LIMITS[model];
}

export function openAiModels() {
  return Object.keys(OPENAI_TOKEN_LIMITS);
}
