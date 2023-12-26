import { OLLAMA_MODEL_PREFERENCES, OLLAMA_URL } from "./constants"
import {
  extractJsonFromString,
  fetchJson,
  jsonFromMessages,
  responseTextFromStreamResponse,
  shouldStream
} from "./fetch-json"
import fetch from "isomorphic-fetch"
import { isJsonEndpoint } from "./prompt-api-params.js"

// --------------------------------------------------------------------------
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
export async function callOllama(plugin, app, model, messages, promptKey) {
  const stream = shouldStream(plugin);
  const jsonEndpoint = isJsonEndpoint(promptKey);

  let response;
  if (jsonEndpoint) {
    response = await responsePromiseFromGenerate(plugin, app, model, messages, stream);
  } else {
    response = await responseFromChat(plugin, app, model, messages, stream);
  }

  console.debug("Ollama", model, "model sez", response);
  return response;
}

// --------------------------------------------------------------------------
export async function ollamaAvailableModels(plugin, alertOnEmptyApp = null) {
  // https://github.com/jmorganca/ollama/blob/main/docs/api.md#list-local-models
  return await fetchJson(`${ OLLAMA_URL }/api/tags`).then(json => {
    if (json?.models?.length) {
      const availableModels = json.models.map(m => m.name);
      const transformedModels = availableModels.map(m => m.split(":")[0]);
      const uniqueModels = transformedModels.filter((value, index, array) => array.indexOf(value) === index)
      const sortedModels = uniqueModels.sort((a, b) => {
        const aValue = OLLAMA_MODEL_PREFERENCES.indexOf(a) === -1 ? 10 : OLLAMA_MODEL_PREFERENCES.indexOf(a);
        const bValue = OLLAMA_MODEL_PREFERENCES.indexOf(b) === -1 ? 10 : OLLAMA_MODEL_PREFERENCES.indexOf(b);
        return aValue - bValue;
      })
      console.debug("Ollama reports", availableModels, "available models, transformed to", sortedModels);
      return sortedModels;
    } else if (Array.isArray(json?.models) && alertOnEmptyApp) {
      alertOnEmptyApp.alert("Ollama is running but no LLMs are reported as available. Have you Run 'ollama run llama2' yet?")
    } else {
      return null;
    }
  })
  .catch(error => {
    console.log("Error trying to fetch Ollama versions: ", error, "Are you sure Ollama was started with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
  });
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-chat-completion
async function responseFromChat(plugin, app, model, messages, stream) {
  if (plugin.isTestEnvironment) console.log("Calling Ollama with", model, "and stream", stream);
  const response = await fetch(`${ OLLAMA_URL }/api/chat`, {
    body: JSON.stringify({ model, messages, stream }),
    method: "POST",
  });

  if (response) {
    return await responseFromStreamOrChunk(plugin, app, response, stream, false);
  } else {
    throw new Error("Failed to call Ollama with", model, messages, "and stream", stream, "response was", response, "at", new Date());
  }
}

// --------------------------------------------------------------------------
async function responseFromStreamOrChunk(plugin, app, response, stream, responseJsonExpected) {
  let responseContent = "";
  let responseObject;
  if (stream) {
    responseContent = await responseTextFromStreamResponse(app, response, responseJsonExpected, streamCallback);

    if (responseContent?.length) {
      // Remove the indicator that response is still generating. Leave it to caller to potentially remove this window.
      app.alert(responseContent, { scrollToEnd: true });
    } else {
      return null;
    }
  } else {
    let json;
    try {
      await Promise.race([
        json = await response.json(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Ollama timeout")), plugin.constants.requestTimeoutSeconds * 1000)
        )
      ])
    } catch(e) {
      throw e;
    }

    if (responseJsonExpected) {
      responseObject = extractJsonFromString(json.response);
    } else {
      responseObject = json?.message?.content;
    }
  }

  return responseObject;
}

// --------------------------------------------------------------------------
// Looks like it will be most useful when we want to return a response with specific properties
// (like the array of choices in rhyme/thesaurus?)
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
async function responsePromiseFromGenerate(plugin, app, model, messages, stream) {
  const jsonQuery = jsonFromMessages(messages);
  jsonQuery.model = model;
  jsonQuery.stream = stream;

  let response;
  try {
    await Promise.race([
      response = await fetch(`${ OLLAMA_URL }/api/generate`, {
        body: JSON.stringify(jsonQuery),
        method: "POST"
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Ollama Generate Timeout")), plugin.constants.requestTimeoutSeconds * 1000)
      )
    ])
  } catch(e) {
    throw e;
  }

  return await responseFromStreamOrChunk(plugin, app, response, stream, true)
}

// --------------------------------------------------------------------------
// Called every time a new response is received from the stream
function streamCallback(app, decodedValue, receivedContent, jsonResponseExpected) {
  const jsonResponse = JSON.parse(decodedValue.trim());
  const content = jsonResponse?.message?.content;

  receivedContent += content;
  const userSelection = app.alert(receivedContent, {
    actions: [ { icon: "pending", label: "Generating response" } ],
    scrollToEnd: true,
  });
  if (userSelection === 0) {
    console.error("User chose to abort stream. Todo: return abort here?")
  }
  return { abort: jsonResponse.done, receivedContent };
}
