import fetch from "isomorphic-fetch"

// --------------------------------------------------------------------------
export function shouldStream(plugin) {
  return !plugin.constants.isTestEnvironment;
}

// --------------------------------------------------------------------------
export async function responseTextFromStreamResponse(app, response, callback) {
  const streamTimeoutSeconds = 2;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let error;
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
          const response = callback(app, decodedValue, receivedContent);
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
function extendUrlWithParameters(basePath, paramObject) {
  let path = basePath;
  if (basePath.indexOf("?") !== -1) {
    path += "&";
  } else {
    path += "?";
  }

  // Via https://stackoverflow.com/questions/1714786/query-string-encoding-of-a-javascript-object
  // because the standard "use querystring" answer doesn't handle nested objects
  const deepSerialize = (object, prefix) => {
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
