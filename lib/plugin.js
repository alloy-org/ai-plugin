import { buildOpenAIMessages, buildMessagesAndCallOpenAI, callOpenAI } from "./plugin-fetch.js"

const plugin = {
  // --------------------------------------------------------------------------------------
  constants: {
    defaultSystemPrompt: "You are a helpful assistant.",
    labelApiKey: "API Key",
    labelOpenAiModel: "OpenAI model (e.g., 'gpt-4'. Leave blank for gpt-3.5-turbo)",
    maxCompletionAnswerLines: 10,
    pluginName: "OpenAI",
    requestTimeoutSeconds: 40,
  },

  insertText: {
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    "Complete": async function(app) {
      return await this._completeText(app, "insertTextComplete");
    },

    // --------------------------------------------------------------------------
    "Continue": async function(app) {
      return await this._completeText(app, "continue");
    },
  },

  // --------------------------------------------------------------------------
  // https://www.amplenote.com/help/developing_amplenote_plugins#noteOption
  noteOption: {
    // --------------------------------------------------------------------------
    "Answer": async function(app, noteUUID) {
      const instruction = await app.prompt("What question should be answered?");
      if (!instruction) return;

      await this._noteOptionInsertContent(app, noteUUID, "answer", { instruction }, true);
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, noteUUID) {
      const instruction = await app.prompt("How should this note be revised?");
      if (!instruction) return;

      await this._noteOptionInsertContent(app, noteUUID, "reviseContent", { instruction }, true);
    },

    // --------------------------------------------------------------------------
    "Summarize": async function(app, noteUUID) {
      await this._noteOptionInsertContent(app, noteUUID, "summarize", {}, true);
    },
  },

  // --------------------------------------------------------------------------
  // https://www.amplenote.com/help/developing_amplenote_plugins#replaceText
  replaceText: {
    // --------------------------------------------------------------------------
    "Complete": async function(app, text) {
      const messages = buildOpenAIMessages("replaceTextComplete", { text: `${ text }<token>` });
      const result = await callOpenAI(this, app, messages);
      return result;
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, text) {
      const instruction = await app.prompt("How should this text be revised?");
      if (!instruction) return null;

      const result = await buildMessagesAndCallOpenAI(this, app, "reviseText", [ instruction, text ]);
      if (result === null) return null;

      app.alert(result);
      return null;
    },

    // --------------------------------------------------------------------------
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
  apiKey(app) {
    return app.settings[this.constants.labelApiKey].trim()
  },

  // --------------------------------------------------------------------------
  async _completeText(app, promptKey) {
    const answer = await this._noteOptionInsertContent(app, app.context.noteUUID, promptKey);
    if (answer) {
      const replaceToken = promptKey === "continue" ? "OpenAI: Continue" : "OpenAI: Complete";
      const trimmedAnswer = await this._trimNoteContentFromAnswer(app, answer, { replaceToken });
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

    const result = await buildMessagesAndCallOpenAI(this, app, promptKey, { instruction, noteContent, text });
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
  // In spite of extensive prompt crafting, OpenAI still loves to provide answers that repeat our note
  // content. This function aims to ditch the crap.
  async _trimNoteContentFromAnswer(app, answer, { replaceToken = null, replaceIndex = null } = {}) {
    const noteUUID = app.context.noteUUID;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    replaceIndex = (replaceIndex || noteContent.indexOf(replaceToken));
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

    if (refinedAnswer.split("\n").length > this.constants.maxCompletionAnswerLines) {
      console.error("Answer length", refinedAnswer.length, "exceeded maxCompletionAnswerLines, only returning first non-blank line of answer");
      refinedAnswer = refinedAnswer.split("\n").find(line => line.trim().length > 1);
    }
    console.log(`Answer originally "${ answer }", refined answer "${ refinedAnswer }"`);
    return refinedAnswer;
  },
};
export default plugin;
