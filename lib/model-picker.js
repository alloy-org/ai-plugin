import {
  DEFAULT_OPENAI_MODEL,
  MIN_OPENAI_KEY_CHARACTERS,
  OLLAMA_TOKEN_CHARACTER_LIMIT,
  OPENAI_KEY_LABEL,
  openAiModels,
  openAiTokenLimit
} from "./constants"
import { callOllama, ollamaAvailableModels } from "./fetch-ollama"
import { callOpenAI } from "./fetch-openai"
import { promptsFromPromptKey } from "./prompts"
import { NO_MODEL_FOUND_TEXT, OLLAMA_INSTALL_TEXT, OPENAI_API_KEY_TEXT } from "./prompt-strings"

const MAX_CANDIDATE_MODELS = 3;

// --------------------------------------------------------------------------
export async function recommendedAiModels(plugin, app, promptKey) {
  let candidateAiModels = app.settings[plugin.constants.labelAiModel]?.trim()?.split(",")?.map(w => w.trim()) || [];
  const ollamaModels = plugin.ollamaModelsFound || (await ollamaAvailableModels(plugin, app))
  if (ollamaModels && !plugin.ollamaModelsFound) {
    plugin.ollamaModelsFound = ollamaModels;
  }

  candidateAiModels = includingFallbackModels(plugin, app, candidateAiModels);

  if (!candidateAiModels.length) {
    candidateAiModels = await aiModelFromUserIntervention(plugin, app);
    if (!candidateAiModels?.length) return null;
  }

  return candidateAiModels.slice(0, MAX_CANDIDATE_MODELS);
}

// --------------------------------------------------------------------------
// Gather messages to be sent to AI client, then call it and return its response
// @param {object} plugin - the plugin object
// @param {object} app - the app object
// @param {string} promptKey - the key to look up in the prompts object (as found in prompts.js)
// @param {object} promptParams - an object consisting of keys `noteContent`, `instructions` and `text`
// @param {number|null} contentIndex - the array index of the word/paragraph/section that is being analyzed within noteContent
// @param {array|null} preferredModels - an array of AI models to try, in order of preference
// @param {array|null} rejectedResponses - an array of responses that have already been rejected
export async function sendQuery(plugin, app, promptKey, promptParams, { contentIndex = null, preferredModels = null,
    rejectedResponses = null } = {}) {
  preferredModels = preferredModels || await recommendedAiModels(plugin, app, promptKey);

  for (let i = 0; i < preferredModels.length; i++) {
    const aiModel = preferredModels[i];
    const inputLimit = isModelOllama(aiModel) ? OLLAMA_TOKEN_CHARACTER_LIMIT : openAiTokenLimit(aiModel);
    const messages = promptsFromPromptKey(promptKey, promptParams, contentIndex, rejectedResponses, inputLimit);

    let response;
    plugin.callCountByModel[aiModel] = (plugin.callCountByModel[aiModel] || 0) + 1;
    try {
      if (isModelOllama(aiModel)) {
        response = await callOllama(plugin, app, aiModel, messages);
      } else {
        response = await callOpenAI(plugin, app, aiModel, messages);
      }
    } catch(e) {
      console.error("Caught exception trying to make call with", aiModel, e);
    }

    if (response) {
      return { textResponse: response, modelUsed: aiModel };
    } else {
      plugin.errorCountByModel[aiModel] = (plugin.errorCountByModel[aiModel] || 0) + 1;
      console.error("Failed to make call with", aiModel);
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function includingFallbackModels(plugin, app, candidateAiModels) {
  if (plugin.ollamaModelsFound?.length) {
    candidateAiModels = candidateAiModels.concat(plugin.ollamaModelsFound.filter(m => !candidateAiModels.includes(m)));
  }

  if (app.settings[OPENAI_KEY_LABEL]?.length && !candidateAiModels.find(m => m === DEFAULT_OPENAI_MODEL)) {
    candidateAiModels = candidateAiModels.concat(DEFAULT_OPENAI_MODEL);
  } else {
    if (!app.settings[OPENAI_KEY_LABEL]?.length) {
      console.error("No OpenAI key found in", OPENAI_KEY_LABEL, "setting");
    } else if (candidateAiModels.find(m => m === DEFAULT_OPENAI_MODEL)) {
      console.log("Already an OpenAI model among candidates,", candidateAiModels.find(m => m === DEFAULT_OPENAI_MODEL))
    }
  }

  return candidateAiModels;
}

// --------------------------------------------------------------------------
function isModelOllama(model) {
  return !openAiModels().includes(model);
}

// --------------------------------------------------------------------------
async function aiModelFromUserIntervention(plugin, app) {
  const optionSelected = await app.prompt(NO_MODEL_FOUND_TEXT, { inputs: [
      { type: "radio", label: "Which model would you prefer to use?", options: [
          { label: "OpenAI (best for most casual-to-intermediate users)", value: "openai" },
          { label: "Ollama (best for people who want high customization, or a free option)", value: "ollama" }
        ]
      }
    ]
  });

  if (optionSelected === "openai") {
    const openaiKey = await app.prompt(OPENAI_API_KEY_TEXT);
    if (openaiKey.length >= MIN_OPENAI_KEY_CHARACTERS ) {
      app.setSetting(plugin.constants.labelApiKey, openaiKey);
      await app.alert(`An OpenAI was successfully stored. The default OpenAI model, "${ DEFAULT_OPENAI_MODEL }", will be used for future AI lookups.`);
      return [ DEFAULT_OPENAI_MODEL ]
    } else {
      app.alert("That doesn't seem to be a valid OpenAI API key. You can enter one later in the settings for this plugin, or you can install Ollama.")
      return null;
    }
  } else {
    app.alert(OLLAMA_INSTALL_TEXT);
    return null;
  }
}
