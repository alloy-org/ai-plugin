import { DEFAULT_OPENAI_MODEL } from "./constants/provider"
import { responseFromStreamOrChunk, shouldStream, streamPrefaceString } from "./fetch-json"
import { apiKeyFromApp } from "./openai-settings"
import { frequencyPenaltyFromPromptKey, isJsonPrompt } from "./prompt-api-params"

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(plugin, app, model, messages, promptKey, allowResponse, modelsQueried = []) {
  model = model?.trim()?.length ? model : DEFAULT_OPENAI_MODEL;

  const streamCallback = shouldStream(plugin) ? streamAccumulate.bind(null, modelsQueried, promptKey) : null;
  try {
    return await requestWithRetry(app, model, messages, apiKeyFromApp(plugin, app), promptKey, streamCallback, allowResponse,
      { timeoutSeconds: plugin.constants.requestTimeoutSeconds });
  } catch (error) {
    if (plugin.isTestEnvironment) {
      console.error("Failed to call OpenAI", error);
    } else {
      app.alert("Failed to call OpenAI: " + error);
    }
    return null;
  }
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
async function requestWithRetry(app, model, messages, apiKey, promptKey, streamCallback, allowResponse, {
    retries = 3, timeoutSeconds = 30 } = {}) {
  let error, response;

  if (!apiKey?.length) {
    app.alert("Please configure your OpenAI key in plugin settings.");
    return null;
  }

  const jsonResponseExpected = isJsonPrompt(promptKey);
  for (let i = 0; i < retries; i++) {
    try {
      const body = { model, messages, stream: !!streamCallback };
      // https://platform.openai.com/docs/api-reference/chat/create
      body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
      if (jsonResponseExpected && (model.includes("gpt-4") || model.includes("gpt-3.5-turbo-1106"))) {
        body.response_format = { type: "json_object" };
      }
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

    if (response?.ok) {
      break;
    }
  }

  if (response?.ok) {
    return await responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds });
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
function streamAccumulate(modelsQueriedArray, promptKey, app, decodedValue, receivedContent, aiModel, jsonResponseExpected) {
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
        preface: streamPrefaceString(aiModel, modelsQueriedArray, promptKey, jsonResponseExpected),
        scrollToEnd: true
      });
    } else {
      stop = !!json?.finish_reason?.length || !!json?.choices?.[0]?.finish_reason?.length;
      break;
    }
  }
  return { abort: stop, receivedContent };
}
