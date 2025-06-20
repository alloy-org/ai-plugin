// -------------------------------------------------------------------------------------
export function settingKeyLabel(providerEm) {
  return PROVIDER_SETTING_KEY_LABELS[providerEm];
}

export const AI_LEGACY_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4')";
export const AI_MODEL_LABEL = "Preferred AI models (e.g., 'gpt-4o, claude-4-sonnet, grok-3-beta')";
export const CORS_PROXY = "https://wispy-darkness-7716.amplenote.workers.dev"; // Only proxies whitelisted image generation domain & folder
export const IMAGE_FROM_PRECEDING_LABEL = "Image from preceding text";
export const IMAGE_FROM_PROMPT_LABEL = "Image from prompt";
export const MAX_SPACES_ABORT_RESPONSE = 30;
export const SUGGEST_TASKS_LABEL = "Suggest tasks";
export const PLUGIN_NAME = "AmpleAI";
const PROVIDER_SETTING_KEY_LABELS = {
  anthropic: "Anthropic API Key",
  deepseek: "DeepSeek API Key",
  gemini: "Gemini API Key",
  grok: "Grok API Key",
  openai: "OpenAI API Key",
  perplexity: "Perplexity API Key",
};
