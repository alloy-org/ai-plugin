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
import { initiateChat } from "./functions/chat"
import { groceryArrayFromContent, groceryCountConfirmation, noteContentFromGroceryResponse } from "./functions/groceries"
import { recommendedAiModels, responseFromPrompts, sendQuery } from "./model-picker"
import { fetchJson } from "./fetch-json"
import { trimNoteContentFromAnswer } from "./util"

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
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    "Show AI Usage by Model": async function(app) {
      const callCountByModel = this.callCountByModel;
      const callCountByModelText = Object.keys(callCountByModel).map(model => `${ model }: ${ callCountByModel[model] }`).join("\n");
      const errorCountByModel = this.errorCountByModel;
      const errorCountByModelText = Object.keys(errorCountByModel).map(model => `${ model }: ${ errorCountByModel[model] }`).join("\n");
      await app.alert(`Since the app was last started on this platform:\n` + callCountByModelText + "\n\nError counts:\n" + errorCountByModelText);
    },

    // --------------------------------------------------------------------------
    "Answer": async function(app) {
      const instruction = await app.prompt("What question would you like answered?");
      if (!instruction) return;

      await this._noteOptionResultPrompt(app, app.context.noteUUID, "answer", { instruction });
    },

    // --------------------------------------------------------------------------
    "Converse with AI": async function(app) {
      const aiModels = recommendedAiModels(plugin, app, "chat");
      await initiateChat(this, app, aiModels, responseFromPrompts);
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
    "Revise": async function(app, noteUUID) {
      const instruction = await app.prompt("How should this note be revised?");
      if (!instruction) return;

      await this._noteOptionResultPrompt(app, noteUUID, "reviseContent", { instruction });
    },

    // --------------------------------------------------------------------------
    "Sort Grocery List": {
      check: async function(app, noteUUID) {
        const noteContent = await app.getNoteContent({ uuid: noteUUID });
        return /grocer|bread|milk|meat|produce|banana|chicken|apple|cream|pepper|salt|sugar/.test(noteContent.toLowerCase());
      },
      run: async function(app, noteUUID) {
        const startContent = await app.getNoteContent({ uuid: noteUUID });
        const groceryArray = groceryArrayFromContent(startContent);
        const confirmation = groceryCountConfirmation.bind(this, groceryArray.length);
        let sortedListContent = await this._notePromptResponse(app, noteUUID, "sortGroceries", { groceryArray },
          { allowResponse: confirmation });
        if (sortedListContent?.length) {
          sortedListContent = noteContentFromGroceryResponse(sortedListContent)
          app.replaceNoteContent({ uuid: noteUUID }, sortedListContent);
        }
      }
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
        const answerPicked = await this._notePromptResponse(app, app.context.noteUUID, "answerSelection",
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

      return await this._notePromptResponse(app, app.context.noteUUID, "reviseText",
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
    const selectedText = await this._notePromptResponse(app, noteUUID, promptKey, promptParams);
    if (selectedText?.length) {
      const valueSelected = await app.prompt("What would you like to do with this result?", {
        inputs: [{
          type: "radio",
          label: "Choose an action",
          options: [
            { label: "Insert at start (prepend)", value: "prepend" },
            { label: "Insert at end (append)", value: "append" },
            { label: "Replace", value: "replace" },
            { label: "Cancel", value: "cancel" }
          ]
        }]
      });
      console.debug("User picked", valueSelected, "for response", selectedText);
      switch(valueSelected) {
        case "prepend": app.insertNoteContent({ uuid: noteUUID }, selectedText); break;
        case "append": app.insertNoteContent({ uuid: noteUUID }, selectedText, { atEnd: true }); break;
        case "replace": app.replaceNoteContent({ uuid: noteUUID }, selectedText); break;
      }
    }
  },

  // --------------------------------------------------------------------------
  async _wordReplacer(app, text, promptKey) {
    const { noteUUID } = app.context;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    let contentIndex = noteContent.indexOf(text);
    if (contentIndex === -1) contentIndex = null;
    const result = await this._notePromptResponse(app, noteUUID, promptKey, { text },
      { contentIndex });
    const optionList = result?.split("\n")?.map(word => word.replace(/^[\d\-]+\.?[\s]?/g, ""))?.
      map(word => word.trim())?.filter(n => n.length && n.split(" ").length <= MAX_REALISTIC_THESAURUS_RHYME_WORDS);
    if (optionList?.length) {
      console.debug("Presenting option list", optionList)
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
    }
    return null
  },

  // --------------------------------------------------------------------------
  async _completeText(app, promptKey) {
    const answer = await this._notePromptResponse(app, app.context.noteUUID, promptKey, {});
    if (answer) {
      const replaceToken = promptKey === "continue" ? `${ PLUGIN_NAME }: Continue` : `${ PLUGIN_NAME }: Complete`;
      const trimmedAnswer = await trimNoteContentFromAnswer(app, answer, { replaceToken });
      console.debug("Inserting trimmed response text:", trimmedAnswer);
      return trimmedAnswer;
    } else {
      app.alert("Could not determine an answer to the provided question")
      return null;
    }
  },

  // --------------------------------------------------------------------------
  // Take a promptKey and promptParams, and prompt the user to confirm they like the result, or regenerate it with
  // a different AI model. Return the text they picked, if they ultimately choose "Accept"
  //
  // @param {object} app - The app object
  // @param {string} noteUUID - The UUID of the note that content will be inserted into
  // @param {string} promptKey - The key/type of prompt that will be sent to OpenAI
  // @param {object} promptParams - A hash of parameters that get passed through to user prompts
  // @param {array|null} preferredModels - An array of models to try (and offer to user) in order
  // @param {boolean} confirmInsert - Whether to prompt the user to confirm the insertion of the AI response
  // @param {number|null} contentIndex - The index within the note content of the word/paragraph/section that is being analyzed
  // @param {array|null} rejectedResponses - An array of responses that have already been rejected
  // @returns {string} - The user-chosen AI response
  async _notePromptResponse(app, noteUUID, promptKey, promptParams, { preferredModels = null, confirmInsert = true,
      contentIndex = null, rejectedResponses = null, allowResponse = null } = {}) {
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    preferredModels = preferredModels || (await recommendedAiModels(this, app, promptKey));
    if (!preferredModels.length) return;

    const startAt = new Date();
    const { textResponse, modelUsed } = await sendQuery(this, app, promptKey, { ...promptParams, noteContent },
      { allowResponse, contentIndex, preferredModels, rejectedResponses });
    if (textResponse === null) {
      console.error("No result was returned from sendQuery with models", preferredModels);
      return;
    }

    if (confirmInsert) {
      const actions = [];
      preferredModels.forEach(model => {
        const modelLabel = model.split(":")[0];
        actions.push({ icon: "settings", label: `Try ${ modelLabel }${ preferredModels.length <= 2 && model === modelUsed ? " again" : "" }` });
      });
      const primaryAction = { icon: "post_add", label: "Accept" };

      const selectedValue = await app.alert(textResponse, { actions, preface: `Suggested by ${ modelUsed }`, primaryAction });
      console.debug("User chose", selectedValue, "from", actions);
      if (selectedValue === -1) {
        return textResponse;
      } else if (preferredModels[selectedValue]) {
        const preferredModel = preferredModels[selectedValue];
        const updatedRejects = (rejectedResponses || []);
        updatedRejects.push(textResponse);
        preferredModels = [ preferredModel, ...preferredModels.filter(model => model !== preferredModel) ];
        console.debug("User chose to try", preferredModel, "next so preferred models are", preferredModels);
        const options = { confirmInsert, contentIndex, preferredModels, rejectedResponses: updatedRejects };
        return await this._notePromptResponse(app, noteUUID, promptKey, promptParams, options);
      } else if (Number.isInteger(selectedValue)) {
        app.alert(`Did not recognize your selection "${ selectedValue }"`)
      }
    } else {
      // Primary purpose of this summary is to clear the alert that may be lingering from when we streamed the AI response
      const secondsUsed = Math.floor((new Date() - startAt) / 1000);
      app.alert(`Finished generating ${ textResponse.length } character response with ${ modelUsed } in ${ secondsUsed } second${ secondsUsed === 1 ? "" : "s" }`)
      return textResponse;
    }
  },

};
export default plugin;
