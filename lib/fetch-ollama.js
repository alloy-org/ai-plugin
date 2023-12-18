import { OLLAMA_URL } from "./constants"
import { fetchJson } from "./fetch-json"

// --------------------------------------------------------------------------
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
export async function callOllama(plugin, app, model, messages) {
  const stream = !plugin.constants.isTestEnvironment;

  const fetchPromise = responseFromChat(plugin, model, messages);

  let responseText = "";
  if (stream)  {
    const reader = fetchPromise.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      try {
        const { response } = JSON.parse(value);
        if (typeof (response) === "string") {
          responseText += response;
          app.alert(responseText, {
            actions: [ { icon: "pending", label: "Generating response" } ],
            scrollToEnd: true,
          });
        }
      } catch (error) {
        console.error(error);
      }
    }
  } else {
    const json = await fetchPromise;
    responseText = json?.message?.content;
  }

  console.log("Ollama sez", responseText);
  return responseText;
}

// --------------------------------------------------------------------------
export async function ollamaAvailableModels(plugin, alertOnEmptyApp = null) {
  // https://github.com/jmorganca/ollama/blob/main/docs/api.md#list-local-models
  return await fetchJson(`${ OLLAMA_URL }/api/tags`).then(json => {
    if (json?.models?.length) {
      const availableModels = json.models.map(m => m.name);
      console.info("Ollama reports", availableModels, "available models");
      return availableModels;
    } else if (Array.isArray(json?.models)) {
      if (alertOnEmptyApp) {
        alertOnEmptyApp.alert("Ollama is running but no LLMs are reported as available. Have you Run 'ollama run llama2' yet?")
      }
    } else {
      return null;
    }
  })
  .catch(error => {
    // Log any errors
    console.log('Error: ' + error);
  });
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function shouldStream(plugin) {
  return !plugin.constants.isTestEnvironment;
}

// --------------------------------------------------------------------------
// Looks like it will be most useful when we want to return a response with specific properties
// (like the array of choices in rhyme/thesaurus?)
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
function responsePromiseFromGenerate(plugin, model, messages) {
  const jsonQuery = { model, stream: shouldStream(plugin) };

  const systemMessage = messages.find(message => message.role === "system");
  if (systemMessage) {
    jsonQuery.system = systemMessage.message;
    messages = messages.filter(message => message.role !== "system");
  }
  jsonQuery.prompt = messages.map(messageObject => messageObject.message).join("\n");

  return fetchJson(`${ OLLAMA_URL }/api/generate`, { payload: jsonQuery, method: "POST" });
}

// --------------------------------------------------------------------------
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-chat-completion
function responseFromChat(plugin, model, messages) {
  return fetchJson(`${ OLLAMA_URL }/api/chat`, {
    payload: { model, messages, stream: shouldStream(plugin) },
    method: "POST",
  });
}
