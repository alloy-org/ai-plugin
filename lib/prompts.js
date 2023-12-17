import { truncate } from "./util.js"

const DEFAULT_TRUNCATE_LIMIT = 12000; // GPT-3.5 has a 4097 token limit, and OpenAI limits that each token is 4-6 characters, implying a 16k-24k character limit. We're being conservative and limiting to 12k characters.

// --------------------------------------------------------------------------
/** Generate array of messages (system & user) to be sent to OpenAI, based on the prompt key & params
 * @param {string} promptKey - a key that should be present among USER_PROMPTS
 * @param {object} promptParams - an object of parameters that get passed through to USER_PROMPTS
 * @param {array} rejectedResponses - an array of responses that have already been rejected
 * @returns {array} - an array of messages to be sent to OpenAI
 */
export function promptsFromPromptKey(promptKey, promptParams, rejectedResponses) {
  let messages = [];

  messages.push({ role: "system", content: systemPromptFromPromptKey(promptKey) });

  const userPrompt = userPromptFromPromptKey(promptKey, promptParams, DEFAULT_TRUNCATE_LIMIT);
  if (Array.isArray(userPrompt)) {
    userPrompt.forEach(content => {
      messages.push({ role: "user", content: truncate(content) });
    });
  } else {
    messages.push({ role: "user", content: truncate(userPrompt) });
  }

  const substantiveRejectedResponses = rejectedResponses?.filter(rejectedResponse => rejectedResponse?.length > 0);
  if (substantiveRejectedResponses?.length) {
    let message = "The following responses were rejected:\n";
    substantiveRejectedResponses.forEach(rejectedResponse => {
      message += `* ${ rejectedResponse }\n`;
    });
    const multiple = substantiveRejectedResponses.length > 1;
    message = `\nDo NOT repeat ${ multiple ? "any" : "the" } rejected response, ${ multiple ? "these are" : "this is" } the WRONG RESPONSE.`;
    messages.push({ role: "user", content: message });
  }

  return messages;
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function userPromptFromPromptKey(promptKey, promptParams, inputLimit) {
  if ([ "continue", "insertTextComplete", "replaceTextComplete" ].find(key => key === promptKey)) {
    let tokenAndSurroundingContent;
    if (promptKey === "replaceTextComplete") {
      tokenAndSurroundingContent = promptParams.text;
    } else {
      const { noteContent } = promptParams;
      const replaceToken = promptKey === "insertTextComplete" ? "OpenAI: Complete" : "OpenAI: Continue";
      const tokenIndex = noteContent.indexOf(replaceToken);
      const startIndex = Math.max(0, Math.round(tokenIndex - inputLimit * 0.5));
      const endIndex = Math.min(noteContent.length, Math.round(tokenIndex + inputLimit * 0.5));
      const noteContentNearToken = noteContent.substring(startIndex, endIndex);
      tokenAndSurroundingContent = `~~~\n${ noteContentNearToken.replace(`{${ replaceToken }}`, "<token>") }\n~~~`;
    }
    return [
      `What text could be used to replace <token> in the following input markdown document? Markdown document is delimited by ~~~:`,
      tokenAndSurroundingContent,
      `Your response should be grammatically correct and not repeat the markdown document. Do not explain how you derived your answer. Do not explain why you chose your answer.`,
      `Most importantly, DO NOT respond with <token> itself and DO NOT repeat word sequences from the markdown document. Maximum response length is 1,000 characters.`,
    ];
  } else {
    return USER_PROMPTS[promptKey](promptParams);
  }
}

// --------------------------------------------------------------------------
function systemPromptFromPromptKey(promptKey) {
  return SYSTEM_PROMPTS[promptKey] || SYSTEM_PROMPTS.defaultPrompt;
}

// --------------------------------------------------------------------------
const SYSTEM_PROMPTS = {
  defaultPrompt: "You are a helpful assistant that responds with markdown-formatted content.",
  reviseContent: "You are a helpful assistant that revises markdown-formatted content, as instructed.",
  reviseText: "You are a helpful assistant that revises text, as instructed.",
  rhyming: "You are a helpful rhyming word generator that responds with a list of rhyming words that fits in with provided context",
  summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
  thesaurus: "You are a helpful thesaurus that responds with a list of synonyms that fits in with provided context",
};

// --------------------------------------------------------------------------
const USER_PROMPTS = {
  answer: ({ instruction }) => ([ `Succinctly answer the following question: ${ instruction }`, "Do not explain your answer. Do not mention the question that was asked. Do not include unnecessary punctuation." ]),
  answerSelection: ({ text }) => ([ text ]),
  complete: ({ noteContent }) => `Continue the following markdown-formatted content:\n\n${ noteContent }`,
  reviseContent: ({ noteContent, instruction }) => [ instruction, noteContent ],
  reviseText: ({ instruction, text }) => [ instruction, text ],
  rhyming: ({ noteContent, text }) => ([
    `You are a rhyming word generator. Respond only with a numbered list of the 10 best rhymes to replace the word "${ text }"`,
    `The suggested replacements will be inserted in place of the <replace>${ text }</replace> token in the following markdown document:\n~~~\n${ noteContent.replace(text, `<replace>${ text }</replace>`) }\n~~~`,
    `Respond with up to 10 rhyming words that can be inserted into the document, each of which is 3 or less words. Do not repeat the input content. Do not explain how you derived your answer. Do not explain why you chose your answer. Do not respond with the token itself.`
  ]),
  summarize: ({ noteContent }) => `Summarize the following markdown-formatted note:\n\n${ noteContent }`,
  thesaurus: ({ noteContent, text }) => ([
    `Respond only with a numbered list of the 10 best words or phrases to replace the word "${ text }"`,
    `The suggested replacement will be inserted in place of the <replace>${ text }</replace> token in the following markdown document:\n~~~\n${ noteContent.replace(text, `<replace>${ text }</replace>`) }\n~~~`,
    `Respond with up to 10 synonyms that could be inserted into the document, each of which is 3 or less words. Do not repeat the input content. Do not explain how you derived your answer. Do not explain why you chose your answer. Do not respond with the token itself.`
  ]),
};
