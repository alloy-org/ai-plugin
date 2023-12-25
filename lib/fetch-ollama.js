import { OLLAMA_URL } from "./constants"
import { fetchJson, responseTextFromStreamResponse, shouldStream } from "./fetch-json"
import fetch from "isomorphic-fetch"

// --------------------------------------------------------------------------
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
export async function callOllama(plugin, app, model, messages) {
  const stream = shouldStream(plugin);

  const responseText = await responseFromChat(plugin, app, model, messages, stream);

  console.log("Ollama sez", responseText);
  return responseText;
}

// --------------------------------------------------------------------------
export async function ollamaAvailableModels(plugin, alertOnEmptyApp = null) {
  // https://github.com/jmorganca/ollama/blob/main/docs/api.md#list-local-models
  return await fetchJson(`${ OLLAMA_URL }/api/tags`).then(json => {
    if (json?.models?.length) {
      const availableModels = json.models.map(m => m.name);
      const transformedModels = availableModels.map(m => m.split(":")[0]);
      console.debug("Ollama reports", availableModels, "available models, transformed to", transformedModels);
      const uniqueModels = transformedModels.filter((value, index, array) => array.indexOf(value) === index)
      return uniqueModels;
    } else if (Array.isArray(json?.models)) {
      if (alertOnEmptyApp) {
        alertOnEmptyApp.alert("Ollama is running but no LLMs are reported as available. Have you Run 'ollama run llama2' yet?")
      }
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
    return await responseFromStreamOrChunk(plugin, app, response, stream);
  } else {
    throw new Error("Failed to call Ollama with", model, messages, "and stream", stream, "response was", response, "at", new Date());
  }
}

// --------------------------------------------------------------------------
async function responseFromStreamOrChunk(plugin, app, response, stream) {
  let responseText = "";
  if (stream) {
    responseText = await responseTextFromStreamResponse(app, response, streamCallback);

    if (responseText?.length) {
      // Remove the indicator that response is still generating. Leave it to caller to potentially remove this window.
      app.alert(responseText, { scrollToEnd: true });
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
    responseText = json?.message?.content;
  }

  return responseText;
}

// --------------------------------------------------------------------------
// Looks like it will be most useful when we want to return a response with specific properties
// (like the array of choices in rhyme/thesaurus?)
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
async function responsePromiseFromGenerate(plugin, app, model, messages, stream) {
  const jsonQuery = { model, stream };

  const systemMessage = messages.find(message => message.role === "system");
  if (systemMessage) {
    jsonQuery.system = systemMessage.message;
    messages = messages.filter(message => message.role !== "system");
  }
  jsonQuery.prompt = messages.map(messageObject => messageObject.message).join("\n");

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

  return await responseFromStreamOrChunk(plugin, app, response, stream)
}

// --------------------------------------------------------------------------
// Called every time a new response is received from the stream
function streamCallback(app, decodedValue, receivedContent) {
  const jsonResponse = JSON.parse(decodedValue.trim());
  const content = jsonResponse?.message?.content;

  receivedContent += content;
  const userSelection = app.alert(responseText, {
    actions: [ { icon: "pending", label: "Generating response" } ],
    scrollToEnd: true,
  });
  if (userSelection === 0) {
    console.error("User chose to abort stream. Todo: return abort here?")
  }
  return { abort: jsonResponse.done, receivedContent };
}
