// --------------------------------------------------------------------------
export function userPromptFromPromptKey(promptKey, promptParams, inputLimit) {
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
export const SYSTEM_PROMPTS = {
  defaultPrompt: "You are a helpful assistant helping continue writing markdown-formatted content.",
  reviseContent: "You are a helpful assistant that revises markdown-formatted content, as instructed.",
  reviseText: "You are a helpful assistant that revises text, as instructed.",
  summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
};

// --------------------------------------------------------------------------
const USER_PROMPTS = {
  answer: ({ instruction }) => ([ `Succinctly answer the following question: ${ instruction }`, "Do not explain your answer. Do not mention the question that was asked. Do not include unnecessary punctuation." ]),
  complete: ({ noteContent }) => `Continue the following markdown-formatted content:\n\n${ noteContent }`,
  reviseContent: ({ noteContent, instruction }) => [ instruction, noteContent ],
  reviseText: ({ instruction, text }) => [ instruction, text ],
  rhyming: ({ noteContent, text }) => ([
    `You are a rhyming word generator. Respond only with a numbered list of the 10 best rhymes to replace the word "${ text }"`,
    `The suggested replacements will be inserted in place of the <replace>${ text }</replace> token in the following markdown document:\n~~~\n${ noteContent.replace(text, `<replace>${ text }</replace>`) }\n~~~`,
    `Respond with up to 10 rhyming words that can be inserted into the document, each of which is 3 or less words. Do not repeat the input content. Do not explain how you derived your answer. Do not explain why you chose your answer. Do not respond with the token itself.`
  ]),
  summarize: ({ noteContent }) => `Summarize the following markdown-formatted note:\n\n${ noteContent }`,
};
