import { REJECTED_RESPONSE_PREFIX } from "./constants/functionality"
import { isModelOllama, OLLAMA_TOKEN_CHARACTER_LIMIT, openAiTokenLimit } from "./constants/provider"
import { PLUGIN_NAME } from "./constants/settings"
import { limitContextLines, tooDumbForExample, useLongContentContext } from "./prompt-api-params"
import { truncate } from "./util"

export const PROMPT_KEYS = [
  "answer",
  "answerSelection",
  "complete",
  "reviseContent",
  "reviseText",
  "rhyming",
  "sortGroceriesText",
  "sortGroceriesJson",
  "suggestTasks",
  "summarize",
  "thesaurus",
];

// --------------------------------------------------------------------------
/* Imbue promptKey-specific promptParams with applicable note content, given contentIndex/contentIndexText implying
 * boundaries for what noteContent should be included.
 *
 * @param {object} app - From plugin
 * @param {string} noteUUID - UUID for note whose content should be included in returned prompt params
 * @param {string} promptKey - Member of PROMPT_KEYS
 * @param {object} promptKeyParams - An object of key/values to be sent to `messageArrayFromPrompt` callback specific to promptKey
 * @param {string} aiModel - Which aiModel will eventually be called with the prompt messages we generate
 * @param {number|null} contentIndex - Index of the content that needs to be sent to AI to undertake prompt
 * @param {string|null} contentIndexText - Text that can be used to locate contentIndex
 *
 * Returns promptParams object with `noteContent` key ready to be sent to `promptsFromPromptKey`
 */
export async function contentfulPromptParams(app, noteUUID, promptKey, promptKeyParams, aiModel,
    { contentIndex = null, contentIndexText = null, inputLimit = null } = {}) {
  let noteContent = "", noteName = "";
  if (!inputLimit) inputLimit = isModelOllama(aiModel) ? OLLAMA_TOKEN_CHARACTER_LIMIT : openAiTokenLimit(aiModel);

  if (noteUUID) {
    const note = await app.notes.find(noteUUID);
    noteContent = await note.content();
    noteName = note.name;
  }

  if (!Number.isInteger(contentIndex) && contentIndexText && noteContent) {
    contentIndex = contentIndexFromParams(contentIndexText, noteContent);
  }

  let boundedContent = noteContent || "";
  const longContent = useLongContentContext(promptKey);
  const noteContentCharacterLimit = Math.min(inputLimit * 0.5, longContent ? 5000 : 1000); // We need space for prompts & potentially for rejected responses

  // Remove task UUIDs so that AIs don't cite them back in response
  boundedContent = boundedContent.replace(/<!--\s\{[^}]+\}\s-->/g, "");
  if (noteContent && noteContent.length > noteContentCharacterLimit) {
    boundedContent = relevantContentFromContent(noteContent, contentIndex, noteContentCharacterLimit);
  }

  // Low-param models are especially prone to reguritate context lines provided, so we'll present fewer opps when possible
  const limitedLines = limitContextLines(aiModel, promptKey);
  if (limitedLines && Number.isInteger(contentIndex)) {
    boundedContent = relevantLinesFromContent(boundedContent, contentIndex);
  }

  return { ...promptKeyParams, noteContent: boundedContent, noteName };
}

// --------------------------------------------------------------------------
/** Generate array of messages (system & user) to be sent to OpenAI, based on the prompt key & params
 * @param {string} promptKey - a key that should be present among `messageArrayFromPrompt`
 * @param {object} promptParams - an object of parameters that get passed through to `messageArrayFromPrompt`
 * @param {array} rejectedResponses - an array of responses that have already been rejected
 * @param {string} aiModel - the name of the AI model to use
 * @returns {array} - an array of messages to be sent to OpenAI
 */
export function promptsFromPromptKey(promptKey, promptParams, rejectedResponses, aiModel) {
  let messages = [];
  if (tooDumbForExample(aiModel)) {
    promptParams = { ...promptParams, suppressExample: true };
  }

  messages.push({ role: "system", content: systemPromptFromPromptKey(promptKey) });

  const userPrompt = userPromptFromPromptKey(promptKey, promptParams);
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
  sortGroceriesJson: "You are a helpful assistant that responds in JSON with sorted groceries using the 'instruction' key as a guide",
  suggestTasks: "You are a Fortune 100 CEO that returns an array of insightful tasks within the 'result' key of a JSON response",
  summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
  thesaurus: "You are a helpful thesaurus that responds in JSON with an array of alternate word choices that fit the context provided",
};

// --------------------------------------------------------------------------
function messageArrayFromPrompt(promptKey, promptParams) {
  if (!PROMPT_KEYS.includes(promptKey)) throw(`Please add "${ promptKey }" to PROMPT_KEYS array`);

  const userPrompts = {
    answer: ({ instruction }) => ([
      `Succinctly answer the following question: ${ instruction }`,
      "Do not explain your answer. Do not mention the question that was asked. Do not include unnecessary punctuation."
    ]),
    answerSelection: ({ text }) => ([ text ]),
    complete: ({ noteContent }) => `Continue the following markdown-formatted content:\n\n${ noteContent }`,
    reviseContent: ({ noteContent, instruction }) => [ instruction, noteContent ],
    reviseText: ({ instruction, text }) => [ instruction, text ],
    rhyming: ({ noteContent, text }) => ([
      JSON.stringify({
        instruction: `Respond with a JSON object containing ONLY ONE KEY called "result", that contains a JSON array of up to 10 rhyming words or phrases`,
        rhymesWith: text,
        rhymingWordContext: noteContent.replace(text, `<replace>${ text }</replace>`),
        example: { input: { rhymesWith: "you" }, response: { result: ["knew", "blue", "shoe", "slew", "shrew", "debut", "voodoo", "field of view", "kangaroo", "view" ] } },
      }),
    ]),
    sortGroceriesText: ({ groceryArray }) => ([
      `Sort the following list of groceries by where it can be found in the grocery store:`,
      `- [ ] ${ groceryArray.join(`\n- [ ]`) }`,
      `Prefix each grocery aisle (each task section) with a "# ".\n\nFor example, if the input groceries were "Bananas", "Donuts", and "Bread", then the correct answer would be "# Produce\n[ ] Bananas\n\n# Bakery\n[ ] Donuts\n[ ] Bread"`,
      `DO NOT RESPOND WITH ANY EXPLANATION, only groceries and aisles. Return the exact same ${ groceryArray.length } groceries provided in the array, without additions or subtractions.`,
    ]),
    sortGroceriesJson: ({ groceryArray }) => ([
      JSON.stringify({
        instruction: `Respond with a JSON object, where the key is the aisle/department in which a grocery can be found, and the value is the array of groceries that can be found in that aisle/department.\n\nReturn the EXACT SAME ${ groceryArray.length } groceries from the "groceries" key, without additions or subtractions.`,
        groceries: groceryArray,
        example: {
          input: { groceries: [" Bananas", "Donuts", "Grapes", "Bread", "salmon fillets" ] },
          response: { "Produce": [ "Bananas", "Grapes" ], "Bakery": [ "Donuts", "Bread" ], "Seafood": [ "salmon fillets" ] }
        },
      }),
    ]),
    suggestTasks: ({ chosenTasks, noteContent, noteName, text }) => {
      const queryJson = {
        instruction: `Respond with a JSON object that contains an array of 10 tasks that will be inserted at the <inserTasks> token in the provided markdown content`,
        taskContext: `Title: ${ noteName }\n\nContent:\n${ noteContent.replace(text, `<insertTasks>`) }`,
        example: {
          input: { taskContext: `Title: Clean the house\n\nContent: \n- [ ] Mop the floors\n<insertTasks>` },
          response: {
            result: ["Dust the living room furniture", "Fold and put away the laundry", "Water indoor plants",
              "Hang up any recent mail", "Fold and put away laundry", "Take out the trash & recycling", "Wipe down bathroom mirrors & counter",
              "Sweep the entry and porch", "Organize the pantry", "Vacuum"]
          }
        }
      };
      if (chosenTasks) {
        queryJson.alreadyAcceptedTasks = `The following tasks have been proposed and accepted already. DO NOT REPEAT THESE, but do suggest complementary tasks:\n` +
          `* ${ chosenTasks.join("\n * ") }`;
      }

      return JSON.stringify(queryJson);
    },
    summarize: ({ noteContent }) => `Summarize the following markdown-formatted note:\n\n${ noteContent }`,
    thesaurus: ({ noteContent, text }) => ([
      JSON.stringify({
        instruction: `Respond with a JSON object containing ONLY ONE KEY called "result". The value for the "result" key should be a 10-element array of the best words or phrases to replace "${ text }" while remaining consistent with the included "replaceWordContext" markdown document.`,
        replaceWord: text,
        replaceWordContext: noteContent.replace(text, `<replaceWord>${ text }</replaceWord>`),
        example: {
          input: { replaceWord: "helpful", replaceWordContext: "Mother always said that I should be <replaceWord>helpful</replaceWord> with my coworkers" },
          response: { result: [ "useful", "friendly", "constructive", "cooperative", "sympathetic", "supportive", "kind", "considerate", "beneficent", "accommodating" ] }
        },
      }),
    ]),
  };
  return userPrompts[promptKey]({ ...promptParams });
}

// --------------------------------------------------------------------------
function userPromptFromPromptKey(promptKey, promptParams) {
  let userPrompts;
  if ([ "continue", "insertTextComplete", "replaceTextComplete" ].find(key => key === promptKey)) {
    const { noteContent } = promptParams;
    let tokenAndSurroundingContent;
    if (promptKey === "replaceTextComplete") {
      tokenAndSurroundingContent = promptParams.text;
    } else {
      const replaceToken = promptKey === "insertTextComplete" ? `${ PLUGIN_NAME }: Complete` : `${ PLUGIN_NAME }: Continue`;
      console.debug("Note content", noteContent, "replace token", replaceToken);
      tokenAndSurroundingContent = `~~~\n${ noteContent.replace(`{${ replaceToken }}`, "<replaceToken>") }\n~~~`;
    }
    userPrompts = [
      `Respond with text that will replace <replaceToken> in the following input markdown document, delimited by ~~~:`,
      tokenAndSurroundingContent,
      `Your response should be grammatically correct and not repeat the markdown document. DO NOT explain your answer.`,
      `Most importantly, DO NOT respond with <replaceToken> itself and DO NOT repeat word sequences from the markdown document. BE CONCISE.`,
    ];
  } else {
    userPrompts = messageArrayFromPrompt(promptKey, promptParams);
    if (promptParams.suppressExample && userPrompts[0]?.includes("example")) {
      try {
        const json = JSON.parse(userPrompts[0]);
        delete json.example;
        userPrompts[0] = JSON.stringify(json);
      } catch(e) {
        // console.error("Failed to parse example", e);
      }
    }
  }

  console.debug("Got user messages", userPrompts, "for", promptKey, "given promptParams", promptParams);
  return userPrompts;
}

// --------------------------------------------------------------------------
// Return subset of content that holds most promise to answer the input query
function relevantContentFromContent(content, contentIndex, contentLimit) {
  if (content && content.length > contentLimit) {
    if (!Number.isInteger(contentIndex)) {
      const pluginNameIndex = content.indexOf(PLUGIN_NAME);
      contentIndex = pluginNameIndex === -1 ? contentLimit * 0.5 : pluginNameIndex;
    }
    const startIndex = Math.max(0, Math.round(contentIndex - contentLimit * 0.75));
    const endIndex = Math.min(content.length, Math.round(contentIndex + contentLimit * 0.25));
    content = content.substring(startIndex, endIndex);
  }
  return content;
}

// --------------------------------------------------------------------------
function relevantLinesFromContent(content, contentIndex) {
  const maxContextLines = 4;
  const lines = content.split("\n").filter(l => l.length);
  if (lines.length > maxContextLines) {
    let traverseChar = 0;
    let targetContentLine = lines.findIndex(line => {
      if (traverseChar + line.length > contentIndex) return true;
      traverseChar += line.length + 1; // +1 for newline
    })
    if (targetContentLine >= 0) {
      const startLine = Math.max(0, targetContentLine - Math.floor(maxContextLines * 0.75));
      const endLine = Math.min(lines.length, targetContentLine + Math.floor(maxContextLines * 0.25));
      console.debug("Submitting line index", startLine, "through", endLine, "of", lines.length, "lines");
      content = lines.slice(startLine, endLine).join("\n");
    }
  }
  return content;
}

// --------------------------------------------------------------------------
function systemPromptFromPromptKey(promptKey) {
  const systemPrompts = SYSTEM_PROMPTS;
  return systemPrompts[promptKey] || systemPrompts.defaultPrompt;
}

// --------------------------------------------------------------------------
function contentIndexFromParams(contentIndexText, noteContent) {
  let contentIndex = null;
  if (contentIndexText) {
    contentIndex = noteContent.indexOf(contentIndexText);
  }

  if (contentIndex === -1) contentIndex = null;
  return contentIndex;
}
