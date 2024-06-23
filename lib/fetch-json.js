import { REJECTED_RESPONSE_PREFIX } from "./constants/functionality"
import { MAX_SPACES_ABORT_RESPONSE } from "./constants/settings"
import { isJsonPrompt } from "./prompt-api-params"
import { balancedJsonFromString } from "./util"

const streamTimeoutSeconds = 2;

// --------------------------------------------------------------------------
export function shouldStream(plugin) {
  return !plugin.constants.isTestEnvironment || plugin.constants.streamTest;
}

// --------------------------------------------------------------------------
export function streamPrefaceString(aiModel, modelsQueried, promptKey, jsonResponseExpected) {
  let responseText = "";
  if ([ "chat" ].indexOf(promptKey) === -1 && modelsQueried.length > 1) {
    responseText += `Response from ${ modelsQueried[modelsQueried.length - 1] } was rejected as invalid.\n`
  }
  responseText += `${ aiModel } is now generating ${ jsonResponseExpected ? "JSON " : "" }response...`
  return responseText;
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
export function extractJsonFromString(inputString) {
  let jsonText = inputString.trim();
  let jsonStart = jsonText.indexOf("{");
  if (jsonStart === -1) {
    jsonStart = 0;
    jsonText = "{" + jsonText;
  }
  // Observed necessary in June 2024 before sending functions to retrieve arrays, the first few characters of result array were often absent. TBD if this continues with functions
  // const textAfterBracket = jsonText.substring(jsonStart + 1);
  // if (textAfterBracket && /^\r?e?s?ult/.test(textAfterBracket)) {
  //   const addR = /^e?s?ult/.test(textAfterBracket);
  //   const addE = addR && /^s?ult/.test(textAfterBracket);
  //   const addS = addE && /^ult/.test(textAfterBracket);
  //   jsonText = `{"${ addR ? "r" : "" }${ addE ? "e" : "" }${ addS ? "s" : "" }${ textAfterBracket }`;
  // }
  let responses;
  if (jsonText.split("}{").length > 1) {
    responses = jsonText.split("}{").map(text => `${ text[0] === "{" ? "" : "{" }${ text }${ text[text.length - 1] === "}" ? "" : "}" }`)
  } else {
    responses = [ jsonText ];
  }

  for (jsonText of responses) {
    let json;
    let jsonEnd = jsonText.lastIndexOf("}") + 1;
    if (jsonEnd === 0) { // If we didn't finish the JSON, there might still be usable signal if we can adapt it to be parseable
      if (jsonText[jsonText.length - 1] === ",") jsonText = jsonText.substring(0, jsonText.length - 1)
      if (jsonText.includes("[") && !jsonText.includes("]")) jsonText += "]";
      jsonText = `${ jsonText }}`;
    } else {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }
    try {
      json = JSON.parse(jsonText);
      return json;
    } catch (e) {
      console.error("Failed to parse jsonText", e)
      jsonText = balancedJsonFromString(jsonText);
      try {
        json = JSON.parse(jsonText);
        return json;
      } catch (e)  {
        console.error("Rebalanced jsonText still fails", e);
      }

      // Fix possibly unescaped quotes and newlines
      let reformattedText = jsonText.replace(/"""/g, `"\\""`).replace(/"\n/g, `"\\n`);

      // Fix potential use of single or unicode quote characters for array members when JSON.parse expects doubles
      reformattedText = reformattedText.replace(/\n\s*['“”]/g, `\n"`).
        replace(/['“”],\s*\n/g, `",\n`).replace(/['“”]\s*([\n\]])/, `"$1`);

      if (reformattedText !== jsonText) {
        try {
          json = JSON.parse(reformattedText);
          return json;
        } catch (e) {
          console.error("Reformatted text still fails", e)
        }
      }
    }
  }

  return null;
}

// --------------------------------------------------------------------------
export async function responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds = 30 } = {}) {
  const jsonResponseExpected = isJsonPrompt(promptKey);

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
          result = jsonResponse?.choices?.at(0)?.message?.content ||
            jsonResponse?.choices?.at(0)?.message?.tool_calls?.at(0)?.function?.arguments ||
            jsonResponse?.message?.content || jsonResponse?.response
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

  const resultBeforeTransform = result;
  if (jsonResponseExpected) {
    result = extractJsonFromString(result);
  }

  if (!allowResponse || allowResponse(result)) {
    return result;
  }

  if (resultBeforeTransform) {
    console.debug("Received", resultBeforeTransform, "but could not parse as a valid result");
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
export function jsonResponseFromStreamChunk(supposedlyJsonContent, failedParseContent) {
  let jsonResponse;
  const testContent = supposedlyJsonContent.replace(/^data:\s?/, "").trim();
  try {
    // If we receive a JSON response that contains `response: "\n"`, JSON.parse as of Dec 2023 throw an error "Bad control character in string literal in JSON at position 73 (line 1 column 74)"
    jsonResponse = JSON.parse(testContent);
  } catch(e) {
    console.debug("Failed to parse JSON from", testContent);
    if (failedParseContent) {
      try {
        jsonResponse = JSON.parse(failedParseContent + testContent);
      } catch(err) {
        return { failedParseContent: failedParseContent + testContent };
      }
    } else {
      const jsonStart = testContent.indexOf("{"); // As of Dec 2023, WBH observes that OpenAI is fond of sending back strings like "data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n"
      if (jsonStart) {
        try {
         jsonResponse = JSON.parse(testContent.substring(jsonStart));
         return { failedParseContent: null, jsonResponse }
        } catch(err) {
          console.debug("Moving start position didn't fix JSON parse error");
        }
      }
      return { failedParseContent: testContent };
    }
  }
  return { failedParseContent: null, jsonResponse }
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
  const responseBody = response.body; // Assuming this is already a stream object
  let abort = false;
  let content = "";
  let failedParseContent, incrementalContents;

  // Wrap the stream reading in a promise to await its completion
  await new Promise((resolve, _reject) => {
    const readStream = () => {
      let failLoops = 0;

      // Function to process stream chunks
      const processChunk = () => {
        let receivedContent = "";
        const chunk = responseBody.read();
        if (chunk) {
          failLoops = 0;
          const decoded = chunk.toString();

          const responseObject = callback(app, decoded, receivedContent, aiModel, responseJsonExpected, failedParseContent);
          ({ abort, failedParseContent, incrementalContents, receivedContent } = responseObject);
          if (receivedContent) content += receivedContent;

          if (abort || !shouldContinueStream(incrementalContents, receivedContent)) {
            resolve();
            return;
          }
          processChunk(); // Process the next chunk
        } else {
          failLoops += 1;
          if (failLoops < 3) {
            setTimeout(processChunk, streamTimeoutSeconds * 1000); // Try reading again after a delay
          } else {
            resolve(); // Resolve the promise if no more data is coming
          }
        }
      };

      processChunk(); // Start processing
    };

    responseBody.on("readable", readStream);
  });

  return content;
}

// --------------------------------------------------------------------------
async function streamWindowFetch(app, response, aiModel, responseJsonExpected, callback) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let abort, error, failedParseContent, incrementalContents;
  let failLoops = 0;
  let content = "";

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
      console.log("Decoded streamWindowFetch", decodedValue, "of type", typeof (decodedValue));
      let receivedContent = "";
      try {
        if (typeof (decodedValue) === "string") {
          failLoops = 0;
          const response = callback(app, decodedValue, receivedContent, aiModel, responseJsonExpected, failedParseContent);
          if (response) {
            ({ abort, failedParseContent, incrementalContents, receivedContent } = response);
            console.log("incrementalContent", incrementalContents, "receivedContent", receivedContent, "content to return", content);
            if (receivedContent) content += receivedContent;
            if (abort) break;
            if (!shouldContinueStream(incrementalContents, receivedContent)) break;
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

  return content;
}

// --------------------------------------------------------------------------
function shouldContinueStream(chunkStrings, accumulatedResponse) {
  let tooMuchSpace;
  if (chunkStrings?.length && (accumulatedResponse?.length || 0) >= MAX_SPACES_ABORT_RESPONSE) {
    const sansNewlines = accumulatedResponse.replace(/\n/g, " ");
    tooMuchSpace = sansNewlines.substring(sansNewlines.length - MAX_SPACES_ABORT_RESPONSE).trim() === "";
    if (tooMuchSpace) console.debug("Response exceeds empty space threshold. Aborting");
  }
  return !tooMuchSpace;
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
