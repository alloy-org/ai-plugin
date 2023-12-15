import fetch from "isomorphic-fetch"
import { userPromptFromPromptKey, SYSTEM_PROMPTS } from "./plugin-prompts"
import { truncate } from "./util"

export const DEFAULT_TRUNCATE_LIMIT = 12000; // GPT-3.5 has a 4097 token limit, and OpenAI limits that each token is 4-6 characters, implying a 16k-24k character limit. We're being conservative and limiting to 12k characters.

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(plugin, app, messages) {
  let model = app.settings[plugin.constants.labelOpenAiModel];
  model = model?.trim()?.length ? model : "gpt-3.5-turbo";

  try {
    return await requestWithRetry(app, model, messages, plugin.apiKey(app),
      { timeoutSeconds: plugin.constants.requestTimeoutSeconds });
  } catch (error) {
    app.alert("Failed to call OpenAI: " + error);
    return null;
  }
}

// --------------------------------------------------------------------------
// Gather messages to be sent to OpenAI, then call OpenAI and return its response
export async function buildMessagesAndCallOpenAI(plugin, app, promptKey, promptParams) {
  const messages = promptsFromPromptKey(promptKey, promptParams);
  return await callOpenAI(plugin, app, messages);
}

// --------------------------------------------------------------------------
/** Generate array of messages (system & user) to be sent to OpenAI, based on the prompt key & params
 * @param {string} promptKey - a key that should be present among USER_PROMPTS
 * @param {object} promptParams - an object of parameters that get passed through to USER_PROMPTS
 * @returns {array} - an array of messages to be sent to OpenAI
 */
export function promptsFromPromptKey(promptKey, promptParams) {
  let messages = [];

  const systemPrompt = SYSTEM_PROMPTS[promptKey] || SYSTEM_PROMPTS.defaultPrompt;
  messages.push({ role: "system", content: systemPrompt });

  const userPrompt = userPromptFromPromptKey(promptKey, promptParams, DEFAULT_TRUNCATE_LIMIT);
  if (Array.isArray(userPrompt)) {
    userPrompt.forEach(content => {
      messages.push({ role: "user", content: truncate(content) });
    });
  } else {
    messages.push({ role: "user", content: truncate(userPrompt) });
  }

  return messages;
}

// --------------------------------------------------------------------------
async function requestWithRetry(app, model, messages, apiKey, { retries = 3, timeoutSeconds = 30 } = {}) {
  let error, response;

  for (let i = 0; i < retries; i++) {
    try {
      response = await Promise.race([
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ apiKey }`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model, messages })
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeoutSeconds * 1000)
        )
      ]);
    } catch (e) {
      error = e;
      console.log(`Attempt ${ i + 1 } failed with`, e, `at ${ new Date() }. Retrying...`);
    }
  }

  if (!response) {
    app.alert("Failed to call OpenAI: " + error);
    return null;
  } else if (response.ok) {
    const result = await response.json();

    const { choices: [ { message: { content } } ] } = result;
    return content;
  } else if (response.status === 401) {
    app.alert("Invalid OpenAI key. Please configure your OpenAI key in plugin settings.");
    return null;
  } else {
    const result = await response.json();
    if (result && result.error) {
      app.alert("Failed to call OpenAI: " + result.error.message);
      return null;
    }
  }
}
