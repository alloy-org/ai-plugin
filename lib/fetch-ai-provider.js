import { defaultProviderModel, providerFromModel, providerNameFromProviderEm, providerEndpointUrl } from "./constants/provider"
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
    return await requestWithRetry(app, model, messages, tools, providerApiKey, promptKey, streamCallback, allowResponse,
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
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Returns the appropriate headers for each AI provider
function headersForProvider(providerEm, apiKey) {
  const baseHeaders = { "Content-Type": "application/json" };

  switch (providerEm) {
    case "anthropic":
      return {
        ...baseHeaders,
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      };
    case "gemini":
      // Gemini uses API key in URL, but still needs content-type header
      return baseHeaders;
    default:
      // OpenAI, DeepSeek, Grok, Perplexity all use Bearer token
      return {
        ...baseHeaders,
        "Authorization": `Bearer ${ apiKey }`
      };
  }
}

// --------------------------------------------------------------------------
/**
 * Builds the request body with provider-specific formatting
 * @param {string} model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @param {boolean} stream - Whether to stream the response
 * @param {Array|null} tools - Optional tools/functions for the model
 * @param {string} promptKey - Key identifying the prompt type for frequency penalty calculation
 * @returns {{
 *   model: string,
 *   messages: Array,
 *   stream: boolean,
 *   max_tokens?: number,
 *   system?: string,
 *   tools?: Array,
 *   frequency_penalty?: number
 * }}
 */
function requestBodyForProvider(model, messages, stream, tools, promptKey) {
  let body;

  switch (providerFromModel(model)) {
    case "anthropic": { // https://docs.anthropic.com/en/api/messages
      // Anthropic requires system message as top-level parameter, not in messages array
      const systemMessage = messages.find(m => m.role === "system");
      const nonSystemMessages = messages.filter(m => m.role !== "system");
      body = {
        model,
        messages: nonSystemMessages,
        stream,
        max_tokens: 4096 // Anthropic requires max_tokens
      };
      if (systemMessage) {
        body.system = systemMessage.content;
      }
      break;
    }
    case "gemini": // https://ai.google.dev/gemini-api/docs/text-generation
    case "grok": // https://docs.x.ai/api/endpoints#chat-completions
    case "perplexity": // https://docs.perplexity.ai/api-reference/chat-completions
      // These providers don't support frequency_penalty
      body = { model, messages, stream };
      if (tools) body.tools = tools;
      break;
    case "deepseek": // https://api-docs.deepseek.com/api/create-chat-completion
    case "openai": // https://platform.openai.com/docs/api-reference/chat/create
    default: {
      body = { model, messages, stream };
      if (tools) body.tools = tools;
      // frequency_penalty not supported on o-series, gpt-5, and some other newer models
      const supportsFrequencyPenalty = !model.match(/^(o\d|gpt-5)/);
      if (supportsFrequencyPenalty) {
        body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
      }
      break;
    }
  }

  return body;
}

// --------------------------------------------------------------------------
async function requestWithRetry(app, model, messages, tools, apiKey, promptKey, streamCallback, allowResponse, {
    retries = 3, timeoutSeconds = 30 } = {}) {
  let error, response;
  const providerEm = providerFromModel(model);
  const providerName = providerNameFromProviderEm(providerEm);

  if (!apiKey?.length) {
    app.alert(`Please configure your ${ providerName } API key in plugin settings.`);
    return null;
  }

  const jsonResponseExpected = isJsonPrompt(promptKey);
  for (let i = 0; i < retries; i++) {
    if (i > 0) console.debug(`Loop ${ i + 1 }: Retrying ${ model } with ${ promptKey }`);
    try {
      const body = requestBodyForProvider(model, messages, !!streamCallback, tools, promptKey);

      if (jsonResponseExpected && (model.includes("gpt-4") || model.includes("gpt-3.5-turbo-1106"))) {
        body.response_format = { type: "json_object" };
      }
      console.debug(`Sending ${ providerEm } body ${ body } at ${ new Date() }`);
      const endpoint = providerEndpointUrl(model, apiKey);
      const headers = headersForProvider(providerEm, apiKey);
      response = await Promise.race([
        fetch(endpoint, {
          method: "POST",
          headers,
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
