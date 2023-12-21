import { OLLAMA_TOKEN_CHARACTER_LIMIT, DEFAULT_OPENAI_MODEL, MIN_OPENAI_KEY_CHARACTERS, openAiModels, openAiTokenLimit } from "./constants"
import { callOllama, ollamaAvailableModels } from "./fetch-ollama"
import { callOpenAI } from "./fetch-openai"
import { promptsFromPromptKey } from "./prompts"
import { NO_MODEL_FOUND_TEXT, OLLAMA_INSTALL_TEXT, OPENAI_API_KEY_TEXT } from "./prompt-strings"

const MAX_CANDIDATE_MODELS = 3;

// --------------------------------------------------------------------------
// Gather messages to be sent to AI client, then call it and return its response
export async function sendQuery(plugin, app, promptKey, promptParams, { contentIndex = null, rejectedResponses = null } = {}) {
  let candidateAiModels = app.settings[plugin.constants.labelAiModel]?.trim()?.split(",")?.map(w => w.trim()) || [];
  const ollamaModels = plugin.ollamaModelsFound || (await ollamaAvailableModels(plugin, app))
  if (ollamaModels && !plugin.ollamaModelsFound) {
    plugin.ollamaModelsFound = ollamaModels;
    candidateAiModels = candidateAiModels.concat(ollamaModels);
  }

  if (!candidateAiModels.length) candidateAiModels = defaultModelCandidates(plugin, app);
  if (!candidateAiModels.length) {
    candidateAiModels = await aiModelFromUserIntervention(plugin, app);
    if (!candidateAiModels?.length) return null;
  }

  for (let i = 0; i < candidateAiModels.length; i++) {
    const aiModel = candidateAiModels[i];
    const inputLimit = isModelOllama(aiModel) ? openAiTokenLimit(aiModel) : OLLAMA_TOKEN_CHARACTER_LIMIT;
    const messages = promptsFromPromptKey(promptKey, promptParams, contentIndex, rejectedResponses, { inputLimit });

    let response;
    plugin.callCountByModel[aiModel] = (plugin.callCountByModel[aiModel] || 0) + 1;
    if (isModelOllama(aiModel)) {
      response = await callOllama(plugin, app, aiModel, messages);
    } else {
      response = await callOpenAI(plugin, app, aiModel, messages);
    }

    if (response) {
      return response;
    } else {
      plugin.errorCountByModel[aiModel] = (plugin.errorCountByModel[aiModel] || 0) + 1;
      console.error("Failed to make call with", aiModel);
    }
  }

  return null;
}

// --------------------------------------------------------------------------
function isModelOllama(model) {
  return !openAiModels().includes(model);
}

// --------------------------------------------------------------------------
function defaultModelCandidates(plugin, app) {
  const openAiAPIKey = app.settings[plugin.constants.labelApiKey];
  let candidateAiModels = []
  if (plugin.ollamaModelsFound?.length) {
    if (openAiAPIKey?.length) {
      candidateAiModels = plugin.ollamaModelsFound.slice(0, MAX_CANDIDATE_MODELS - 1);
      candidateAiModels.push(DEFAULT_OPENAI_MODEL);
    } else {
      candidateAiModels = plugin.ollamaModelsFound.slice(0, MAX_CANDIDATE_MODELS)
    }
  } else if(openAiAPIKey?.length) {
    candidateAiModels = [ DEFAULT_OPENAI_MODEL ];
  }
  return candidateAiModels;
}

// --------------------------------------------------------------------------
async function aiModelFromUserIntervention(plugin, app) {
  const optionSelected = await app.prompt(NO_MODEL_FOUND_TEXT, { inputs: [
      { type: "radio", label: "OpenAI (best for most casual-to-intermediate users)", value: "openai" },
      { type: "radio", label: "Ollama (best for people who want high customization, or a free option)", value: "ollama" }
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
