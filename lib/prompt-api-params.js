// --------------------------------------------------------------------------
export function isJsonPrompt(promptKey) {
  return !![ "rhyming", "thesaurus", "sortGroceriesJson", "suggestTasks" ].find(key => key === promptKey);
}

// --------------------------------------------------------------------------
export function useLongContentContext(promptKey) {
  return [ "continue", "insertTextComplete" ].includes(promptKey);
}

// --------------------------------------------------------------------------
// Returns true if context should be limited to a few lines (for models that tend to regurgitate context)
// Continue/complete actions need more context to understand the pattern to continue
export function limitContextLines(aiModel, promptKey) {
  if (useLongContentContext(promptKey)) return false;
  return !/(gpt-4|gpt-3)/.test(aiModel);
}

// --------------------------------------------------------------------------
// Returns true if the model is known to struggle with examples in prompts
// Modern models (GPT-4+, Claude, Gemini, Grok, DeepSeek) can handle examples well
export function tooDumbForExample(aiModel) {
  const smartModelPattern = /(gpt-4|gpt-5|claude|gemini|grok|deepseek|mistral|o3|o4)/i;
  return !smartModelPattern.test(aiModel);
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
