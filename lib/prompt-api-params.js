// --------------------------------------------------------------------------
export function isJsonPrompt(promptKey) {
  return !![ "rhyming", "thesaurus", "sortGroceriesJson", "suggestTasks" ].find(key => key === promptKey);
}

// --------------------------------------------------------------------------
export function useLongContentContext(promptKey) {
  return [ "continue", "insertTextComplete" ].includes(promptKey);
}

// --------------------------------------------------------------------------
export function limitContextLines(aiModel, _promptKey) {
  return !/(gpt-4|gpt-3)/.test(aiModel);
}

// --------------------------------------------------------------------------
export function tooDumbForExample(aiModel) {
  const smartModel = [ "mistral" ].includes(aiModel) || aiModel.includes("gpt-4");
  return !smartModel;
}

// --------------------------------------------------------------------------
// https://platform.openai.com/docs/api-reference/chat/create
export function frequencyPenaltyFromPromptKey(promptKey) {
  if ([ "rhyming", "suggestTasks", "thesaurus" ].find(key => key === promptKey)) {
    return 2;
  } else if ([ "answer" ].find(key => key === promptKey)) {
    return 1;
  } else if ([ "revise", "sortGroceriesJson", "sortGroceriesText" ].find(key => key === promptKey)) {
    return -1;
  } else {
    return 0;
  }
}
