import { OLLAMA_URL } from "./constants"
import { fetchJson } from "./fetch-json"

// --------------------------------------------------------------------------
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
export async function callOllama(plugin, app, model, messages) {
  const stream = !plugin.constants.isTestEnvironment;

  const responseText = await responseFromChat(plugin, app, model, messages);

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
    console.log("Error trying to fetch Ollama versions: ", error, "Are you sure Ollama was started with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
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
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-chat-completion
async function responseFromChat(plugin, app, model, messages) {
  const stream = shouldStream(plugin);
  const response = await fetch(`${ OLLAMA_URL }/api/chat`, {
    body: JSON.stringify({ model, messages, stream }),
    method: "POST",
  });

  let responseText = "";
  if (stream) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const jsonResponse = JSON.parse(value.trim());
      console.log("Received", jsonResponse, "value from Ollama");
      const { message: { content } } = jsonResponse;
      console.log("Translates to", content);
      try {
        if (typeof (content) === "string") {
          responseText += content;
          console.log("Response text so far", responseText);
          app.alert(responseText, {
            actions: [ { icon: "pending", label: "Generating response" } ],
            scrollToEnd: true,
          });
        }
      } catch (error) {
        console.log("There was an error parsing the response from Ollama:", error);
        console.error(error);
        break;
      }
    }
  } else {
    const json = response.then(r => r.json());
    responseText = json?.message?.content;
  }

  return responseText;
}

// --------------------------------------------------------------------------
// Looks like it will be most useful when we want to return a response with specific properties
// (like the array of choices in rhyme/thesaurus?)
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
async function responsePromiseFromGenerate(plugin, app, model, messages) {
  const stream = shouldStream(plugin);
  const jsonQuery = { model, stream };
  let responseText = "";

  const systemMessage = messages.find(message => message.role === "system");
  if (systemMessage) {
    jsonQuery.system = systemMessage.message;
    messages = messages.filter(message => message.role !== "system");
  }
  jsonQuery.prompt = messages.map(messageObject => messageObject.message).join("\n");

  const response = await fetch(`${ OLLAMA_URL }/api/generate`, {
    body: JSON.stringify(jsonQuery),
    method: "POST"
  });

  if (stream)  {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
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
    const json = response.then(r => r.json());
    responseText = json?.message?.content;
  }

  return responseText;
}
