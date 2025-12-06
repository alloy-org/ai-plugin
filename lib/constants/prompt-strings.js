import { LOOK_UP_OLLAMA_MODEL_ACTION_LABEL, MIN_OPENAI_KEY_CHARACTERS, PROVIDER_API_KEY_RETRIEVE_URL } from "./provider"

export const APP_OPTION_VALUE_USE_PROMPT = "What would you like to do with this result?";
export const IMAGE_GENERATION_PROMPT = "What would you like to generate an image of?";
export const NO_MODEL_FOUND_TEXT = `Could not find an available AI to call. Do you want to install and utilize Ollama, or` +
  ` would you prefer using OpenAI?\n\n` +
  `For casual-to-intermediate users, we recommend using OpenAI, since it offers higher quality results and can generate images.`;
export const OLLAMA_INSTALL_TEXT = `Rough installation instructions:\n` +
  `1. Download Ollama: https://ollama.ai/download\n` +
  `2. Install Ollama\n` +
  `3. Install one or more LLMs that will fit within the RAM your computer (examples at https://github.com/jmorganca/ollama)\n` +
  `4. Ensure that Ollama isn't already running, then start it in the console using "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"\n` +
  `You can test whether Ollama is running by invoking Quick Open and running the "${ LOOK_UP_OLLAMA_MODEL_ACTION_LABEL }" action`
export const OPENAI_API_KEY_URL = "https://platform.openai.com/account/api-keys";
export const OPENAI_API_KEY_TEXT = `Paste your LLM API key in the field below.\n\n` +
  `Once you have an OpenAI account, get your key here: ${ OPENAI_API_KEY_URL }`
export const OPENAI_INVALID_KEY_TEXT = "That doesn't seem to be a valid OpenAI API key. Possible next steps:\n\n" +
  "1. Enter one later in the settings for this plugin\n" +
  "2. Install Ollama\n" +
  `3. Re-run this command and enter a valid OpenAI API key (must be at least ${ MIN_OPENAI_KEY_CHARACTERS } characters)`;
export const PROVIDER_INVALID_KEY_TEXT = "That doesn't seem to be a valid API key. You can enter one later in the settings for this plugin.";
export const QUESTION_ANSWER_PROMPT = "What would you like to know?"

// --------------------------------------------------------------------------
// API key retrieval instructions for each provider
export const PROVIDER_API_KEY_TEXT = {
  anthropic: `Paste your Anthropic API key in the field below.\n\n` +
    `Your API key should start with "sk-ant-api03-". Get your key here:\n${ PROVIDER_API_KEY_RETRIEVE_URL.anthropic }`,

  deepseek: `Paste your DeepSeek API key in the field below.\n\n` +
    `Sign up for a DeepSeek account and get your API key here:\n${ PROVIDER_API_KEY_RETRIEVE_URL.deepseek }`,

  gemini: `Paste your Gemini API key in the field below.\n\n` +
    `Your API key should start with "AIza". Get your key from Google AI Studio:\n${ PROVIDER_API_KEY_RETRIEVE_URL.gemini }`,

  grok: `Paste your Grok API key in the field below.\n\n` +
    `Your API key should start with "xai-". Get your key from the xAI console:\n${ PROVIDER_API_KEY_RETRIEVE_URL.grok }`,

  openai: `Paste your OpenAI API key in the field below.\n\n` +
    `Your API key should start with "sk-". Get your key here:\n${ PROVIDER_API_KEY_RETRIEVE_URL.openai }`,

  perplexity: `Paste your Perplexity API key in the field below.\n\n` +
    `Your API key should start with "pplx-". Get your key here:\n${ PROVIDER_API_KEY_RETRIEVE_URL.perplexity }`,
}
