import { DEFAULT_OPENAI_MODEL } from "./constants/provider"
import { jsonResponseFromStreamChunk, responseFromStreamOrChunk, shouldStream, streamPrefaceString } from "./fetch-json"
import { toolsValueFromPrompt } from "./openai-functions"
import { apiKeyFromApp } from "./openai-settings"
import { frequencyPenaltyFromPromptKey, isJsonPrompt } from "./prompt-api-params"

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(plugin, app, model, messages, promptKey, allowResponse, modelsQueried = []) {
  model = model?.trim()?.length ? model : DEFAULT_OPENAI_MODEL;

  const tools = toolsValueFromPrompt(promptKey)
  const streamCallback = shouldStream(plugin) ? streamAccumulate.bind(null, modelsQueried, promptKey) : null;
  try {
    return await requestWithRetry(app, model, messages, tools, apiKeyFromApp(plugin, app), promptKey, streamCallback, allowResponse,
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
async function requestWithRetry(app, model, messages, tools, apiKey, promptKey, streamCallback, allowResponse, {
    retries = 3, timeoutSeconds = 30 } = {}) {
  let error, response;

  if (!apiKey?.length) {
    app.alert("Please configure your OpenAI key in plugin settings.");
    return null;
  }

  const jsonResponseExpected = isJsonPrompt(promptKey);
  for (let i = 0; i < retries; i++) {
    if (i > 0) console.debug(`Loop ${ i + 1 }: Retrying ${ model } with ${ promptKey }`);
    try {
      const body = { model, messages, stream: !!streamCallback };
      if (tools) body.tools = tools;
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

  console.debug("Response from promises is", response, "specifically response?.ok", response?.ok)
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
function streamAccumulate(modelsQueriedArray, promptKey, app, decodedValue, receivedContent, aiModel, jsonResponseExpected, failedParseContent) {
  let stop = false, jsonResponse;
  const responses = decodedValue.split(/^data: /m).filter(s => s.trim().length);
  const incrementalContents = [];
  for (const jsonString of responses) {
    if (jsonString.includes("[DONE]")) {
      console.debug("Received [DONE] from jsonString");
      stop = true;
      break;
    }
    ({ failedParseContent, jsonResponse } = jsonResponseFromStreamChunk(jsonString, failedParseContent));

    if (jsonResponse) {
      const content = jsonResponse.choices?.[0]?.delta?.content;

      if (content) {
        incrementalContents.push(content);
        receivedContent += content;
        app.alert(receivedContent, {
          actions: [{ icon: "pending", label: "Generating response", }],
          preface: streamPrefaceString(aiModel, modelsQueriedArray, promptKey, jsonResponseExpected),
          scrollToEnd: true
        });
      } else {
        stop = !!jsonResponse?.finish_reason?.length || !!jsonResponse?.choices?.[0]?.finish_reason?.length;
        if (stop) {
          console.log("Finishing stream for reason", jsonResponse?.finish_reason || jsonResponse?.choices?.[0]?.finish_reason);
        }
        break;
      }
    }
  }
  return { abort: stop, failedParseContent, incrementalContents, receivedContent };
}
