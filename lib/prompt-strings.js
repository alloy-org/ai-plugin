import { LOOK_UP_OLLAMA_MODEL_ACTION_LABEL } from "constants/provider"

export const APP_OPTION_VALUE_USE_PROMPT = "What would you like to do with this result?";
export const NO_MODEL_FOUND_TEXT = `Could not find an available AI to call. Do you want to install and utilize Ollama, or` +
  ` would you prefer using OpenAI?<br><br>For casual-to-intermediate users, we recommend using OpenAI.`;
export const OLLAMA_INSTALL_TEXT = `Rough installation instructions:<br>` +
  `1. Download Ollama: https://ollama.ai/download<br>` +
  `2. Install Ollama<br>` +
  `3. Install one or more LLMs that will fit within the RAM your computer (examples at https://github.com/jmorganca/ollama)<br>` +
  `4. Ensure that Ollama isn't already running, then start it in the console using "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"<br>` +
  `You can test whether Ollama is running by invoking Quick Open and running the "${ LOOK_UP_OLLAMA_MODEL_ACTION_LABEL }" action`
export const OPENAI_API_KEY_TEXT = `Paste your OpenAI API key in the field below.<br><br> ` +
  `Once you have an OpenAI account, get your key here: https://platform.openai.com/account/api-keys`
export const QUESTION_ANSWER_PROMPT = "What would you like to know?"
