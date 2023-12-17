import { OLLAMA_URL } from "./constants"
import fetch from "isomorphic-fetch"

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(plugin, app, model, messages) {
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
// Ollama API docs, illustrating params available via fetch: https://github.com/jmorganca/ollama/blob/main/docs/api.md
// Of particular relevant here https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-a-completion
export async function callOllama(plugin, app, model, messages) {
  const stream = !plugin.constants.isTestEnvironment;
  const fetchPromise = fetch(`${ OLLAMA_URL }/api/generate`, {
    body: JSON.stringify({
      model,
      prompt: messages
    }),
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

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

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
