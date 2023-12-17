import { OLLAMA_URL } from "./constants"
import fetch from "isomorphic-fetch"

// --------------------------------------------------------------------------
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
// Of particular relevant here https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
export async function callOllama(plugin, app, model, messages) {
  const stream = !plugin.constants.isTestEnvironment;
  const jsonQuery = {
    model,
    prompt: messages,
    stream,
  };

  const systemMessage = messages.find(message => message.role === "system");
  if (systemMessage) {
    messages = messages.filter(message => message.role !== "system");
  }

  const fetchPromise = fetch(`${ OLLAMA_URL }/api/generate`, {
    body: JSON.stringify(jsonQuery),
    method: "POST",
  });

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
    responseText = await fetchPromise.text();
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
