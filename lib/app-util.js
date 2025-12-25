// --------------------------------------------------------------------------
// Cuz Ollama LLMs (e.g., Mistral) love to send JSON-ish shit like
// { rhymes: [ 'new', 'crew', 'clue', 'true,\nsew,hew,\nthrough', 'dew' ] }
export function arrayFromJumbleResponse(response) {
  if (!response) return null;

  const splitWords = gobbledeegoop => {
    let words;
    if (Array.isArray(gobbledeegoop)) {
      words = gobbledeegoop;
    } else if (gobbledeegoop.includes(",")) {
      words = gobbledeegoop.split(",");
    } else if (gobbledeegoop.includes("\n")) {
      words = gobbledeegoop.split("\n");
    } else {
      words = [ gobbledeegoop ]
    }
    return words.map(w => w.trim());
  }

  let properArray;
  if (Array.isArray(response)) {
    properArray = response.reduce((arr, gobbledeegoop) => arr.concat(splitWords(gobbledeegoop)), []);
  } else {
    properArray = splitWords(response);
  }
  return properArray;
}

// --------------------------------------------------------------------------
export function arrayFromResponseString(responseString) {
  if (typeof(responseString) !== "string") return null;
  const listItems = responseString.match(/^[\-*\d.]+\s+(.*)$/gm);
  if (listItems?.length) {
    return listItems.map(item => optionWithoutPrefix(item));
  } else {
    return null;
  }
}

// --------------------------------------------------------------------------
export function cleanTextFromAnswer(answer) {
  return answer.split("\n").filter(line => !/^(~~~|```(markdown)?)$/.test(line.trim())).join("\n");
}

// --------------------------------------------------------------------------
export function debugData(noteHandleOrSearchCandidate) {
  const isNoteHandle = "keywordDensityEstimate" in noteHandleOrSearchCandidate;
  const contentAttr = isNoteHandle ? "content" : "bodyContent";
  let v;
  return Object.fromEntries(["name", "keywordDensityEstimate", "tags", contentAttr, "url"].map(k =>
    (v = noteHandleOrSearchCandidate[k]) && (!Array.isArray(v) || v.length)
    ? [ k, typeof(v) === "string" && v.length > 100 ? `${ v.slice(0, 100) }...` : v ]
    : null
  ).filter(Boolean));
}

// --------------------------------------------------------------------------
// Deploy every trick in the book to try to form jsonText into something that can be parsed by JSON.parse
// Handles both single objects (e.g., { jsonStuff: true }) and arrays (e.g., [{ jsonStuff: true }])
export function jsonFromAiText(jsonText) {
  let json;

  // Trim and look for the root structure type
  const trimmed = jsonText.trim();

  // Determine if we're dealing with an array or object by looking at what character comes first
  // (ignoring markdown code fences and other preamble)
  let arrayStart = trimmed.indexOf("[");
  let objectStart = trimmed.indexOf("{");

  // Check if there's a closing bracket without an opening - this helps identify the intended type
  const hasClosingBrace = trimmed.includes("}");
  const hasClosingBracket = trimmed.includes("]");

  let isArray = false;
  let jsonStart = -1;

  // If we have a closing } but no opening {, it's meant to be an object
  if (hasClosingBrace && objectStart === -1) {
    jsonText = `{${ jsonText }`;
    objectStart = 0;
  }

  // If we have a closing ] but no opening [, it's meant to be an array
  if (hasClosingBracket && arrayStart === -1) {
    jsonText = `[${ jsonText }`;
    arrayStart = 0;
  }

  // Re-check positions after potentially adding opening brackets
  arrayStart = jsonText.indexOf("[");
  objectStart = jsonText.indexOf("{");

  if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
    // Array comes first or is the only structure
    isArray = true;
    jsonStart = arrayStart;
  } else if (objectStart !== -1) {
    // Object comes first
    isArray = false;
    jsonStart = objectStart;
  } else {
    // No opening bracket found, assume object
    jsonText = `{${ jsonText }}`;
    jsonStart = 0;
    isArray = false;
  }

  // Extract based on detected type
  const endChar = isArray ? "]" : "}";
  let jsonEnd = jsonText.lastIndexOf(endChar);

  if (jsonEnd === -1) {
    // If we didn't finish the JSON, there might still be usable signal if we can adapt it to be parseable
    if (jsonText[jsonText.length - 1] === ",") jsonText = jsonText.substring(0, jsonText.length - 1);

    // Fix missing brackets for nested structures
    const missingArrayClose = jsonText.includes("[") && !jsonText.includes("]");
    const missingObjectClose = jsonText.includes("{") && !jsonText.includes("}");

    if (missingArrayClose && missingObjectClose) {
      // Both array and object are open, close both (object first, then array)
      jsonText += "}]";
    } else if (missingArrayClose) {
      jsonText += "]";
    } else if (missingObjectClose) {
      jsonText += "}";
    } else {
      // No nested brackets found, just close the main structure
      jsonText = isArray ? `${ jsonText }]` : `${ jsonText }}`;
    }
  } else {
    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
  }

  try {
    json = JSON.parse(jsonText);
    return json;
  } catch (e) {
    const parseTextWas = jsonText;
    jsonText = balancedJsonFromString(jsonText);
    console.error(`Failed to parse jsonText START:\n${ parseTextWas }\nEND\n due to ${ e }. Attempted rebalance yielded: ${ jsonText } (original size ${ parseTextWas.length || "(null)" }, rebalance size ${ jsonText?.length || "(0)" })`);
    try {
      json = JSON.parse(jsonText);
      return json;
    } catch (e)  {
      console.error("Rebalanced jsonText still fails", e);
    }

    // Fix possibly unescaped quotes and newlines
    let reformattedText = jsonText.replace(/"""/g, `"\\""`).replace(/"\n/g, `"\\n`);

    // Fix missing opening quote on property names (e.g., {result": -> {"result":)
    reformattedText = reformattedText.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1"$2":');

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

  return null;
}

// --------------------------------------------------------------------------
export function noteUrlFromUUID(noteUUID) {
  return `https://www.amplenote.com/notes/${ noteUUID }`;
}

// --------------------------------------------------------------------------
export function optionWithoutPrefix(option) {
  if (!option) return option;
  const withoutStarAndNumber = option.trim().replace(/^[\-*\d.]+\s+/, "");
  const withoutCheckbox = withoutStarAndNumber.replace(/^-?\s*\[\s*]\s+/, "");
  return withoutCheckbox;
}

// --------------------------------------------------------------------------
export function pluralize(number, noun) {
  // Convert string numbers to actual numbers
  const numValue = typeof number === 'string' ? parseFloat(number) : number;

  if (!Number.isInteger(numValue) && !Number.isFinite(numValue)) {
    throw new Error("pluralize() requires an integer to be given");
  }

  const numberPart = numValue.toLocaleString();
  return `${ numberPart } ${ noun }${ parseInt(numValue) === 1 ? "" : "s" }`;
}

// --------------------------------------------------------------------------
// In spite of extensive prompt crafting, OpenAI still loves to provide answers that repeat our note
// content. This function aims to ditch the crap.
export async function trimNoteContentFromAnswer(app, answer, { replaceToken = null, replaceIndex = null } = {}) {
  const noteUUID = app.context.noteUUID;
  const note = await app.notes.find(noteUUID);
  const noteContent = await note.content();
  let refinedAnswer = answer;

  if (replaceIndex || replaceToken) {
    replaceIndex = (replaceIndex || noteContent.indexOf(replaceToken));
    const upToReplaceToken = noteContent.substring(0, replaceIndex - 1);
    const substring = upToReplaceToken.match(/(?:[\n\r.]|^)(.*)$/)?.[1];
    const maxSentenceStartLength = 100;
    const sentenceStart = !substring || substring.length > maxSentenceStartLength
      ? null
      : substring;

    if (replaceToken) {
      refinedAnswer = answer.replace(replaceToken, "").trim();
      if (sentenceStart && sentenceStart.trim().length > 1) {
        console.debug(`Replacing sentence start fragment: "${ sentenceStart }"`);
        refinedAnswer = refinedAnswer.replace(sentenceStart, "");
      }
      const afterTokenIndex = replaceIndex + replaceToken.length
      const afterSentence = noteContent.substring(afterTokenIndex + 1, afterTokenIndex + 100).trim();
      if (afterSentence.length) {
        const afterSentenceIndex = refinedAnswer.indexOf(afterSentence);
        if (afterSentenceIndex !== -1) {
          console.error("LLM response seems to have returned content after prompt. Truncating");
          refinedAnswer = refinedAnswer.substring(0, afterSentenceIndex);
        }
      }
    }
  }

  const originalLines = noteContent.split("\n").map(w => w.trim());
  const withoutOriginalLines = refinedAnswer.split("\n").filter(line =>
    !originalLines.includes(line.trim())).join("\n");
  const withoutJunkLines = cleanTextFromAnswer(withoutOriginalLines);

  console.debug(`Answer originally ${ answer.length } length, refined answer length ${ refinedAnswer.length } ("${ refinedAnswer }"). Without repeated lines ${ withoutJunkLines.length } length`);
  return withoutJunkLines.trim();
}

// --------------------------------------------------------------------------
// GPT-3.5 has a 4097 token limit, so very much approximating that by limiting to 10k characters
export function truncate(text, limit) {
  return text.length > limit ? text.slice(0, limit) : text;
}

// --------------------------------------------------------------------------
// Local helper functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function balancedJsonFromString(string) {
  const jsonStart = string.indexOf("{"); // As of Dec 2023, WBH observes that OpenAI is fond of sending back strings like "data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n"
  if (jsonStart === -1) return null;
  const jsonAndAfter = string.substring(jsonStart).trim();
  const pendingBalance = [];
  let jsonText = "";
  for (const char of jsonAndAfter) {
    jsonText += char;
    if (char === "{") {
      pendingBalance.push("}");
    } else if (char === "}") {
      if (pendingBalance[pendingBalance.length - 1] === "}") pendingBalance.pop();
    } else if (char === "[") {
      pendingBalance.push("]");
    } else if (char === "]") {
      if (pendingBalance[pendingBalance.length - 1] === "]") pendingBalance.pop();
    }
    if (pendingBalance.length === 0) break;
  }

  if (pendingBalance.length) {
    console.debug("Found", pendingBalance.length, "characters to append to balance", jsonText, ". Adding ", pendingBalance.reverse().join(""));
    jsonText += pendingBalance.reverse().join("");
  }
  return jsonText;
}
