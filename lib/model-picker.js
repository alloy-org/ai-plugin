import { callOllama, ollamaAvailableModels } from "./fetch-ollama"
import { callOpenAI } from "./fetch-openai"
import { promptsFromPromptKey } from "./prompts"

// --------------------------------------------------------------------------
// Gather messages to be sent to AI client, then call it and return its response
export async function sendQuery(plugin, app, promptKey, promptParams, rejectedResponses = null) {
  const messages = promptsFromPromptKey(promptKey, promptParams, rejectedResponses);
  let preferredAiModels = app.settings[plugin.constants.labelAiModel]?.trim()?.split(",")?.map(w => w.trim());
  const ollamaModels = plugin.ollamaModelsFound || (await ollamaAvailableModels(plugin, app))
  if (ollamaModels && !plugin.ollamaModelsFound) plugin.ollamaModelsFound = ollamaModels;

  if (!preferredAiModels || preferredAiModels.length === 0) {
    if (ollamaModels?.length) {
      preferredAiModels = ollamaModels;
      if (app.settings[plugin.constants.labelApiKey]?.length) {
        preferredAiModels.push("gpt-3.5-turbo");
      }
    } else {
      preferredAiModels = [ "gpt-3.5-turbo" ];
    }
  }

  for (let i = 0; i < preferredAiModels.length; i++) {
    const aiModel = preferredAiModels[i];
    const callOpenAi = [ "gpt-4", "gpt-3.5-turbo", ].includes(aiModel) || !ollamaModels;

    let response;
    if (callOpenAi) {
      response = await callOpenAI(plugin, app, aiModel, messages);
    } else {
      response = await callOllama(plugin, app, aiModel, messages);
    }

    if (response) {
      return response;
    } else {
      console.error("Failed to make call with", aiModel);
    }
  }

  return null;
}
