// --------------------------------------------------------------------------
// GPT-3.5 has a 4097 token limit, so very much approximating that by limiting to 10k characters
export function truncate(text, limit) {
  return text.length > limit ? text.slice(0, limit) : text;
}

// --------------------------------------------------------------------------
// In spite of extensive prompt crafting, OpenAI still loves to provide answers that repeat our note
// content. This function aims to ditch the crap.
export async function trimNoteContentFromAnswer(app, answer, { replaceToken = null, replaceIndex = null } = {}) {
  const noteUUID = app.context.noteUUID;
  const note = await app.notes.find(noteUUID);
  const noteContent = await note.content();
  replaceIndex = (replaceIndex || noteContent.indexOf(replaceToken));
  const upToReplaceToken = noteContent.substring(0, replaceIndex - 1);
  const substring = upToReplaceToken.match(/(?:[\n\r.]|^)(.*)$/)?.[1];
  const maxSentenceStartLength = 100;
  const sentenceStart = !substring || substring.length > maxSentenceStartLength
    ? null
    : substring;

  let refinedAnswer = answer.replace(replaceToken, "").trim();
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

  // Legacy code WBH Dec 2023 not so sure still has value
  // if (refinedAnswer.split("\n").length > MAX_RESPONSE_CHOICES) {
  //   console.error("Answer length", refinedAnswer.length, "exceeded maxCompletionAnswerLines, only returning first non-blank line of answer");
  //   refinedAnswer = refinedAnswer.split("\n").find(line => line.trim().length > 1);
  // }
  console.debug(`Answer originally "${ answer }", refined answer "${ refinedAnswer }"`);
  return refinedAnswer.trim();
}
