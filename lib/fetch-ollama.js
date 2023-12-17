import { OLLAMA_URL } from "./constants"
import fetch from "isomorphic-fetch"

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
export async function ollamaIsAvailable() {
  let result;
  await fetch(OLLAMA_URL).then(response => {
    result = response.ok;
  })
  .catch(error => {
    // Log any errors
    console.log('Error: ' + error);
  });
  return result;
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

  return fetch(`${ OLLAMA_URL }/api/generate`, {
    body: JSON.stringify(jsonQuery),
    method: "POST",
  });
}

// --------------------------------------------------------------------------
// https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-chat-completion
function responseFromChat(plugin, model, messages) {
  const fetchOptions = {
    body: JSON.stringify({ model, messages, stream: shouldStream(plugin) }),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    method: "POST",
  };
  console.log("Sending", fetchOptions)
  return fetch(`${ OLLAMA_URL }/api/chat`, fetchOptions).then(response => response.json());
}
