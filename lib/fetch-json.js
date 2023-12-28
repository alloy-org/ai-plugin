import { REJECTED_RESPONSE_PREFIX } from "./constants"
import { isJsonEndpoint } from "./prompt-api-params"

const streamTimeoutSeconds = 2;

// --------------------------------------------------------------------------
export function shouldStream(plugin) {
  return !plugin.constants.isTestEnvironment;
}

// --------------------------------------------------------------------------
export function jsonFromMessages(messages) {
  const json = {};
  const systemMessage = messages.find(message => message.role === "system");
  if (systemMessage) {
    json.system = systemMessage.content;
    messages = messages.filter(message => message !== systemMessage);
  }
  const rejectedResponseMessage = messages.find(message => message.role === "user" && message.content.startsWith(REJECTED_RESPONSE_PREFIX));
  if (rejectedResponseMessage) {
    json.rejectedResponses = rejectedResponseMessage.content;
    messages = messages.filter(message => message !== rejectedResponseMessage);
  }
  json.prompt = messages[0].content;
  if (messages[1]) {
    console.error("Unexpected messages for JSON:", messages.slice(1));
  }
  return json;
}

// --------------------------------------------------------------------------
// Grab the piece of a string that is contiguous JSON with balanced brackets
export function extractJsonFromString(string) {
  const jsonStart = string.indexOf("{"); // As of Dec 2023, WBH observes that OpenAI is fond of sending back strings like "data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n"
  if (jsonStart === -1) return null;
  const jsonAndAfter = string.substring(jsonStart).trim();
  let openBrackets = 0, jsonText = "";
  for (const char of jsonAndAfter) {
    jsonText += char;
    if (char === "{") {
      openBrackets += 1;
    } else if (char === "}") {
      openBrackets -= 1;
    }
    if (openBrackets === 0) break;
  }
  let json;
  try {
    json = JSON.parse(jsonText);
  } catch(e) {
    console.error("Failed to parse jsonText", e)
    const reformattedText = jsonText.replaceAll(`""`, `"`);
    if (reformattedText !== jsonText) {
      try {
        json = JSON.parse(reformattedText);
      } catch(e) {
        console.error("Reformatted text still fails", e)
      }
    }
  }

  return json;
}

// --------------------------------------------------------------------------
export async function responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds = 10 } = {}) {
  const jsonResponseExpected = isJsonEndpoint(promptKey);

  let result;
  if (streamCallback) {
    result = await responseTextFromStreamResponse(app, response, model, jsonResponseExpected, streamCallback);
    // Remove the indicator that response is still generating. Leave it to caller to potentially remove this window.
    app.alert(result, { scrollToEnd: true });
  } else {
    try {
      await Promise.race([
        new Promise(async (resolve, _) => {
          const jsonResponse = await response.json();
          result = jsonResponse?.choices?.at(0)?.message?.content || jsonResponse?.message?.content || jsonResponse?.response
          resolve(result);
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Ollama timeout")), timeoutSeconds * 1000)
        )
      ]);
    } catch(e) {
      console.error("Failed to parse response from", model, "error", e);
      throw e;
    }
  }

  if (jsonResponseExpected) {
    result = extractJsonFromString(result);
  }

  if (!allowResponse || allowResponse(result)) {
    return result;
  }

  return null;
}

// --------------------------------------------------------------------------
// Defaults to use method GET and Content-Type `application/json`
//
// Example GET
// fetchJson(CODE_REACTIONS_FETCH_PATH, { payload: { code_line_id: props.codeLineId }})
//   .then(json => ...)
//
// Example POSTs
// railsFetchJson(props.markFixReleasedPath, { method: "POST", payload: { defect_key: defectParams.defectKey }})
//   .then(json => json.responseEm === "response_success" ? console.log("Cool") : console.error("Bollocks (sp?)"))
export function fetchJson(endpoint, attrs) {
  attrs = attrs || {};
  if (!attrs.headers) attrs.headers = {};
  attrs.headers["Accept"] = "application/json";
  attrs.headers["Content-Type"] = "application/json";

  const method = (attrs.method || "GET").toUpperCase();
  if (attrs.payload) {
    if (method === "GET") {
      endpoint = extendUrlWithParameters(endpoint, attrs.payload);
    } else {
      attrs.body = JSON.stringify(attrs.payload);
    }
  }

  return fetch(endpoint, attrs).then(response => {
    if (response.ok) {
      return response.json();
    } else {
      throw new Error(`Could not fetch ${ endpoint }: ${ response }`);
    }
  });
}

// --------------------------------------------------------------------------
// Private
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
async function responseTextFromStreamResponse(app, response, aiModel, responseJsonExpected, streamCallback) {
  if (typeof(global) !== "undefined" && typeof(global.fetch) !== 'undefined') { // isomorphic-fetch from tests
    return await streamIsomorphicFetch(app, response, aiModel, responseJsonExpected, streamCallback);
  } else {
    return await streamWindowFetch(app, response, aiModel, responseJsonExpected, streamCallback);
  }
}

// --------------------------------------------------------------------------
async function streamIsomorphicFetch(app, response, aiModel, responseJsonExpected, callback) {
  const responseBody = await response.body;
  let abort, content;

  await responseBody.on('readable', () => {
    let failLoops = 0;
    let receivedContent = "";
    while (failLoops < 3) {
      const chunk = responseBody.read();
      if (chunk) {
        failLoops = 0;
        const decoded = chunk.toString();
        const responseObject = callback(app, decoded, receivedContent, aiModel, responseJsonExpected);
        console.debug("responseObject content", responseObject?.receivedContent);
        ({ abort, receivedContent } = responseObject);
        if (receivedContent) content = receivedContent;
        if (abort) break;
      } else {
        failLoops += 1;
      }
    }
  });

  return content;
}

// --------------------------------------------------------------------------
async function streamWindowFetch(app, response, aiModel, responseJsonExpected, callback) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let error, abort;
  let failLoops = 0;
  let receivedContent = "";

  while (!error) {
    let value = null, done = false;
    try {
      await Promise.race([
        ({ done, value } = await reader.read()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), streamTimeoutSeconds * 1000)
        )
      ])
    } catch (e) {
      error = e;
      console.log(`Failed to receive further stream data in time`, e);
      break;
    }

    if (done || failLoops > 3) {
      console.debug("Completed generating response length");
      break;
    } else if (value) {
      const decodedValue = decoder.decode(value, { stream: true })
      try {
        if (typeof (decodedValue) === "string") {
          failLoops = 0;
          const response = callback(app, decodedValue, receivedContent, aiModel, responseJsonExpected);
          if (response) {
            ({ abort, receivedContent } = response);
            if (abort) break;
          } else {
            console.error("Failed to parse stream from", value, "as JSON");
            failLoops += 1;
          }
        } else {
          console.error("Failed to parse stream from", value, "as JSON");
          failLoops += 1;
        }
      } catch (error) {
        console.error("There was an error parsing the response from stream:", error);
        break;
      }
    } else {
      failLoops += 1;
    }
  }

  return receivedContent;
}

// --------------------------------------------------------------------------
function extendUrlWithParameters(basePath, paramObject) {
  let path = basePath;
  if (basePath.indexOf("?") !== -1) {
    path += "&";
  } else {
    path += "?";
  }

  // Via https://stackoverflow.com/questions/1714786/query-string-encoding-of-a-javascript-object
  // because the standard "use querystring" answer doesn't handle nested objects
  function deepSerialize(object, prefix) {
    const keyValues = [];
    for (let property in object) {
      if (object.hasOwnProperty(property)) {
        const key = prefix ? prefix + "[" + property + "]" : property;
        const value = object[property];
        keyValues.push((value !== null && typeof value === "object")
          ? deepSerialize(value, key)
          : encodeURIComponent(key) + "=" + encodeURIComponent(value)
        );
      }
    }
    return keyValues.join("&");
  }

  path += deepSerialize(paramObject);
  return path;
}
