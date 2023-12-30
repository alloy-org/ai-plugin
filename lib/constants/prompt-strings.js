import { LOOK_UP_OLLAMA_MODEL_ACTION_LABEL, MIN_OPENAI_KEY_CHARACTERS } from "./provider"

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
export const OPENAI_API_KEY_TEXT = `Paste your OpenAI API key in the field below.\n\n` +
  `Once you have an OpenAI account, get your key here: ${ OPENAI_API_KEY_URL }`
export const OPENAI_INVALID_KEY_TEXT = "That doesn't seem to be a valid OpenAI API key. Possible next steps:\n\n" +
  "1. Enter one later in the settings for this plugin\n" +
  "2. Install Ollama\n" +
  `3. Re-run this command and enter a valid OpenAI API key (must be at least ${ MIN_OPENAI_KEY_CHARACTERS } characters)`;
export const QUESTION_ANSWER_PROMPT = "What would you like to know?"
