import { OLLAMA_MODEL_PREFERENCES, OLLAMA_URL } from "./constants/provider"
import {
  fetchJson,
  jsonFromMessages,
  responseFromStreamOrChunk,
  shouldStream
} from "./fetch-json"
import { isJsonEndpoint } from "./prompt-api-params.js"

// --------------------------------------------------------------------------
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
export async function callOllama(plugin, app, model, messages, promptKey, allowResponse) {
  const stream = shouldStream(plugin);
  const jsonEndpoint = isJsonEndpoint(promptKey);

  let response;
  const streamCallback = stream ? streamAccumulate : null;
  if (jsonEndpoint) {
    response = await responsePromiseFromGenerate(app, messages, model, promptKey, streamCallback, allowResponse,
      plugin.constants.requestTimeoutSeconds);
  } else {
    response = await responseFromChat(app, messages, model, promptKey, streamCallback, allowResponse,
      plugin.constants.requestTimeoutSeconds, { isTestEnvironment: plugin.isTestEnvironment });
  }

  console.debug("Ollama", model, "model sez:\n", response);
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
async function responseFromChat(app, messages, model, promptKey, streamCallback, allowResponse, timeoutSeconds, { isTestEnvironment = false } = {}) {
  if (isTestEnvironment) console.log("Calling Ollama with", model, "and streamCallback", streamCallback);
  let response;
  try {
    await Promise.race([
      response = await fetch(`${ OLLAMA_URL }/api/chat`, {
        body: JSON.stringify({ model, messages, stream: !!streamCallback }),
        method: "POST"
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Ollama Generate Timeout")), timeoutSeconds * 1000))
    ]);
  } catch(e)  {
    throw e;
  }

  if (response?.ok) {
    return await responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds });
  } else {
    throw new Error("Failed to call Ollama with", model, messages, "and stream", !!streamCallback, "response was", response, "at", new Date());
  }
}

// --------------------------------------------------------------------------
// Looks like it will be most useful when we want to return a response with specific properties
// (like the array of choices in rhyme/thesaurus?)
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
async function responsePromiseFromGenerate(app, messages, model, promptKey, streamCallback, allowResponse, timeoutSeconds) {
  const jsonQuery = jsonFromMessages(messages);
  jsonQuery.model = model;
  jsonQuery.stream = !!streamCallback;

  let response;
  try {
    await Promise.race([
      response = await fetch(`${ OLLAMA_URL }/api/generate`, {
        body: JSON.stringify(jsonQuery),
        method: "POST"
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Ollama Generate Timeout")), timeoutSeconds * 1000)
      )
    ])
  } catch(e) {
    throw e;
  }

  return await responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse,
    { timeoutSeconds })
}

// --------------------------------------------------------------------------
// Called every time a new response is received from the stream
function streamAccumulate(app, decodedValue, receivedContent, aiModel, jsonResponseExpected) {
  let jsonResponse, content = "";
  // Ensure that we aren't splitting on a newline, or a "}\n" that might be returned within a "response"
  const responses = decodedValue.replace(/}\s*\n\{/g, "} \n{").split(" \n");
  for (const response in responses) {
    try {
      // If we receive a JSON response that contains `response: "\n"`, JSON.parse as of Dec 2023 throw an error "Bad control character in string literal in JSON at position 73 (line 1 column 74)"
      jsonResponse = JSON.parse(decodedValue.replace(/"\n/, `"\\n`).trim());
    } catch(e) {
      console.debug("Failed to parse JSON from", decodedValue);
      console.debug("Attempting to parse yielded error", e, "Received content so far is", receivedContent, "this stream deduced", responses.length, "responses");
      return { receivedContent };
    }

    const responseContent = jsonResponse?.message?.content || jsonResponse?.response;
    if (responseContent) {
      content += responseContent
    } else {
      console.debug("No response content found in decodedValue response", decodedValue);
    }
  }

  if (content) {
    receivedContent += content;
    const userSelection = app.alert(receivedContent, {
      actions: [{ icon: "pending", label: "Generating response" }],
      preface: `${ aiModel } is generating ${ jsonResponseExpected ? "JSON " : "" }response...`,
      scrollToEnd: true,
    });
    if (userSelection === 0) {
      console.error("User chose to abort stream. Todo: return abort here?")
    }
  }
  return { abort: jsonResponse.done, receivedContent };
}
