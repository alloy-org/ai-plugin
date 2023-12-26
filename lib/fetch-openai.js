import { DEFAULT_OPENAI_MODEL } from "./constants"
import { extractJsonFromString, responseTextFromStreamResponse, shouldStream } from "./fetch-json"
import fetch from "isomorphic-fetch"
import { frequencyPenaltyFromPromptKey, isJsonEndpoint } from "./prompt-api-params"

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(plugin, app, model, messages, promptKey, { allowResponse = null } = {}) {
  model = model?.trim()?.length ? model : DEFAULT_OPENAI_MODEL;

  const stream = shouldStream(plugin);
  try {
    return await requestWithRetry(app, model, messages, apiKeyFromApp(plugin, app), promptKey,
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
async function requestWithRetry(app, model, messages, apiKey, promptKey, {
    allowResponse = null, retries = 3, stream = null, timeoutSeconds = 30 } = {}) {
  let error, response;

  if (!apiKey?.length) {
    app.alert("Please configure your OpenAI key in plugin settings.");
    return null;
  }

  const jsonResponseExpected = isJsonEndpoint(promptKey);
  for (let i = 0; i < retries; i++) {
    try {
      const body = { model, messages, stream };
      // https://platform.openai.com/docs/api-reference/chat/create
      body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
      if (jsonResponseExpected && model.includes("gpt-4")) body.response_format = { type: "json_object" };
      console.debug("Sending OpenAI", body, "query at", new Date());
      response = await Promise.race([
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ apiKey }`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
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

  let content;
  if (response?.ok) {
    let result = "";
    if (stream) {
      // Result is populated via the streamCallback in this case
      result = await responseTextFromStreamResponse(app, response, model, jsonResponseExpected, streamCallback);
      // Remove the indicator that response is still generating. Leave it to caller to potentially remove this window.
      app.alert(result, { scrollToEnd: true });
    } else {
      const unstreamedResult = await response.json();
      ({ choices: [ { message: { content } } ] } = unstreamedResult);
      result = content;
    }

    if (jsonResponseExpected) {
      result = extractJsonFromString(result);
    }

    if (!allowResponse || allowResponse(result)) {
      return result;
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

// --------------------------------------------------------------------------
// Decode individual blocks of response from OpenAI stream
function streamCallback(app, decodedValue, receivedContent, aiModel, jsonResponseExpected) {
  let stop = false;
  const responses = decodedValue.split(/^data: /m).filter(s => s.trim().length);
  for (const jsonString of responses) {
    if (jsonString.includes("[DONE]")) {
      stop = true;
      break;
    }
    const jsonStart = jsonString.indexOf("{"); // As of Dec 2023, WBH observes that OpenAI is fond of sending back strings like "data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n"
    const json = JSON.parse(jsonString.substring(jsonStart).trim());
    const content = json?.choices?.[0]?.delta?.content;
    if (content) {
      receivedContent += content;
      app.alert(receivedContent, {
        actions: [{ icon: "pending", label: "Generating response", }],
        preface: `${ aiModel } is generating ${ jsonResponseExpected ? "JSON " : "" }response...`,
        scrollToEnd: true
      });
    } else {
      stop = !!json?.finish_reason?.length;
      break;
    }
  }
  return { abort: stop, receivedContent };
}
