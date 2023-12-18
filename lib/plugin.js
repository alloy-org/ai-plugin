import { AI_MODEL_LABEL, MAX_RESPONSE_CHOICES, OLLAMA_URL, OPENAI_KEY_LABEL, PLUGIN_NAME } from "./constants"
import { sendQuery } from "./model-picker"
import { fetchJson } from "./fetch-json"

const MAX_WORDS_TO_SHOW_RHYME = 4;
const MAX_WORDS_TO_SHOW_THESAURUS = 4;

// --------------------------------------------------------------------------
// To allow AmpleAI to cover a broad expanse of functionality w/o this file becoming overwhelming,
// this module aims to contain a minimum of logic, specific to the invocation of actions
// and interfacing with app entry points. The prompt-generating, AI-calling, and
// response-handling logic should be imported from more specific modules.
const plugin = {
  // --------------------------------------------------------------------------------------
  constants: {
    labelApiKey: OPENAI_KEY_LABEL,
    labelAiModel: AI_MODEL_LABEL,
    pluginName: PLUGIN_NAME,
    requestTimeoutSeconds: 30,
  },

  // --------------------------------------------------------------------------
  appOption: {
    "Test Ollama connection": async function(app) {
      await fetchJson(`${ OLLAMA_URL }/api/tags`).then(json => {
        if (json?.models?.length) {
          const availableModels = json.models.map(m => m.name);
          app.alert(`Successfully connected to Ollama! Available models include: ${ availableModels.join(",") }`);
        } else if (json?.models) {
          app.alert("Successfully connected to Ollama, but could not find any running models. Try running 'ollama run llama2' in a terminal window.")
        }
      }).catch(error => {
        app.alert("Unable to connect to Ollama. Ensure you stop the process if it is currently running, then start it with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
      });
    }
  },

  // --------------------------------------------------------------------------
  insertText: {
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
      const instruction = await app.prompt("What question would you like answered?");
      if (!instruction) return;

      await this._noteOptionInsertContent(app, noteUUID, "answer", { instruction }, { confirmInsert: true });
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, noteUUID) {
      const instruction = await app.prompt("How should this note be revised?");
      if (!instruction) return;

      await this._noteOptionInsertContent(app, noteUUID, "reviseContent", { instruction }, { confirmInsert: true });
    },

    // --------------------------------------------------------------------------
    "Summarize": async function(app, noteUUID) {
      await this._noteOptionInsertContent(app, noteUUID, "summarize", {}, { confirmInsert: true });
    },
  },

  // --------------------------------------------------------------------------
  // https://www.amplenote.com/help/developing_amplenote_plugins#replaceText
  replaceText: {
    "Answer": {
      check(app, text) {
        return (/(who|what|when|where|why|how)|\?/i.test(text));
      },
      async run(app, text) {
        return await this._noteOptionInsertContent(app, app.context.noteUUID, "answerSelection",
          { text }, { confirmInsert: true });
      }
    },

    // --------------------------------------------------------------------------
    "Complete": async function(app, text) {
      return sendQuery(this, app, "replaceTextComplete", { text: `${ text }<token>` });
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, text) {
      const instruction = await app.prompt("How should this text be revised?");
      if (!instruction) return null;

      const result = await sendQuery(this, app, "reviseText", { instruction, text });
      if (result === null) return null;

      app.alert(result);
      return null;
    },

    // --------------------------------------------------------------------------
    "Rhymes": {
      check(app, text) {
        return (text.split(" ").length <= MAX_WORDS_TO_SHOW_RHYME);
      },
      async run(app, text) {
        return await this._wordReplacer(app, text, "rhyming");
      },
    },

    // --------------------------------------------------------------------------
    "Thesaurus": {
      check(app, text) {
        return (text.split(" ").length <= MAX_WORDS_TO_SHOW_THESAURUS);
      },
      async run(app, text) {
        return await this._wordReplacer(app, text, "thesaurus");
      }
    }
  },

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  async _wordReplacer(app, text, promptKey) {
    const { noteUUID } = app.context;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    let contentIndex = noteContent.indexOf(text);
    if (contentIndex === -1) contentIndex = null;
    const result = await this._noteOptionInsertContent(app, noteUUID, promptKey, { text }, { contentIndex });
    const optionList = result?.split("\n")?.map(word => word.replace(/^[\d\-]+\.?[\s]?/g, ""))?.
      map(word => word.trim())?.filter(n => n.length);
    if (optionList?.length) {
      const selectedValue = await app.prompt(`Choose a replacement for "${ text }"`, {
        inputs: [{
          type: "radio",
          label: `${ optionList.length } candidate${ optionList.length === 1 ? "" : "s" } found`,
          options: optionList.map(option => ({ label: option.toLowerCase(), value: option.toLowerCase() }))
        }]
      });
      if (selectedValue) return selectedValue;
    } else {
      app.alert("AI returned no usable results");
    }
    return null
  },

  // --------------------------------------------------------------------------
  async _completeText(app, promptKey) {
    const answer = await this._noteOptionInsertContent(app, app.context.noteUUID, promptKey, {});
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
  // @param {object} app - The app object
  // @param {string} noteUUID - The UUID of the note that content will be inserted into
  // @param {string} promptKey - The key/type of prompt that will be sent to OpenAI
  // @param {object} promptParams - A hash of parameters that get passed through to user prompts
  // @param {object} options - An object of options (confirmInsert & rejectedResponses) that control the behavior of this function
  // @returns {string} - The response from AI
  async _noteOptionInsertContent(app, noteUUID, promptKey, promptParams, { confirmInsert = false, contentIndex = null, rejectedResponses = null } = {}) {
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();

    const result = await sendQuery(this, app, promptKey, { ...promptParams, noteContent },
      { contentIndex, rejectedResponses });
    if (result === null) return;

    if (confirmInsert) {
      const actionIndex = await app.alert(result, {
        actions: [
          { icon: "sync", label: "Try again" },
          { icon: "post_add", label: "Insert in note" }
        ]
      });
      if (actionIndex === 0) {
        const updatedRejects = (rejectedResponses || []).push(result);
        const options = { confirmInsert, contentIndex, rejectedResponses: updatedRejects };
        return await this._noteOptionInsertContent(app, noteUUID, promptKey, promptParams, options);
      } else if (actionIndex === 1) {
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
      : substring;

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

    if (refinedAnswer.split("\n").length > MAX_RESPONSE_CHOICES) {
      console.error("Answer length", refinedAnswer.length, "exceeded maxCompletionAnswerLines, only returning first non-blank line of answer");
      refinedAnswer = refinedAnswer.split("\n").find(line => line.trim().length > 1);
    }
    console.log(`Answer originally "${ answer }", refined answer "${ refinedAnswer }"`);
    return refinedAnswer;
  },

  ollamaModelsFound: null,
};
export default plugin;
