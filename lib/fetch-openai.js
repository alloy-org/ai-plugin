import { DEFAULT_OPENAI_MODEL } from "./constants"
import { responseTextFromStreamResponse, shouldStream } from "./fetch-json"
import fetch from "isomorphic-fetch"

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(plugin, app, model, messages, { allowResponse = null } = {}) {
  model = model?.trim()?.length ? model : DEFAULT_OPENAI_MODEL;

  const stream = shouldStream(plugin);
  try {
    return await requestWithRetry(app, model, messages, apiKeyFromApp(plugin, app),
      { timeoutSeconds: plugin.constants.requestTimeoutSeconds, allowResponse, stream });
  } catch (error) {
    app.alert("Failed to call OpenAI: " + error);
    return null;
  }
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function apiKeyFromApp(plugin, app) {
  if (app.settings[plugin.constants.labelApiKey]) {
    return app.settings[plugin.constants.labelApiKey].trim();
  } else if (app.settings["API Key"]) { // Legacy setting name
    return app.settings["API Key"].trim();
  } else {
    if (plugin.constants.isTestEnvironment) {
      throw new Error(`Couldnt find an OpenAI key in ${ plugin.constants.labelApiKey }`);
    } else {
      app.alert("Please configure your OpenAI key in plugin settings.");
    }
    return null;
  }
}

// --------------------------------------------------------------------------
async function requestWithRetry(app, model, messages, apiKey, { allowResponse = null, retries = 3, stream = null,
    timeoutSeconds = 30 } = {}) {
  let error, response;

  if (!apiKey?.length) {
    app.alert("Please configure your OpenAI key in plugin settings.");
    return null;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const body = JSON.stringify({ model, messages, stream });
      console.log("Sending OpenAI", body, "query at", new Date());
      response = await Promise.race([
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ apiKey }`,
            "Content-Type": "application/json"
          },
          body,
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

  if (response?.ok) {
    let result = "";
    if (stream) {
      const streamCallback = decodedValue => {
        console.debug("OpenAI stream received", decodedValue, "of type", typeof(decodedValue));
        const json = JSON.parse(decodedValue);
        const content = json?.choices?.[0]?.delta?.content;
        result += content;
        const userSelection = app.alert(result, { actions: [ { icon: "pending", label: "Cancel generating response", value: "cancel" } ], scrollToEnd: true });
        if (userSelection === "cancel") {
          console.debug("User chose to cancel stream");
          return true;
        }
      }
      result = await responseTextFromStreamResponse(app, response, streamCallback);
    } else {
      result = await response.json();
    }

    const { choices: [ { message: { content } } ] } = result;
    if (!allowResponse || allowResponse(content)) {
      return content;
    }
  } else if (!response) {
    app.alert("Failed to call OpenAI: " + error);
    return null;
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
