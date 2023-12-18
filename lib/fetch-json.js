import fetch from "isomorphic-fetch"

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
export default function fetchJson(endpoint, attrs) {
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
