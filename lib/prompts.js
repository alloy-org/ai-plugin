import { DEFAULT_CHARACTER_LIMIT, PLUGIN_NAME, REJECTED_RESPONSE_PREFIX } from "./constants"
import { truncate } from "./util"

// --------------------------------------------------------------------------
/** Generate array of messages (system & user) to be sent to OpenAI, based on the prompt key & params
 * @param {string} promptKey - a key that should be present among USER_PROMPTS
 * @param {object} promptParams - an object of parameters that get passed through to USER_PROMPTS
 * @param {number|null} contentIndex - whereabouts in the noteContent is the word/paragraph/section that is being analyzed
 * @param {array} rejectedResponses - an array of responses that have already been rejected
 * @param {number} inputLimit - the maximum number of characters to send to OpenAI
 * @returns {array} - an array of messages to be sent to OpenAI
 */
export function promptsFromPromptKey(promptKey, promptParams, contentIndex, rejectedResponses, inputLimit = DEFAULT_CHARACTER_LIMIT) {
  let messages = [];

  messages.push({ role: "system", content: systemPromptFromPromptKey(promptKey) });

  const userPrompt = userPromptFromPromptKey(promptKey, promptParams, contentIndex, inputLimit);
  if (Array.isArray(userPrompt)) {
    userPrompt.forEach(content => {
      messages.push({ role: "user", content: truncate(content) });
    });
  } else {
    messages.push({ role: "user", content: truncate(userPrompt) });
  }

  const substantiveRejectedResponses = rejectedResponses?.filter(rejectedResponse => rejectedResponse?.length > 0);
  if (substantiveRejectedResponses?.length) {
    let message = REJECTED_RESPONSE_PREFIX;
    substantiveRejectedResponses.forEach(rejectedResponse => {
      message += `* ${ rejectedResponse }\n`;
    });
    const multiple = substantiveRejectedResponses.length > 1;
    message += `\nDo NOT repeat ${ multiple ? "any" : "the" } rejected response, ${ multiple ? "these are" : "this is" } the WRONG RESPONSE.`;
    messages.push({ role: "user", content: message });
  }

  return messages;
}

// --------------------------------------------------------------------------
// Private functions
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
const SYSTEM_PROMPTS = {
  defaultPrompt: "You are a helpful assistant that responds with markdown-formatted content.",
  reviseContent: "You are a helpful assistant that revises markdown-formatted content, as instructed.",
  reviseText: "You are a helpful assistant that revises text, as instructed.",
  rhyming: "You are a helpful rhyming word generator that responds in JSON with an array of rhyming words",
  sortGroceries: "You are a helpful assistant that responds in JSON with groceries sorted by the aisle in which they can be found",
  summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
  thesaurus: "You are a helpful thesaurus that responds in JSON with an array of alternate word choices that fit the context provided",
};

// --------------------------------------------------------------------------
function userPromptFromPromptKey(promptKey, promptParams, contentIndex, inputLimit) {
  const { noteContent } = promptParams;
  let boundedContent = noteContent;
  const noteContentLimit = inputLimit * 0.5; // We need space for prompts & potentially for rejected responses
  if (noteContent && noteContent.length > noteContentLimit) {
    boundedContent = relevantContentFromContent(noteContent, contentIndex, noteContentLimit);
  }
  // Remove task UUIDs so that AIs don't cite them back in response
  boundedContent = boundedContent.replace(/<!--\s\{[^}]+\}\s-->/g, "");
  console.debug("Getting messages for", promptKey, "with", promptParams);

  if ([ "continue", "insertTextComplete", "replaceTextComplete" ].find(key => key === promptKey)) {
    let tokenAndSurroundingContent;
    if (promptKey === "replaceTextComplete") {
      tokenAndSurroundingContent = promptParams.text;
    } else {
      const replaceToken = promptKey === "insertTextComplete" ? `${ PLUGIN_NAME }: Complete` : `${ PLUGIN_NAME }: Continue`;
      if (!boundedContent.includes(replaceToken) && noteContent.includes(replaceToken)) {
        contentIndex = noteContent.indexOf(replaceToken);
        console.debug("Couldn't find", replaceToken, "in", boundedContent, "so truncating to", relevantContentFromContent(noteContent, contentIndex, noteContentLimit), "given", noteContentLimit);
        boundedContent = relevantContentFromContent(noteContent, contentIndex, noteContentLimit);
      }
      console.debug("Note content", noteContent, "bounded content", boundedContent, "replace token", replaceToken, "content index", contentIndex, "with noteContentLimit", noteContentLimit);
      tokenAndSurroundingContent = `~~~\n${ boundedContent.replace(`{${ replaceToken }}`, "<token>") }\n~~~`;
    }
    return [
      `Respond with text that will replace <token> in the following input markdown document, delimited by ~~~:`,
      tokenAndSurroundingContent,
      `Your response should be grammatically correct and not repeat the markdown document. DO NOT explain your answer.`,
      `Most importantly, DO NOT respond with <token> itself and DO NOT repeat word sequences from the markdown document. Be as concise as possible.`,
    ];
  } else {
    return messageArrayFromPrompt(promptKey, { ...promptParams, noteContent: boundedContent });
  }
}

// --------------------------------------------------------------------------
function messageArrayFromPrompt(promptKey, promptParams) {
  const userPrompts = {
    answer: ({ instruction }) => ([ `Succinctly answer the following question: ${ instruction }`, "Do not explain your answer. Do not mention the question that was asked. Do not include unnecessary punctuation." ]),
    answerSelection: ({ text }) => ([ text ]),
    complete: ({ noteContent }) => `Continue the following markdown-formatted content:\n\n${ noteContent }`,
    reviseContent: ({ noteContent, instruction }) => [ instruction, noteContent ],
    reviseText: ({ instruction, text }) => [ instruction, text ],
    rhyming: ({ noteContent, text }) => ([
      JSON.stringify({
        example: { input: { rhymesWith: "you" }, response: { result: ["knew", "blue", "shoe", "slew", "shrew", "debut", "voodoo", "field of view", "kangaroo", "view" ] } },
        instruction: "Respond with a JSON object containing ONLY ONE KEY called 'result', that contains a JSON array of 10 rhyming words or phrases that were not rejected",
        rhymesWith: text,
        rhymeResponseStringMaxWords: 3,
        rhymeStringsToReturn: 10,
        rhymingWordContext: noteContent.replace(text, `<replace>${ text }</replace>`)
      }),
    ]),
    sortGroceries: ({ groceryArray }) => ([
      JSON.stringify({
        example: {
          input: { groceries: [" Bananas", "Donuts", "Grapes", "Bread", "salmon fillets" ] },
          response: { "Produce": [ "Bananas", "Grapes" ], "Bakery": [ "Donuts", "Bread" ], "Seafood": [ "salmon fillets" ] }
        },
        groceries: groceryArray,
        instruction: `Respond with a JSON object, where the key is the aisle/department in which a grocery can be found, and the value is the array of groceries that can be found in that aisle/department.\n\nReturn the EXACT SAME ${ groceryArray.length } groceries from the "groceries" key, without additions or subtractions.`,
      }),
    ]),
    summarize: ({ noteContent }) => `Summarize the following markdown-formatted note:\n\n${ noteContent }`,
    thesaurus: ({ noteContent, text }) => ([
      JSON.stringify({
        example: {
          input: { replaceWord: "helpful", replaceWordContext: "Mother always said that I should be <replaceWord>helpful</replaceWord> with my coworkers" },
          response: { result: [ "useful", "friendly", "constructive", "cooperative", "sympathetic", "supportive", "kind", "considerate", "beneficent", "accommodating" ] }
        },
        instruction: `Respond with a JSON object containing ONLY ONE KEY called "result". The value for the "result" key should be a 10-element array of the best words or phrases to replace "${ text }" while remaining consistent with the included "replaceWordContext" markdown document.`,
        replaceWord: text,
        replaceWordContext: noteContent.replace(text, `<replaceWord>${ text }</replaceWord>`),
      }),
    ]),
  };
  return userPrompts[promptKey]({ ...promptParams });
}

// --------------------------------------------------------------------------
// Return subset of content that holds most promise to answer the input query
function relevantContentFromContent(content, contentIndex, contentLimit) {
  if (content && content.length > contentLimit) {
    if (!Number.isInteger(contentIndex)) {
      const pluginNameIndex = content.indexOf(PLUGIN_NAME);
      contentIndex = pluginNameIndex === -1 ? contentLimit * 0.5 : pluginNameIndex;
    }
    const startIndex = Math.max(0, Math.round(contentIndex - contentLimit * 0.5));
    const endIndex = Math.min(content.length, Math.round(contentIndex + contentLimit * 0.5));
    content = content.substring(startIndex, endIndex);
  }
  return content;
}

// --------------------------------------------------------------------------
function systemPromptFromPromptKey(promptKey) {
  const systemPrompts = SYSTEM_PROMPTS;
  return systemPrompts[promptKey] || systemPrompts.defaultPrompt;
}
