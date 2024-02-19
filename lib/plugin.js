import {
  MAX_REALISTIC_THESAURUS_RHYME_WORDS,
  MAX_WORDS_TO_SHOW_RHYME,
  MAX_WORDS_TO_SHOW_THESAURUS,
} from "./constants/functionality"
import { APP_OPTION_VALUE_USE_PROMPT, QUESTION_ANSWER_PROMPT } from "./constants/prompt-strings"
import { LOOK_UP_OLLAMA_MODEL_ACTION_LABEL, OLLAMA_URL } from "./constants/provider"
import {
  AI_MODEL_LABEL,
  IMAGE_FROM_PRECEDING_LABEL,
  IMAGE_FROM_PROMPT_LABEL,
  OPENAI_KEY_LABEL,
  PLUGIN_NAME,
  SUGGEST_TASKS_LABEL,
} from "./constants/settings"
import { fetchJson } from "./fetch-json"
import { ollamaAvailableModels } from "./fetch-ollama"
import { initiateChat } from "./functions/chat"
import { groceryArrayFromContent, groceryContentFromJsonOrText } from "./functions/groceries"
import { imageFromPreceding, imageFromPrompt } from "./functions/image-generator"
import { taskArrayFromSuggestions } from "./functions/suggest-tasks"
import { notePromptResponse, recommendedAiModels, sendQuery } from "./model-picker"
import { apiKeyFromApp, apiKeyFromAppOrUser } from "./openai-settings"
import { contentfulPromptParams, promptsFromPromptKey } from "./prompts"
import { arrayFromJumbleResponse, cleanTextFromAnswer, optionWithoutPrefix, trimNoteContentFromAnswer } from "./util"

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
  callCountByModel: {},
  errorCountByModel: {},
  lastModelUsed: null,
  noFallbackModels: false,
  ollamaModelsFound: null,

  // --------------------------------------------------------------------------
  appOption: {
    // --------------------------------------------------------------------------
    [ LOOK_UP_OLLAMA_MODEL_ACTION_LABEL ]: async function(app) {
      const noOllamaString = `Unable to connect to Ollama. Ensure you stop the process if it is currently running, then ` +
        `start it with "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"`;
      try {
        const ollamaModels = await ollamaAvailableModels(this);
        if (ollamaModels?.length) {
          this.ollamaModelsFound = ollamaModels;
          app.alert(`Successfully connected to Ollama! Available models include: \n\n* ${ this.ollamaModelsFound.join("\n* ") }`);
        } else {
          const json = await fetchJson(`${ OLLAMA_URL }/api/tags`);
          if (Array.isArray(json?.models)) {
            app.alert("Successfully connected to Ollama, but could not find any running models. Try running 'ollama run mistral' in a terminal window?")
          } else {
            app.alert(noOllamaString)
          }
        }
      } catch(error) {
        app.alert(noOllamaString);
      }
    },

    // --------------------------------------------------------------------------
    "Show AI Usage by Model": async function(app) {
      const callCountByModel = this.callCountByModel;
      const callCountByModelText = Object.keys(callCountByModel).map(model => `${ model }: ${ callCountByModel[model] }`).join("\n");
      const errorCountByModel = this.errorCountByModel;
      const errorCountByModelText = Object.keys(errorCountByModel).map(model => `${ model }: ${ errorCountByModel[model] }`).join("\n");
      let alertText = `Since the app was last started on this platform:\n${ callCountByModelText }\n\n`;
      if (errorCountByModelText.length) {
        alertText += `Errors:\n` + errorCountByModelText;
      } else {
        alertText += `No errors reported.`;
      }
      await app.alert(alertText);
    },

    // --------------------------------------------------------------------------
    "Answer": async function(app) {
      let aiModels = await recommendedAiModels(this, app, "answer");
      const options = aiModels.map(model => ({ label: model, value: model }));
      const [ instruction, preferredModel ] = await app.prompt(QUESTION_ANSWER_PROMPT, {
        inputs: [
          { type: "text", label: "Question", placeholder: "What's the meaning of life in 500 characters or less?" },
          {
            type: "radio",
            label: `AI Model${ this.lastModelUsed ? `. Defaults to last used` : "" }`,
            options,
            value: this.lastModelUsed || aiModels?.at(0),
          }
        ]
      });
      console.debug("Instruction", instruction, "preferredModel", preferredModel);
      if (!instruction) return;

      if (preferredModel) aiModels = [ preferredModel ].concat(aiModels.filter(model => model !== preferredModel));
      return await this._noteOptionResultPrompt(app, null, "answer", { instruction },
        { preferredModels: aiModels });
    },

    // --------------------------------------------------------------------------
    "Converse (chat) with AI": async function(app) {
      const aiModels = await recommendedAiModels(plugin, app, "chat");
      await initiateChat(this, app, aiModels);
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

    // --------------------------------------------------------------------------
    [ IMAGE_FROM_PRECEDING_LABEL ]: async function(app) {
      const apiKey = await apiKeyFromAppOrUser(this, app);
      if (apiKey) {
        await imageFromPreceding(this, app, apiKey);
      }
    },

    // --------------------------------------------------------------------------
    [ IMAGE_FROM_PROMPT_LABEL ]: async function(app) {
      const apiKey = await apiKeyFromAppOrUser(this, app);
      if (apiKey) {
        await imageFromPrompt(this, app, apiKey);
      }
    },

    // --------------------------------------------------------------------------
    [ SUGGEST_TASKS_LABEL ]: async function(app) {
      const contentIndexText = `${ PLUGIN_NAME }: ${ SUGGEST_TASKS_LABEL }`;
      return await taskArrayFromSuggestions(this, app, contentIndexText);
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
        const sortedGroceryContent = await groceryContentFromJsonOrText(this, app, noteUUID, groceryArray);
        if (sortedGroceryContent) {
          app.replaceNoteContent({ uuid: noteUUID }, sortedGroceryContent);
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
        const answerPicked = await notePromptResponse(this, app, app.context.noteUUID, "answerSelection",
          { text }, { confirmInsert: true, contentIndexText: text });
        if (answerPicked) {
          return `${ text } ${ answerPicked }`;
        }
      }
    },

    // --------------------------------------------------------------------------
    "Complete": async function(app, text) {
      const { response } = await sendQuery(this, app, app.context.noteUUID, "replaceTextComplete", { text: `${ text }<token>` });
      if (response) {
        return `${ text } ${ response }`;
      }
    },

    // --------------------------------------------------------------------------
    "Revise": async function(app, text) {
      const instruction = await app.prompt("How should this text be revised?");
      if (!instruction) return null;

      return await notePromptResponse(this, app, app.context.noteUUID, "reviseText",
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
  // Waypoint between the oft-visited notePromptResponse, and various actions that might want to insert the
  // AI response through a variety of paths
  // @param {object} promptKeyParams - Basic instructions from promptKey to help generate user messages
  async _noteOptionResultPrompt(app, noteUUID, promptKey, promptKeyParams, { preferredModels = null } = {}) {
    let aiResponse = await notePromptResponse(this, app, noteUUID, promptKey, promptKeyParams,
      { preferredModels, confirmInsert: false });

    if (aiResponse?.length) {
      const trimmedResponse = cleanTextFromAnswer(aiResponse);
      const options = [];
      if (noteUUID) {
        options.push({ label: "Insert at start (prepend)", value: "prepend" },
          { label: "Insert at end (append)", value: "append" },
          { label: "Replace", value: "replace" });
      }
      options.push({ label: "Ask follow up question", value: "followup" });
      let valueSelected;
      if (options.length > 1) {
        valueSelected = await app.prompt(`${ APP_OPTION_VALUE_USE_PROMPT }\n\n${ trimmedResponse || aiResponse }`, {
          inputs: [{ type: "radio", label: "Choose an action", options, value: options[0], }]});
      } else {
        valueSelected = await app.alert(trimmedResponse || aiResponse, { actions: [{ label: "Ask follow up questions" }] });
        if (valueSelected === 0) valueSelected = "followup";
      }
      console.debug("User picked", valueSelected, "for response", aiResponse);
      switch(valueSelected) {
        case "prepend": app.insertNoteContent({ uuid: noteUUID }, aiResponse); break;
        case "append": app.insertNoteContent({ uuid: noteUUID }, aiResponse, { atEnd: true }); break;
        case "replace": app.replaceNoteContent({ uuid: noteUUID }, aiResponse); break;
        case "followup":
          const aiModel = this.lastModelUsed || (preferredModels?.length ? preferredModels[0] : null);
          const promptParams = await contentfulPromptParams(app, noteUUID, promptKey, promptKeyParams, aiModel);
          const systemUserMessages = promptsFromPromptKey(promptKey, promptParams, [], aiModel);
          const messages = systemUserMessages.concat({ role: "assistant", content: trimmedResponse });
          return await initiateChat(this, app, preferredModels?.length ? preferredModels : [ aiModel ], messages);
      }
      return aiResponse;
    }
  },

  // --------------------------------------------------------------------------
  async _wordReplacer(app, text, promptKey) {
    const { noteUUID } = app.context;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    let contentIndex = noteContent.indexOf(text);
    if (contentIndex === -1) contentIndex = null;
    const allowResponse = jsonResponse => {
      return typeof(jsonResponse) === "object" && jsonResponse.result;
    }
    const response = await notePromptResponse(this, app, noteUUID, promptKey, { text },
      { allowResponse, contentIndex });
    let options;
    if (response?.result) {
      options = arrayFromJumbleResponse(response.result);
      options = options.filter(option => option !== text);
    } else {
      return null;
    }
    const optionList = options.map(word => optionWithoutPrefix(word))?.
      map(word => word.trim())?.filter(n => n.length && n.split(" ").length <= MAX_REALISTIC_THESAURUS_RHYME_WORDS);
    if (optionList?.length) {
      console.debug("Presenting option list", optionList)
      const selectedValue = await app.prompt(`Choose a replacement for "${ text }"`, {
        inputs: [{
          type: "radio",
          label: `${ optionList.length } candidate${ optionList.length === 1 ? "" : "s" } found`,
          options: optionList.map(option => ({ label: option, value: option }))
        }]
      });
      if (selectedValue) {
        return selectedValue;
      }
    } else {
      const followUp = apiKeyFromApp(this, app)?.length
        ? "Consider adding an OpenAI API key to your plugin settings?"
        : "Try again?";
      app.alert(`Unable to get a usable response from available AI models. ${ followUp }`)
    }
    return null
  },

  // --------------------------------------------------------------------------
  async _completeText(app, promptKey) {
    const replaceToken = promptKey === "continue" ? `${ PLUGIN_NAME }: Continue` : `${ PLUGIN_NAME }: Complete`;
    const answer = await notePromptResponse(this, app, app.context.noteUUID, promptKey, {},
      { contentIndexText: replaceToken });
    if (answer) {
      const trimmedAnswer = await trimNoteContentFromAnswer(app, answer, { replaceToken });
      console.debug("Inserting trimmed response text:", trimmedAnswer);
      return trimmedAnswer;
    } else {
      return null;
    }
  },
};
export default plugin;
