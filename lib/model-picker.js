import { NO_MODEL_FOUND_TEXT, OLLAMA_INSTALL_TEXT, OPENAI_API_KEY_TEXT, OPENAI_INVALID_KEY_TEXT } from "./constants/prompt-strings"
import {
  defaultProviderModel,
  isModelOllama,
  MIN_OPENAI_KEY_CHARACTERS,
  PROVIDER_DEFAULT_MODEL,
} from "./constants/provider"
import { PROVIDER_SETTING_KEY_LABELS } from "./constants/settings"
import { callOllama, ollamaAvailableModels } from "./fetch-ollama"
import { callOpenAI } from "./fetch-ai-provider"
import { contentfulPromptParams, promptsFromPromptKey } from "./prompts"

const MAX_CANDIDATE_MODELS = 3;

// --------------------------------------------------------------------------
// Take a promptKey and promptParams, and prompt the user to confirm they like the result, or regenerate it with
// a different AI model. Return the text they picked, if they ultimately choose "Accept"
//
// @param {object} app - The app object
// @param {string} noteUUID - The UUID of the note that content will be inserted into
// @param {string} promptKey - The key/type of prompt that will be sent to OpenAI
// @param {object} promptParams - A hash of parameters that get passed through to user prompts. Sometimes nothing. Sometimes e.g., `text`, `noteContent`, `instruction`
// @param {array|null} preferredModels - An array of models to try (and offer to user) in order
// @param {boolean} confirmInsert - Whether to prompt the user to confirm the insertion of the AI response
// @param {number|null} contentIndex - The index within the note content of the word/paragraph/section that is being analyzed
// @param {array|null} rejectedResponses - An array of responses that have already been rejected
// @returns {string} - The user-chosen AI response
export async function notePromptResponse(plugin, app, noteUUID, promptKey, promptParams, { preferredModels = null, confirmInsert = true,
    contentIndex = null, rejectedResponses = null, allowResponse = null, contentIndexText } = {}) {
  preferredModels = preferredModels || (await recommendedAiModels(plugin, app, promptKey));
  if (!preferredModels.length) return;

  const startAt = new Date();
  const { response, modelUsed } = await sendQuery(plugin, app, noteUUID, promptKey, promptParams,
    { allowResponse, contentIndex, contentIndexText, preferredModels, rejectedResponses });
  if (response === null) {
    app.alert("Failed to receive a usable response from AI");
    console.error("No result was returned from sendQuery with models", preferredModels);
    return;
  }

  if (confirmInsert) {
    const actions = [];
    preferredModels.forEach(model => {
      const modelLabel = model.split(":")[0];
      actions.push({ icon: "chevron_right", label: `Try ${ modelLabel }${ model === modelUsed ? " again" : "" }` });
    });
    const primaryAction = { icon: "check_circle", label: "Approve" };
    let responseAsText = response, jsonResponse = false;
    if (typeof(response) === "object") {
      if (response.result?.length) {
        responseAsText = "Results:\n* " + response.result.join("\n * ");
      } else {
        jsonResponse = true;
        responseAsText = JSON.stringify(response);
      }
    }
    const selectedValue = await app.alert(responseAsText, {
      actions,
      preface: `${ jsonResponse ? "JSON response s" : "S" }uggested by ${ modelUsed }\nWill be utilized after your preliminary approval`,
      primaryAction
    });
    console.debug("User chose", selectedValue, "from", actions);
    if (selectedValue === -1) {
      return response;
    } else if (preferredModels[selectedValue]) {
      const preferredModel = preferredModels[selectedValue];
      const updatedRejects = (rejectedResponses || []);
      updatedRejects.push(responseAsText);
      preferredModels = [ preferredModel, ...preferredModels.filter(model => model !== preferredModel) ];
      console.debug("User chose to try", preferredModel, "next so preferred models are", preferredModels, "Rejected responses now", updatedRejects);
      return await notePromptResponse(plugin, app, noteUUID, promptKey, promptParams, {
        confirmInsert, contentIndex, preferredModels, rejectedResponses: updatedRejects
      });
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

  if (plugin.lastModelUsed && (!isModelOllama(plugin.lastModelUsed) || plugin.ollamaModelsFound?.includes(plugin.lastModelUsed))) {
    candidateAiModels.push(plugin.lastModelUsed);
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

  // WBH observes that chatgpt-3.5 is incapable of sorting lists via JSON in less than 30 seconds (and often fails to do so at all)
  if ([ "sortGroceriesJson" ].includes(promptKey)) {
    candidateAiModels = candidateAiModels.filter(m => m.includes("gpt-4"));
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
export async function sendQuery(plugin, app, noteUUID, promptKey, promptParams, { contentIndex = null, contentIndexText = null,
    preferredModels = null, rejectedResponses = null, allowResponse = null } = {}) {
  preferredModels = (preferredModels || await recommendedAiModels(plugin, app, promptKey)).filter(n => n);
  console.debug("Starting to query", promptKey, "with preferredModels", preferredModels);
  let modelsQueried = [];
  for (const aiModel of preferredModels) {
    const queryPromptParams = await contentfulPromptParams(app, noteUUID, promptKey, promptParams, aiModel,
      { contentIndex, contentIndexText });

    const messages = promptsFromPromptKey(promptKey, queryPromptParams, rejectedResponses, aiModel);

    let response;
    plugin.callCountByModel[aiModel] = (plugin.callCountByModel[aiModel] || 0) + 1;
    plugin.lastModelUsed = aiModel;
    modelsQueried.push(aiModel);
    try {
      response = await responseFromPrompts(plugin, app, aiModel, promptKey, messages, { allowResponse, modelsQueried });
    } catch(e) {
      console.error("Caught exception trying to make call with", aiModel, e);
    }

    if (response && (!allowResponse || allowResponse(response))) {
      return { response, modelUsed: aiModel };
    } else {
      plugin.errorCountByModel[aiModel] = (plugin.errorCountByModel[aiModel] || 0) + 1;
      console.error("Failed to make call with", aiModel, "response", response, "while messages are", messages, "Error counts", plugin.errorCountByModel);
    }
  }

  if (modelsQueried.length && modelsQueried.find(m => isModelOllama(m))) {
    const availableModels = await ollamaAvailableModels(plugin, app);
    plugin.ollamaModelsFound = availableModels;
    console.debug("Found availableModels", availableModels, "after receiving no results in sendQuery. plugin.ollamaModelsFound is now", plugin.ollamaModelsFound);
  }

  plugin.lastModelUsed = null;
  return { response: null, modelUsed: null };
}

// --------------------------------------------------------------------------
export function responseFromPrompts(plugin, app, aiModel, promptKey, messages, { allowResponse = null, modelsQueried = null } = {}) {
  if (isModelOllama(aiModel)) {
    return callOllama(plugin, app, aiModel, messages, promptKey, allowResponse, modelsQueried);
  } else {
    return callOpenAI(plugin, app, aiModel, messages, promptKey, allowResponse, modelsQueried);
  }
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function includingFallbackModels(plugin, app, candidateAiModels) {
  for (const providerEm of Object.keys(PROVIDER_SETTING_KEY_LABELS)) {
    const providerSettingLabel = PROVIDER_SETTING_KEY_LABELS[providerEm];
    if (app.settings[providerSettingLabel]?.length && !candidateAiModels.find(m => m === PROVIDER_DEFAULT_MODEL[providerEm])) {
      candidateAiModels.push(PROVIDER_DEFAULT_MODEL[providerEm]);
      console.debug(`Added ${ providerSettingLabel } model ${ PROVIDER_DEFAULT_MODEL[providerEm] } to candidates`);
    }
  }

  if (plugin.ollamaModelsFound?.length) {
    candidateAiModels = candidateAiModels.concat(plugin.ollamaModelsFound.filter(m => !candidateAiModels.includes(m)));
  }

  console.debug("Ended with", candidateAiModels);
  return candidateAiModels;
}

// --------------------------------------------------------------------------
async function aiModelFromUserIntervention(plugin, app, { optionSelected = null } = {}) {
  optionSelected = optionSelected || await app.prompt(NO_MODEL_FOUND_TEXT, { inputs: [
      {
        type: "radio",
        label: "Which model would you prefer to use?",
        options: [
          { label: "OpenAI: best for most users. Offers image generation", value: "openai" },
          { label: "Ollama: best for experts who want high customization, or a free option)", value: "ollama" }
        ],
        value: "openai",
      }
    ]
  });

  if (optionSelected === "openai") {
    const openaiKey = await app.prompt(OPENAI_API_KEY_TEXT);
    if (openaiKey && openaiKey.length >= MIN_OPENAI_KEY_CHARACTERS ) {
      app.setSetting(plugin.constants.labelApiKey, openaiKey.trim());
      await app.alert(`An OpenAI was successfully stored. The default OpenAI model, "${ defaultProviderModel("openai") }", will be used for future AI lookups.`);
      return [ defaultProviderModel("openai") ];
    } else {
      console.debug("User entered invalid OpenAI key");
      const nextStep = await app.alert(OPENAI_INVALID_KEY_TEXT, { actions: [
        { icon: "settings", label: "Retry entering key" },
      ]});
      console.debug("nextStep selected", nextStep);
      if (nextStep === 0) {
        return await aiModelFromUserIntervention(plugin, app, { optionSelected });
      }
      return null;
    }
  } else if (optionSelected === "ollama") {
    await app.alert(OLLAMA_INSTALL_TEXT);
    return null;
  }
}
