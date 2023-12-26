// --------------------------------------------------------------------------
export function isJsonEndpoint(promptKey) {
  return [ "rhyming", "thesaurus", "sortGroceries" ].find(key => key === promptKey);
}

// --------------------------------------------------------------------------
export function tooDumbForExample(aiModel) {
  return [ "llama2" ].includes(aiModel);
}

// --------------------------------------------------------------------------
// https://platform.openai.com/docs/api-reference/chat/create
export function frequencyPenaltyFromPromptKey(promptKey) {
  if ([ "rhyming", "thesaurus" ].find(key => key === promptKey)) {
    return 2;
  } else if ([ "answer" ].find(key => key === promptKey)) {
    return 1;
  } else if ([ "revise", "sortGroceries" ].find(key => key === promptKey)) {
    return -1;
  } else {
    return 0;
  }
}
