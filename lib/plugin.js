import {
  AI_MODEL_LABEL,
  LOOK_UP_OLLAMA_MODEL_ACTION_LABEL,
  MAX_REALISTIC_THESAURUS_RHYME_WORDS,
  MAX_WORDS_TO_SHOW_RHYME,
  MAX_WORDS_TO_SHOW_THESAURUS,
  OLLAMA_URL,
  OPENAI_KEY_LABEL,
  PLUGIN_NAME
} from "./constants"
import { recommendedAiModels, sendQuery } from "./model-picker"
import { fetchJson } from "./fetch-json"

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

  // Plugin-global variables
  ollamaModelsFound: null,
  callCountByModel: {},
  errorCountByModel: {},

  // --------------------------------------------------------------------------
  appOption: {
    [ LOOK_UP_OLLAMA_MODEL_ACTION_LABEL ]: async function(app) {
      await fetchJson(`${ OLLAMA_URL }/api/tags`).then(json => {
        if (json?.models?.length) {
          this.ollamaModelsFound = json.models.map(m => m.name);
          app.alert(`Successfully connected to Ollama! Available models include: ${ this.ollamaModelsFound.join(",") }`);
        } else if (Array.isArray(json?.models)) {
          app.alert("Successfully connected to Ollama, but could not find any running models. Try running 'ollama run llama2' in a terminal window?")
        }
      }).catch(error => {
        app.alert("Unable to connect to Ollama. Ensure you stop the process if it is currently running, then start it with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
      });
    },
    "Show AI Usage by Model": async function(app) {
      const callCountByModel = this.callCountByModel;
      const callCountByModelText = Object.keys(callCountByModel).map(model => `${ model }: ${ callCountByModel[model] }`).join("\n");
      const errorCountByModel = this.errorCountByModel;
      const errorCountByModelText = Object.keys(errorCountByModel).map(model => `${ model }: ${ errorCountByModel[model] }`).join("\n");
      await app.alert(`Since the app was last started on this platform:\n` + callCountByModelText + "\n\nError counts:\n" + errorCountByModelText);
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

      await this._noteOptionResultPrompt(app, noteUUID, "answer", { instruction });
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, noteUUID) {
      const instruction = await app.prompt("How should this note be revised?");
      if (!instruction) return;

      await this._noteOptionResultPrompt(app, noteUUID, "reviseContent", { instruction });
    },

    // --------------------------------------------------------------------------
    "Summarize": async function(app, noteUUID) {
      await this._noteOptionResultPrompt(app, noteUUID, "summarize", {});
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
        const answerPicked = await this._noteOptionInsertContent(app, app.context.noteUUID, "answerSelection",
          { text }, { confirmInsert: true });
        if (answerPicked) {
          return `${ text } ${ answerPicked }`;
        }
      }
    },

    // --------------------------------------------------------------------------
    "Complete": async function(app, text) {
      const { textResponse } = await sendQuery(this, app, "replaceTextComplete", { text: `${ text }<token>` });
      if (textResponse) {
        return `${ text } ${ textResponse }`;
      }
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, text) {
      const instruction = await app.prompt("How should this text be revised?");
      if (!instruction) return null;

      return await this._noteOptionInsertContent(app, app.context.noteUUID, "reviseText",
        { instruction, text });
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
  async _noteOptionResultPrompt(app, noteUUID, promptKey, promptParams) {
    const selectedText = this._noteOptionInsertContent(app, noteUUID, promptKey, promptParams);
    const selectedIndex = await app.prompt("What would you like to do with this result?", {
      inputs: [{
        type: "radio",
        label: "Choose an action",
        options: [
          { label: "Insert at start (prepend)", value: "insert_start" },
          { label: "Insert at end (append)", value: "insert_end" },
          { label: "Replace", value: "revise" },
          { label: "Cancel", value: "cancel" }
        ]
      }]
    });
    console.log("User picked", selectedIndex, "for response", selectedText);
    switch(selectedIndex) {
      case 0: app.insertNoteContent({ uuid: noteUUID }, selectedText); break;
      case 1: app.insertNoteContent({ uuid: noteUUID }, selectedText, { atEnd: true }); break;
      case 2: app.replaceNoteContent({ uuid: noteUUID }, selectedText); break;
    }
  },

  // --------------------------------------------------------------------------
  async _wordReplacer(app, text, promptKey) {
    const { noteUUID } = app.context;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    let contentIndex = noteContent.indexOf(text);
    if (contentIndex === -1) contentIndex = null;
    const result = await this._noteOptionInsertContent(app, noteUUID, promptKey, { text },
      { contentIndex });
    const optionList = result?.split("\n")?.map(word => word.replace(/^[\d\-]+\.?[\s]?/g, ""))?.
      map(word => word.trim())?.filter(n => n.length && n.split(" ").length <= MAX_REALISTIC_THESAURUS_RHYME_WORDS);
    if (optionList?.length) {
      console.log("Presenting option list", optionList)
      const selectedValue = await app.prompt(`Choose a replacement for "${ text }"`, {
        inputs: [{
          type: "radio",
          label: `${ optionList.length } candidate${ optionList.length === 1 ? "" : "s" } found`,
          options: optionList.map(option => ({
            label: option.toLowerCase(),
            value: option.toLowerCase()
          }))
        }]
      });
      if (selectedValue) {
        return selectedValue;
      }
    } else {
      app.alert("AI returned no usable results");
    }
    return null
  },

  // --------------------------------------------------------------------------
  async _completeText(app, promptKey) {
    const answer = await this._noteOptionInsertContent(app, app.context.noteUUID, promptKey, {});
    if (answer) {
      const replaceToken = promptKey === "continue" ? `${ PLUGIN_NAME }: Continue` : `${ PLUGIN_NAME }: Complete`;
      const trimmedAnswer = await this._trimNoteContentFromAnswer(app, answer, { replaceToken });
      console.debug("Inserting trimmed response text:", trimmedAnswer);
      return trimmedAnswer;
    } else {
      app.alert("Could not determine an answer to the provided question")
      return null;
    }
  },

  // --------------------------------------------------------------------------
  // Take a promptKey and promptParams, and prompt the user to confirm they like the result, or regenerate it with
  // a different AI model
  //
  // @param {object} app - The app object
  // @param {string} noteUUID - The UUID of the note that content will be inserted into
  // @param {string} promptKey - The key/type of prompt that will be sent to OpenAI
  // @param {object} promptParams - A hash of parameters that get passed through to user prompts
  // @param {object} options - An object of options (confirmInsert & rejectedResponses) that control the behavior of this function
  // @returns {string} - The user-chosen AI response
  async _noteOptionInsertContent(app, noteUUID, promptKey, promptParams, { preferredModels = null, confirmInsert = true,
      contentIndex = null, rejectedResponses = null } = {}) {
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    preferredModels = preferredModels || (await recommendedAiModels(this, app, promptKey));
    if (!preferredModels.length) return;

    const startAt = new Date();
    const { textResponse, modelUsed } = await sendQuery(this, app, promptKey, { ...promptParams, noteContent },
      { contentIndex, preferredModels, rejectedResponses });
    if (textResponse === null) {
      console.error("No result was returned from sendQuery with models", preferredModels);
      return;
    }

    if (confirmInsert) {
      const actions = [];
      preferredModels.forEach(model => {
        const modelLabel = model.split(":")[0];
        actions.push({ icon: "settings", label: `Try ${ modelLabel }` });
      });
      actions.push({ icon: "post_add", label: "Accept" });

      const selectedValue = await app.alert(textResponse, { actions, preface: `Suggested by ${ modelUsed }` });
      console.debug("User chose", selectedValue, "from", actions);
      if (selectedValue === preferredModels.length) {
        return textResponse;
      } else if (preferredModels[selectedValue]) {
        const preferredModel = preferredModels[selectedValue];
        const updatedRejects = (rejectedResponses || []);
        updatedRejects.push(textResponse);
        preferredModels = [ preferredModel, ...preferredModels.filter(model => model !== preferredModel) ];
        console.debug("User chose to try", preferredModel, "next so preferred models are", preferredModels);
        const options = { confirmInsert, contentIndex, preferredModels, rejectedResponses: updatedRejects };
        return await this._noteOptionInsertContent(app, noteUUID, promptKey, promptParams, options);
      } else {
        app.alert(`Did not recognize your selection "${ selectedValue }"`)
      }
    } else {
      // Primary purpose of this summary is to clear the alert that may be lingering from when we streamed the AI response
      const secondsUsed = Math.floor((new Date() - startAt) / 1000);
      app.alert(`Finished generating ${ textResponse.length } character response with ${ modelUsed } in ${ secondsUsed } second${ secondsUsed === 1 ? "" : "s" }`)
      return textResponse;
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

    let refinedAnswer = answer.replace(replaceToken, "").trim();
    if (sentenceStart && sentenceStart.trim().length > 1) {
      console.log(`Replacing sentence start fragment: "${ sentenceStart }"`);
      refinedAnswer = refinedAnswer.replace(sentenceStart, "");
    }
    const afterTokenIndex = replaceIndex + replaceToken.length
    const afterSentence = noteContent.substring(afterTokenIndex + 1, afterTokenIndex + 100).trim();
    if (afterSentence.length) {
      const afterSentenceIndex = refinedAnswer.indexOf(afterSentence);
      if (afterSentenceIndex !== -1) {
        console.error("OpenAI seems to have returned content after prompt. Truncating");
        refinedAnswer = refinedAnswer.substring(0, afterSentenceIndex);
      }
    }

    // Legacy code WBH Dec 2023 not so sure still has value
    // if (refinedAnswer.split("\n").length > MAX_RESPONSE_CHOICES) {
    //   console.error("Answer length", refinedAnswer.length, "exceeded maxCompletionAnswerLines, only returning first non-blank line of answer");
    //   refinedAnswer = refinedAnswer.split("\n").find(line => line.trim().length > 1);
    // }
    console.log(`Answer originally "${ answer }", refined answer "${ refinedAnswer }"`);
    return refinedAnswer.trim();
  },
};
export default plugin;
