export const AI_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4'. Leave blank for gpt-3.5-turbo)";
export const DEFAULT_CHARACTER_LIMIT = 12000; // GPT-3.5 has a 4097 token limit, and OpenAI limits that each token is 4-6 characters, implying a 16k-24k character limit. We're being conservative and limiting to 12k characters.
export const MAX_RESPONSE_CHOICES = 10;
export const OLLAMA_URL = "http://localhost:11434";
export const OPENAI_KEY_LABEL = "OpenAI API Key";
export const PLUGIN_NAME = "AmpleAI";
