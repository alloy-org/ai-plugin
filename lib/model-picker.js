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
// Take a promptKey and promptParams, and prompt the user to confirm they like the result, or regenerate it with
// a different AI model. Return the text they picked, if they ultimately choose "Accept"
//
// @param {object} app - The app object
// @param {string} noteUUID - The UUID of the note that content will be inserted into
// @param {string} promptKey - The key/type of prompt that will be sent to OpenAI
// @param {object} promptParams - A hash of parameters that get passed through to user prompts
// @param {array|null} preferredModels - An array of models to try (and offer to user) in order
// @param {boolean} confirmInsert - Whether to prompt the user to confirm the insertion of the AI response
// @param {number|null} contentIndex - The index within the note content of the word/paragraph/section that is being analyzed
// @param {array|null} rejectedResponses - An array of responses that have already been rejected
// @returns {string} - The user-chosen AI response
export async function notePromptResponse(plugin, app, noteUUID, promptKey, promptParams, { preferredModels = null, confirmInsert = true,
    contentIndex = null, rejectedResponses = null, allowResponse = null } = {}) {
  const note = await app.notes.find(noteUUID);
  const noteContent = await note.content();
  preferredModels = preferredModels || (await recommendedAiModels(plugin, app, promptKey));
  if (!preferredModels.length) return;

  const startAt = new Date();
  const { response, modelUsed } = await sendQuery(plugin, app, promptKey, { ...promptParams, noteContent },
    { allowResponse, contentIndex, preferredModels, rejectedResponses });
  if (response === null) {
    console.error("No result was returned from sendQuery with models", preferredModels);
    return;
  }

  if (confirmInsert) {
    const actions = [];
    preferredModels.forEach(model => {
      const modelLabel = model.split(":")[0];
      actions.push({ icon: "settings", label: `Try ${ modelLabel }${ preferredModels.length <= 2 && model === modelUsed ? " again" : "" }` });
    });
    const primaryAction = { icon: "post_add", label: "Accept" };

    const selectedValue = await app.alert(response, { actions, preface: `Suggested by ${ modelUsed }`, primaryAction });
    console.debug("User chose", selectedValue, "from", actions);
    if (selectedValue === -1) {
      return response;
    } else if (preferredModels[selectedValue]) {
      const preferredModel = preferredModels[selectedValue];
      const updatedRejects = (rejectedResponses || []);
      updatedRejects.push(response);
      preferredModels = [ preferredModel, ...preferredModels.filter(model => model !== preferredModel) ];
      console.debug("User chose to try", preferredModel, "next so preferred models are", preferredModels);
      const options = { confirmInsert, contentIndex, preferredModels, rejectedResponses: updatedRejects };
      return await notePromptResponse(plugin, app, noteUUID, promptKey, promptParams, options);
    } else if (Number.isInteger(selectedValue)) {
      app.alert(`Did not recognize your selection "${ selectedValue }"`)
    }
  } else {
    // Primary purpose of this summary is to clear the alert that may be lingering from when we streamed the AI response
    const secondsUsed = Math.floor((new Date() - startAt) / 1000);
    app.alert(`Finished generating ${ response } response with ${ modelUsed } in ${ secondsUsed } second${ secondsUsed === 1 ? "" : "s" }`)
    return response;
  }
}

// --------------------------------------------------------------------------
export async function recommendedAiModels(plugin, app, promptKey) {
  let candidateAiModels = []
  if (app.settings[plugin.constants.labelAiModel]?.trim()) {
    candidateAiModels = app.settings[plugin.constants.labelAiModel].trim().split(",").map(w => w.trim()).filter(n => n);
  }

  if (!plugin.noFallbackModels) {
    const ollamaModels = plugin.ollamaModelsFound || (await ollamaAvailableModels(plugin, app))
    if (ollamaModels && !plugin.ollamaModelsFound) {
      plugin.ollamaModelsFound = ollamaModels;
    }

    candidateAiModels = includingFallbackModels(plugin, app, candidateAiModels);

    if (!candidateAiModels.length) {
      candidateAiModels = await aiModelFromUserIntervention(plugin, app);
      if (!candidateAiModels?.length) return null;
    }
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
// @param {function|null} allowResponse - a function that takes a response and returns true if it should be accepted
export async function sendQuery(plugin, app, promptKey, promptParams, { contentIndex = null, preferredModels = null,
    rejectedResponses = null, allowResponse = null } = {}) {
  preferredModels = (preferredModels || await recommendedAiModels(plugin, app, promptKey)).filter(n => n);
  console.debug("Starting to query with preferredModels", preferredModels);
  for (const aiModel of preferredModels) {
    const inputLimit = isModelOllama(aiModel) ? OLLAMA_TOKEN_CHARACTER_LIMIT : openAiTokenLimit(aiModel);
    const messages = promptsFromPromptKey(promptKey, promptParams, contentIndex, rejectedResponses, inputLimit);

    let response;
    plugin.callCountByModel[aiModel] = (plugin.callCountByModel[aiModel] || 0) + 1;
    try {
      response = await responseFromPrompts(plugin, app, aiModel, promptKey, messages, { allowResponse });
    } catch(e) {
      console.error("Caught exception trying to make call with", aiModel, e);
    }

    if (response && (!allowResponse || allowResponse(response))) {
      return { response, modelUsed: aiModel };
    } else {
      plugin.errorCountByModel[aiModel] = (plugin.errorCountByModel[aiModel] || 0) + 1;
      console.error("Failed to make call with", aiModel, "response", response, "while messages are", messages);
    }
  }

  return { response: null, modelUsed: null };
}

// --------------------------------------------------------------------------
export function responseFromPrompts(plugin, app, aiModel, promptKey, messages, { allowResponse = null } = {}) {
  if (isModelOllama(aiModel)) {
    return callOllama(plugin, app, aiModel, messages, promptKey);
  } else {
    return callOpenAI(plugin, app, aiModel, messages, promptKey, { allowResponse });
  }
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function includingFallbackModels(plugin, app, candidateAiModels) {
  if (app.settings[OPENAI_KEY_LABEL]?.length && !candidateAiModels.find(m => m === DEFAULT_OPENAI_MODEL)) {
    candidateAiModels = candidateAiModels.concat(DEFAULT_OPENAI_MODEL);
  } else if (!app.settings[OPENAI_KEY_LABEL]?.length) {
    console.error("No OpenAI key found in", OPENAI_KEY_LABEL, "setting");
  } else if (candidateAiModels.find(m => m === DEFAULT_OPENAI_MODEL)) {
    console.debug("Already an OpenAI model among candidates,", candidateAiModels.find(m => m === DEFAULT_OPENAI_MODEL))
  }
  if (plugin.ollamaModelsFound?.length) {
    candidateAiModels = candidateAiModels.concat(plugin.ollamaModelsFound.filter(m => !candidateAiModels.includes(m)));
  }

  console.debug("Ended with", candidateAiModels);
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
