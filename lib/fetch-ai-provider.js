import { defaultProviderModel, MODELS_PER_PROVIDER, providerNameFromProviderEm, endpointForProvider } from "./constants/provider"
import { jsonResponseFromStreamChunk, responseFromStreamOrChunk, shouldStream, streamPrefaceString } from "./fetch-json"
import { toolsValueFromPrompt } from "./openai-functions"
import { apiKeyFromApp } from "./ai-provider-settings"
import { frequencyPenaltyFromPromptKey, isJsonPrompt } from "./prompt-api-params"

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callRemoteAI(plugin, app, model, messages, promptKey, allowResponse, modelsQueried = []) {
  // Determine provider from model
  const providerEm = providerFromModel(model);
  model = model?.trim()?.length ? model : defaultProviderModel(providerEm);

  const tools = toolsValueFromPrompt(promptKey)
  const streamCallback = shouldStream(plugin) ? streamAccumulate.bind(null, modelsQueried, promptKey) : null;
  try {
    const providerApiKey = apiKeyFromApp(plugin, app, providerEm);
    return await requestWithRetry(app, model, messages, providerEm, tools, providerApiKey, promptKey, streamCallback, allowResponse,
      { timeoutSeconds: plugin.constants.requestTimeoutSeconds });
  } catch (error) {
    if (plugin.isTestEnvironment) {
      throw(error);
    } else {
      const providerName = providerNameFromProviderEm(providerEm);
      app.alert(`Failed to call ${ providerName }: ${ error }`);
    }
    return null;
  }
}

// --------------------------------------------------------------------------
// Determine which provider a model belongs to based on the model name
function providerFromModel(model) {
  for (const [providerEm, models] of Object.entries(MODELS_PER_PROVIDER)) {
    if (models.includes(model)) {
      return providerEm;
    }
  }
  // Default to openai if not found
  return "openai";
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
async function requestWithRetry(app, model, messages, providerEm, tools, apiKey, promptKey, streamCallback, allowResponse, {
    retries = 3, timeoutSeconds = 30 } = {}) {
  let error, response;
  const providerName = providerNameFromProviderEm(providerEm);

  if (!apiKey?.length) {
    app.alert(`Please configure your ${ providerName } API key in plugin settings.`);
    return null;
  }

  const jsonResponseExpected = isJsonPrompt(promptKey);
  for (let i = 0; i < retries; i++) {
    if (i > 0) console.debug(`Loop ${ i + 1 }: Retrying ${ model } with ${ promptKey }`);
    try {
      const body = { model, messages, stream: !!streamCallback };
      if (tools) body.tools = tools;

      // frequency_penalty not supported on o-series, gpt-5, and some other newer models
      const supportsFrequencyPenalty = !model.match(/^(o\d|gpt-5|claude|gemini|grok|sonar)/);
      if (supportsFrequencyPenalty) {
        body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
      }

      if (jsonResponseExpected && (model.includes("gpt-4") || model.includes("gpt-3.5-turbo-1106"))) {
        body.response_format = { type: "json_object" };
      }
      console.debug(`Sending ${ providerEm } body ${ body } at ${ new Date() }`);
      const endpoint = endpointForProvider(providerEm, model);
      response = await Promise.race([
        fetch(endpoint, {
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
    app.alert(`Failed to call ${ providerName }: ${ error }`);
    return null;
  } else if (response.status === 401) {
    app.alert(`Invalid ${ providerName } API key. Please configure your ${ providerName } key in plugin settings.`);
    return null;
  } else {
    const result = await response.json();
    console.error(`API error response from ${ providerName }:`, result);
    if (result && result.error) {
      const errorMessage = result.error.message || JSON.stringify(result.error);
      app.alert(`Failed to call ${ providerName }: ${ errorMessage }`);
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
      const content = jsonResponse.choices?.[0]?.delta?.content ||
        jsonResponse.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments;

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
          break;
        }
      }
    }
  }
  return { abort: stop, failedParseContent, incrementalContents, receivedContent };
}
