// --------------------------------------------------------------------------
// GPT-3.5 has a 4097 token limit, so very much approximating that by limiting to 10k characters
export function truncate(text, limit) {
  return text.length > limit ? text.slice(0, limit) : text;
}

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
          console.error("OpenAI seems to have returned content after prompt. Truncating");
          refinedAnswer = refinedAnswer.substring(0, afterSentenceIndex);
        }
      }
    }
  }

  const originalLines = noteContent.split("\n").map(w => w.trim());
  const withoutOriginalLines = refinedAnswer.split("\n").filter(line =>
    !originalLines.includes(line.trim())).join("\n");
  const withoutJunkLines = cleanTextFromAnswer(withoutOriginalLines);

  console.debug(`Answer originally ${ answer.length } length, refined answer ${ refinedAnswer.length }. Without repeated lines ${ withoutJunkLines.length } length`);
  return withoutJunkLines.trim();
}

// --------------------------------------------------------------------------
export function cleanTextFromAnswer(answer) {
  return answer.split("\n").filter(line => !/^(~~~|```(markdown)?)$/.test(line.trim())).join("\n");
}
