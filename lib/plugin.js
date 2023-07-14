const plugin = {
  insertText: {
    "Answer": async function(app) {
      const instruction = await app.prompt("What question would you like answered?");
      if (!instruction) return null;

      const answer = await this._noteOptionInsertContent(app, app.context.noteUUID, "answer", { instruction });
      if (answer) {
        return answer;
      } else {
        app.alert("Could not determine an answer to the provided question")
        return null;
      }
    },
    "Complete": async function(app) {
      return await this._completeText(app, "insertTextComplete");
    },
    "Continue": async function(app) {
      return await this._completeText(app, "continue");
    },
  },

  // --------------------------------------------------------------------------
  // https://www.amplenote.com/help/developing_amplenote_plugins#noteOption
  noteOption: {
    "Answer": async function(app, noteUUID) {
      const instruction = await app.prompt("What question should be answered?");
      if (!instruction) return;

      await this._noteOptionInsertContent(app, noteUUID, "answer", { instruction }, true);
    },
    "Revise": async function(app, noteUUID) {
      const instruction = await app.prompt("How should this note be revised?");
      if (!instruction) return;

      await this._noteOptionInsertContent(app, noteUUID, "reviseContent", { instruction }, true);
    },
    "Summarize": async function(app, noteUUID) {
      await this._noteOptionInsertContent(app, noteUUID, "summarize", {}, true);
    },
  },

  // --------------------------------------------------------------------------
  // https://www.amplenote.com/help/developing_amplenote_plugins#replaceText
  replaceText: {
    "Complete": async function(app, text) {
      const result = await this._callOpenAI(app, "complete", text);
      if (result === null) return null;

      return text + " " + result;
    },
    "Revise": async function(app, text) {
      const instruction = await app.prompt("How should this text be revised?");
      if (!instruction) return null;

      const result = await this._callOpenAI(app, "reviseText", [ instruction, text ]);
      if (result === null) return null;

      app.alert(result);
      return null;
    },
    "Rhymes": async function(app, text) {
      const noteUUID = app.context.noteUUID;
      const note = await app.notes.find(noteUUID);
      const noteContent = await note.content();

      const result = await this._noteOptionInsertContent(app, app.context.noteUUID, "rhyming", { text });
      const optionList = result?.split("\n")?.map(word => word.replace(/^[\d]+\.?[\s]?/g, ""))
      if (optionList?.length) {
        const selectedValue = await app.prompt(`Choose a replacement for "${ text }"`, {
          inputs: [ {
            type: "radio",
            label: `${ optionList.length } synonym${ optionList.length === 1 ? "" : "s" } found`,
            options: optionList.map(option => ({ label: option.toLowerCase(), value: option.toLowerCase() }))
          } ]
        });
        if (selectedValue) return selectedValue;
      } else {
        app.alert("Got no rhymes");
      }
      return null;
    },
  },

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  async _completeText(app, promptKey) {
    const answer = await this._noteOptionInsertContent(app, app.context.noteUUID, promptKey);
    if (answer) {
      const replaceToken = promptKey === "continue" ? "OpenAI: Continue" : "OpenAI: Complete";
      const trimmedAnswer = await this._trimNoteContentFromAnswer(app, answer, replaceToken);
      app.context.replaceSelection(trimmedAnswer);
    } else {
      app.alert("Could not determine an answer to the provided question")
      return null;
    }
  },

  // --------------------------------------------------------------------------
  // `promptKey` is a key that should be present among this._userPrompts, below
  async _noteOptionInsertContent(app, noteUUID, promptKey, { instruction = null, text = null } = {}, confirmInsert = null) {
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();

    const result = await this._callOpenAI(app, promptKey, { instruction, noteContent, text });
    if (result === null) return;

    if (confirmInsert) {
      const actionIndex = await app.alert(result, {
        actions: [ { icon: "post_add", label: "Insert in note" } ]
      });
      if (actionIndex === 0) {
        note.insertContent(result);
      }
    } else {
      return result;
    }
  },

  // --------------------------------------------------------------------------
  // `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
  async _callOpenAI(app, promptType, promptParams) {
    let messages = [];

    const systemPrompt = this._systemPrompts[promptType] || this._systemPrompts.defaultPrompt;
    messages.push({ role: "system", content: systemPrompt });

    const userPrompt = this._userPromptFromPromptKey(promptType, promptParams);
    if (Array.isArray(userPrompt)) {
      userPrompt.forEach(content => {
        messages.push({ role: "user", content: this._truncate(content) });
      });
    } else {
      messages.push({ role: "user", content: this._truncate(userPrompt) });
    }

    try {
      const settingModel = app.settings["OpenAI model (e.g., 'gpt-4'. Leave blank for gpt-3.5-turbo)"];
      const model = settingModel && settingModel.trim().length ? settingModel : "gpt-3.5-turbo";
      return await this._requestWithRetry(app, model, messages);
    } catch (error) {
      app.alert("Failed to call OpenAI: " + error);
      return null;
    }
  },

  // --------------------------------------------------------------------------
  async _requestWithRetry(app, model, messages, retries = 3) {
    const timeoutSeconds = this._constants.requestTimeoutSeconds;
    let error, response;

    for (let i = 0; i < retries; i++) {
      try {
        response = await Promise.race([
          fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${ app.settings["API Key"] }`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ model, messages })
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutSeconds * 1000)
          )
        ]);
      } catch (e) {
        error = e;
        console.log(`Attempt ${ i + 1 } failed with`, e, `at ${ new Date() }. Retrying...`);
      }
    }

    if (!response) {
      app.alert("Failed to call OpenAI: " + error);
      return null;
    } else if (response.ok) {
      const result = await response.json();

      const { choices: [ { message: { content } } ] } = result;
      return content;
    } else if (response.status === 401) {
      app.alert("Invalid OpenAI key. Please configure your OpenAI key in plugin settings.");
      return null;
    } else {
      const result = await response.json();
      if (result && result.error) {
        app.alert("Failed to call OpenAI: " + result.error.message);
        return null;
      }
    }
  },

  // --------------------------------------------------------------------------
  // GPT-3.5 has a 4097 token limit, so very much approximating that by limiting to 10k characters
  _truncate(text, limit = null) {
    limit = limit || this._constants.truncateLimit;
    return text.length > limit ? text.slice(0, limit) : text;
  },

  // --------------------------------------------------------------------------
  _userPromptFromPromptKey(promptKey, promptParams) {
    if ([ "continue", "insertTextComplete" ].find(key => key === promptKey)) {
      const { noteContent } = promptParams;
      const replaceToken = promptKey === "insertTextComplete" ? "OpenAI: Complete" : "OpenAI: Continue";
      const tokenIndex = noteContent.indexOf(replaceToken);
      const startIndex = Math.max(0, Math.round(tokenIndex - this._constants.truncateLimit * 0.5));
      const endIndex = Math.min(noteContent.length, Math.round(tokenIndex + this._constants.truncateLimit * 0.5));
      const noteContentNearToken = noteContent.substring(startIndex, endIndex);
      return [
        `What text could be used to replace <token> in the following input markdown document? Markdown document is delimited by ~~~:`,
        `~~~\n${ noteContentNearToken.replace(`{${ replaceToken }}`, "<token>") }\n~~~`,
        `Your response should be grammatically correct and not repeat the markdown document. Do not explain how you derived your answer. Do not explain why you chose your answer.`,
        `Most importantly, DO NOT respond with <token> itself and DO NOT repeat word sequences from the markdown document. Maximum response length is 1,000 characters.`,
      ];
    } else {
      return this._userPrompts[promptKey](promptParams);
    }
  },

  // --------------------------------------------------------------------------
  // In spite of extensive prompt crafting, OpenAI still loves to provide answers that repeat our note
  // content. This function aims to ditch the crap.
  async _trimNoteContentFromAnswer(app, answer, replaceToken) {
    const noteUUID = app.context.noteUUID;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    const replaceIndex = noteContent.indexOf(replaceToken);
    const upToReplaceToken = noteContent.substring(0, replaceIndex - 1);
    const substring = upToReplaceToken.match(/(?:[\n\r.]|^)(.*)$/)?.[1];
    const maxSentenceStartLength = 100;
    const sentenceStart = !substring || substring.length > maxSentenceStartLength
      ? null
      : substring

    let refinedAnswer = answer.replace(replaceToken, "");
    if (sentenceStart && sentenceStart.trim().length > 1) {
      console.log(`Replacing sentence start fragment: "${ sentenceStart }"`);
      refinedAnswer = refinedAnswer.replace(sentenceStart, "");
    }
    const afterSentence = noteContent.substring(replaceIndex + 1, replaceIndex + 100);
    const afterSentenceIndex = refinedAnswer.indexOf(afterSentence);
    if (afterSentenceIndex !== -1) {
      console.error("OpenAI seems to have returned content after prompt. Truncating");
      refinedAnswer = refinedAnswer.substring(0, afterSentenceIndex);
    }

    if (refinedAnswer.split("\n").length > this._constants.maxCompletionAnswerLines) {
      console.error("Answer length", refinedAnswer.length, "exceeded maxCompletionAnswerLines, only returning first non-blank line of answer");
      refinedAnswer = refinedAnswer.split("\n").find(line => line.trim().length > 1);
    }
    console.log(`Answer originally "${ answer }", "Final answer "${ refinedAnswer }"`);
    return refinedAnswer;
  },

  // --------------------------------------------------------------------------
  _constants: {
    maxCompletionAnswerLines: 10,
    requestTimeoutSeconds: 40,
    truncateLimit: 12000, // GPT-3.5 has a 4097 token limit, and OpenAI limits that each token is 4-6 characters, implying a 16k-24k character limit. We're being conservative and limiting to 12k characters.
  },

  // --------------------------------------------------------------------------
  _systemPrompts: {
    defaultPrompt: "You are a helpful assistant helping continue writing markdown-formatted content.",
    reviseContent: "You are a helpful assistant that revises markdown-formatted content, as instructed.",
    reviseText: "You are a helpful assistant that revises text, as instructed.",
    summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
  },

  // --------------------------------------------------------------------------
  _userPrompts: {
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
  },
};
export default plugin;
