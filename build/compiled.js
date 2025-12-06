(() => {
  // lib/constants/functionality.js
  var MAX_WORDS_TO_SHOW_RHYME = 4;
  var MAX_WORDS_TO_SHOW_THESAURUS = 4;
  var MAX_REALISTIC_THESAURUS_RHYME_WORDS = 4;
  var REJECTED_RESPONSE_PREFIX = "The following responses were rejected:\n";

  // lib/constants/units.js
  var KILOBYTE = 1024;
  var TOKEN_CHARACTERS = 4;

  // lib/constants/provider.js
  function defaultProviderModel(providerEm) {
    return PROVIDER_DEFAULT_MODEL[providerEm];
  }
  function openAiTokenLimit(model) {
    return OPENAI_TOKEN_LIMITS[model];
  }
  function openAiModels() {
    return Object.keys(OPENAI_TOKEN_LIMITS);
  }
  function isModelOllama(model) {
    return !openAiModels().includes(model);
  }
  var DALL_E_DEFAULT = "1024x1024~dall-e-3";
  var LOOK_UP_OLLAMA_MODEL_ACTION_LABEL = "Look up available Ollama models";
  var MIN_OPENAI_KEY_CHARACTERS = 50;
  var OLLAMA_URL = "http://localhost:11434";
  var OLLAMA_TOKEN_CHARACTER_LIMIT = 2e4;
  var OLLAMA_MODEL_PREFERENCES = [
    "mistral",
    "openhermes2.5-mistral",
    "llama2"
  ];
  var PROVIDER_DEFAULT_MODEL = {
    anthropic: "claude-sonnet-4-0",
    deepseek: "deepseek-chat",
    gemini: "gemini-2.5-flash",
    grok: "grok-3-beta",
    openai: "gpt-4o",
    perplexity: "sonar-pro"
  };
  var PROVIDER_ENDPOINTS = {
    anthropic: "https://api.anthropic.com/v1/messages",
    deepseek: "https://api.deepseek.com/v1/chat/completions",
    gemini: "https://generativelanguage.googleapis.com/v1beta/models/{model-name}:generateContent",
    grok: "https://api.x.ai/v1/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions",
    // https://platform.openai.com/docs/api-reference/chat/create
    perplexity: "https://api.perplexity.ai/chat/completions"
  };
  var ANTHROPIC_TOKEN_LIMITS = {
    "claude-opus-4-0": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-sonnet-4-0": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-3-7-sonnet-latest": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-3-5-sonnet-latest": 128 * KILOBYTE * TOKEN_CHARACTERS
  };
  var DEEPSEEK_TOKEN_LIMITS = {
    "deepseek-chat": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "deepseek-reasoner": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "deepseek-r1-0528": 64 * KILOBYTE * TOKEN_CHARACTERS
  };
  var GEMINI_TOKEN_LIMITS = {
    "gemini-2.5-pro": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.5-flash": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.5-flash-lite-preview-06-17": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.0-flash": 512 * KILOBYTE * TOKEN_CHARACTERS
  };
  var GROK_TOKEN_LIMITS = {
    "grok-3-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-3-mini-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-2-vision-1212": 8 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-2-image-1212": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-2-1212": 128 * KILOBYTE * TOKEN_CHARACTERS
  };
  var OPENAI_TOKEN_LIMITS = {
    "gpt-3.5": 4 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo": 4 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo-16k": 16 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo-1106": 16 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo-instruct": 4 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4": 8 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4.1": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4.1-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4o": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-1106-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-32k": 32 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-32k-0613": 32 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-vision-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "o3": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "o3-mini": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "o3-pro": 512 * KILOBYTE * TOKEN_CHARACTERS,
    "o4-mini": 512 * KILOBYTE * TOKEN_CHARACTERS
  };
  var PERPLEXITY_TOKEN_LIMITS = {
    "sonar-pro": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar-reasoning-pro": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar-reasoning": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar-deep-research": 128 * KILOBYTE * TOKEN_CHARACTERS
  };

  // lib/constants/prompt-strings.js
  var APP_OPTION_VALUE_USE_PROMPT = "What would you like to do with this result?";
  var IMAGE_GENERATION_PROMPT = "What would you like to generate an image of?";
  var NO_MODEL_FOUND_TEXT = `Could not find an available AI to call. Do you want to install and utilize Ollama, or would you prefer using OpenAI?

For casual-to-intermediate users, we recommend using OpenAI, since it offers higher quality results and can generate images.`;
  var OLLAMA_INSTALL_TEXT = `Rough installation instructions:
1. Download Ollama: https://ollama.ai/download
2. Install Ollama
3. Install one or more LLMs that will fit within the RAM your computer (examples at https://github.com/jmorganca/ollama)
4. Ensure that Ollama isn't already running, then start it in the console using "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"
You can test whether Ollama is running by invoking Quick Open and running the "${LOOK_UP_OLLAMA_MODEL_ACTION_LABEL}" action`;
  var OPENAI_API_KEY_URL = "https://platform.openai.com/account/api-keys";
  var OPENAI_API_KEY_TEXT = `Paste your LLM API key in the field below.

Once you have an OpenAI account, get your key here: ${OPENAI_API_KEY_URL}`;
  var OPENAI_INVALID_KEY_TEXT = `That doesn't seem to be a valid OpenAI API key. Possible next steps:

1. Enter one later in the settings for this plugin
2. Install Ollama
3. Re-run this command and enter a valid OpenAI API key (must be at least ${MIN_OPENAI_KEY_CHARACTERS} characters)`;
  var QUESTION_ANSWER_PROMPT = "What would you like to know?";

  // lib/constants/settings.js
  function settingKeyLabel(providerEm) {
    return PROVIDER_SETTING_KEY_LABELS[providerEm];
  }
  var AI_LEGACY_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4')";
  var AI_MODEL_LABEL = "Preferred AI models (e.g., 'gpt-4o, claude-4-sonnet, grok-3-beta')";
  var CORS_PROXY = "https://wispy-darkness-7716.amplenote.workers.dev";
  var IMAGE_FROM_PRECEDING_LABEL = "Image from preceding text";
  var IMAGE_FROM_PROMPT_LABEL = "Image from prompt";
  var MAX_SPACES_ABORT_RESPONSE = 30;
  var SUGGEST_TASKS_LABEL = "Suggest tasks";
  var PLUGIN_NAME = "AmpleAI";
  var PROVIDER_SETTING_KEY_LABELS = {
    anthropic: "Anthropic API Key",
    deepseek: "DeepSeek API Key",
    gemini: "Gemini API Key",
    grok: "Grok API Key",
    openai: "OpenAI API Key",
    perplexity: "Perplexity API Key"
  };

  // lib/prompt-api-params.js
  function isJsonPrompt(promptKey) {
    return !!["rhyming", "thesaurus", "sortGroceriesJson", "suggestTasks"].find((key) => key === promptKey);
  }
  function useLongContentContext(promptKey) {
    return ["continue", "insertTextComplete"].includes(promptKey);
  }
  function limitContextLines(aiModel, _promptKey) {
    return !/(gpt-4|gpt-3)/.test(aiModel);
  }
  function tooDumbForExample(aiModel) {
    const smartModel = ["mistral"].includes(aiModel) || aiModel.includes("gpt-4");
    return !smartModel;
  }
  function frequencyPenaltyFromPromptKey(promptKey) {
    if (["rhyming", "suggestTasks", "thesaurus"].find((key) => key === promptKey)) {
      return 2;
    } else if (["answer"].find((key) => key === promptKey)) {
      return 1;
    } else if (["revise", "sortGroceriesJson", "sortGroceriesText"].find((key) => key === promptKey)) {
      return -1;
    } else {
      return 0;
    }
  }

  // lib/util.js
  function truncate(text, limit) {
    return text.length > limit ? text.slice(0, limit) : text;
  }
  function arrayFromJumbleResponse(response) {
    if (!response)
      return null;
    const splitWords = (gobbledeegoop) => {
      let words;
      if (Array.isArray(gobbledeegoop)) {
        words = gobbledeegoop;
      } else if (gobbledeegoop.includes(",")) {
        words = gobbledeegoop.split(",");
      } else if (gobbledeegoop.includes("\n")) {
        words = gobbledeegoop.split("\n");
      } else {
        words = [gobbledeegoop];
      }
      return words.map((w) => w.trim());
    };
    let properArray;
    if (Array.isArray(response)) {
      properArray = response.reduce((arr, gobbledeegoop) => arr.concat(splitWords(gobbledeegoop)), []);
    } else {
      properArray = splitWords(response);
    }
    return properArray;
  }
  async function trimNoteContentFromAnswer(app, answer, { replaceToken = null, replaceIndex = null } = {}) {
    const noteUUID = app.context.noteUUID;
    const note = await app.notes.find(noteUUID);
    const noteContent = await note.content();
    let refinedAnswer = answer;
    if (replaceIndex || replaceToken) {
      replaceIndex = replaceIndex || noteContent.indexOf(replaceToken);
      const upToReplaceToken = noteContent.substring(0, replaceIndex - 1);
      const substring = upToReplaceToken.match(/(?:[\n\r.]|^)(.*)$/)?.[1];
      const maxSentenceStartLength = 100;
      const sentenceStart = !substring || substring.length > maxSentenceStartLength ? null : substring;
      if (replaceToken) {
        refinedAnswer = answer.replace(replaceToken, "").trim();
        if (sentenceStart && sentenceStart.trim().length > 1) {
          console.debug(`Replacing sentence start fragment: "${sentenceStart}"`);
          refinedAnswer = refinedAnswer.replace(sentenceStart, "");
        }
        const afterTokenIndex = replaceIndex + replaceToken.length;
        const afterSentence = noteContent.substring(afterTokenIndex + 1, afterTokenIndex + 100).trim();
        if (afterSentence.length) {
          const afterSentenceIndex = refinedAnswer.indexOf(afterSentence);
          if (afterSentenceIndex !== -1) {
            console.error("OpenAI seems to have returned content after prompt. Truncating");
            refinedAnswer = refinedAnswer.substring(0, afterSentenceIndex);
          }
        }
      }
    }
    const originalLines = noteContent.split("\n").map((w) => w.trim());
    const withoutOriginalLines = refinedAnswer.split("\n").filter((line) => !originalLines.includes(line.trim())).join("\n");
    const withoutJunkLines = cleanTextFromAnswer(withoutOriginalLines);
    console.debug(`Answer originally ${answer.length} length, refined answer ${refinedAnswer.length}. Without repeated lines ${withoutJunkLines.length} length`);
    return withoutJunkLines.trim();
  }
  function balancedJsonFromString(string) {
    const jsonStart = string.indexOf("{");
    if (jsonStart === -1)
      return null;
    const jsonAndAfter = string.substring(jsonStart).trim();
    const pendingBalance = [];
    let jsonText = "";
    for (const char of jsonAndAfter) {
      jsonText += char;
      if (char === "{") {
        pendingBalance.push("}");
      } else if (char === "}") {
        if (pendingBalance[pendingBalance.length - 1] === "}")
          pendingBalance.pop();
      } else if (char === "[") {
        pendingBalance.push("]");
      } else if (char === "]") {
        if (pendingBalance[pendingBalance.length - 1] === "]")
          pendingBalance.pop();
      }
      if (pendingBalance.length === 0)
        break;
    }
    if (pendingBalance.length) {
      console.debug("Found", pendingBalance.length, "characters to append to balance", jsonText, ". Adding ", pendingBalance.reverse().join(""));
      jsonText += pendingBalance.reverse().join("");
    }
    return jsonText;
  }
  function arrayFromResponseString(responseString) {
    if (typeof responseString !== "string")
      return null;
    const listItems = responseString.match(/^[\-*\d.]+\s+(.*)$/gm);
    if (listItems?.length) {
      return listItems.map((item) => optionWithoutPrefix(item));
    } else {
      return null;
    }
  }
  function optionWithoutPrefix(option) {
    if (!option)
      return option;
    const withoutStarAndNumber = option.trim().replace(/^[\-*\d.]+\s+/, "");
    const withoutCheckbox = withoutStarAndNumber.replace(/^-?\s*\[\s*]\s+/, "");
    return withoutCheckbox;
  }
  function cleanTextFromAnswer(answer) {
    return answer.split("\n").filter((line) => !/^(~~~|```(markdown)?)$/.test(line.trim())).join("\n");
  }
  function jsonFromAiText(jsonText) {
    let json;
    let jsonStart = jsonText.indexOf("{");
    if (jsonStart === -1) {
      jsonText = `{${jsonText}`;
      jsonStart = 0;
    }
    let jsonEnd = jsonText.lastIndexOf("}") + 1;
    if (jsonEnd === 0) {
      if (jsonText[jsonText.length - 1] === ",")
        jsonText = jsonText.substring(0, jsonText.length - 1);
      if (jsonText.includes("[") && !jsonText.includes("]"))
        jsonText += "]";
      jsonText = `${jsonText}}`;
    } else {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }
    try {
      json = JSON.parse(jsonText);
      return json;
    } catch (e) {
      const parseTextWas = jsonText;
      jsonText = balancedJsonFromString(jsonText);
      console.error("Failed to parse jsonText", parseTextWas, "due to", e, "Attempted rebalance yielded", jsonText);
      try {
        json = JSON.parse(jsonText);
        return json;
      } catch (e2) {
        console.error("Rebalanced jsonText still fails", e2);
      }
      let reformattedText = jsonText.replace(/"""/g, `"\\""`).replace(/"\n/g, `"\\n`);
      reformattedText = reformattedText.replace(/\n\s*['“”]/g, `
"`).replace(/['“”],\s*\n/g, `",
`).replace(/['“”]\s*([\n\]])/, `"$1`);
      if (reformattedText !== jsonText) {
        try {
          json = JSON.parse(reformattedText);
          return json;
        } catch (e2) {
          console.error("Reformatted text still fails", e2);
        }
      }
    }
    return null;
  }

  // lib/fetch-json.js
  var streamTimeoutSeconds = 2;
  function shouldStream(plugin2) {
    return !plugin2.constants.isTestEnvironment || plugin2.constants.streamTest;
  }
  function streamPrefaceString(aiModel, modelsQueried, promptKey, jsonResponseExpected) {
    let responseText = "";
    if (["chat"].indexOf(promptKey) === -1 && modelsQueried.length > 1) {
      responseText += `Response from ${modelsQueried[modelsQueried.length - 1]} was rejected as invalid.
`;
    }
    responseText += `${aiModel} is now generating ${jsonResponseExpected ? "JSON " : ""}response...`;
    return responseText;
  }
  function jsonFromMessages(messages) {
    const json = {};
    const systemMessage = messages.find((message) => message.role === "system");
    if (systemMessage) {
      json.system = systemMessage.content;
      messages = messages.filter((message) => message !== systemMessage);
    }
    const rejectedResponseMessage = messages.find((message) => message.role === "user" && message.content.startsWith(REJECTED_RESPONSE_PREFIX));
    if (rejectedResponseMessage) {
      json.rejectedResponses = rejectedResponseMessage.content;
      messages = messages.filter((message) => message !== rejectedResponseMessage);
    }
    json.prompt = messages[0].content;
    if (messages[1]) {
      console.error("Unexpected messages for JSON:", messages.slice(1));
    }
    return json;
  }
  function extractJsonFromString(inputString) {
    let jsonText = inputString.trim();
    let jsonStart = jsonText.indexOf("{");
    if (jsonStart === -1) {
      jsonText = "{" + jsonText;
    }
    let responses;
    if (jsonText.split("}{").length > 1) {
      responses = jsonText.split("}{").map((text) => `${text[0] === "{" ? "" : "{"}${text}${text[text.length - 1] === "}" ? "" : "}"}`);
      console.log("Received multiple responses from AI, evaluating each of", responses);
    } else {
      responses = [jsonText];
    }
    const jsonResponses = responses.map((jsonText2) => {
      return jsonFromAiText(jsonText2);
    });
    const formedResponses = jsonResponses.filter((n) => n);
    if (formedResponses.length) {
      if (formedResponses.length > 1) {
        const result = formedResponses[0];
        Object.entries(result).forEach(([key, value]) => {
          for (const altResponse of formedResponses.slice(1)) {
            const altValue = altResponse[key];
            if (altValue) {
              if (Array.isArray(altValue) && Array.isArray(value)) {
                result[key] = [.../* @__PURE__ */ new Set([...value, ...altValue])].filter((w) => w);
              }
            }
          }
        });
        return result;
      } else {
        return formedResponses[0];
      }
    }
    return null;
  }
  async function responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds = 30 } = {}) {
    const jsonResponseExpected = isJsonPrompt(promptKey);
    let result;
    if (streamCallback) {
      result = await responseTextFromStreamResponse(app, response, model, jsonResponseExpected, streamCallback);
      app.alert(result, { scrollToEnd: true });
    } else {
      try {
        await Promise.race([
          new Promise(async (resolve, _) => {
            const jsonResponse = await response.json();
            result = jsonResponse?.choices?.at(0)?.message?.content || jsonResponse?.choices?.at(0)?.message?.tool_calls?.at(0)?.function?.arguments || jsonResponse?.message?.content || jsonResponse?.response;
            resolve(result);
          }),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Ollama timeout")), timeoutSeconds * 1e3)
          )
        ]);
      } catch (e) {
        console.error("Failed to parse response from", model, "error", e);
        throw e;
      }
    }
    const resultBeforeTransform = result;
    if (jsonResponseExpected) {
      result = extractJsonFromString(result);
    }
    if (!allowResponse || allowResponse(result)) {
      return result;
    }
    if (resultBeforeTransform) {
      console.debug("Received", resultBeforeTransform, "but could not parse as a valid result");
    }
    return null;
  }
  function fetchJson(endpoint, attrs) {
    attrs = attrs || {};
    if (!attrs.headers)
      attrs.headers = {};
    attrs.headers["Accept"] = "application/json";
    attrs.headers["Content-Type"] = "application/json";
    const method = (attrs.method || "GET").toUpperCase();
    if (attrs.payload) {
      if (method === "GET") {
        endpoint = extendUrlWithParameters(endpoint, attrs.payload);
      } else {
        attrs.body = JSON.stringify(attrs.payload);
      }
    }
    return fetch(endpoint, attrs).then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error(`Could not fetch ${endpoint}: ${response}`);
      }
    });
  }
  function jsonResponseFromStreamChunk(supposedlyJsonContent, failedParseContent) {
    let jsonResponse;
    const testContent = supposedlyJsonContent.replace(/^data:\s?/, "").trim();
    try {
      jsonResponse = JSON.parse(testContent);
    } catch (e) {
      if (failedParseContent) {
        try {
          jsonResponse = JSON.parse(failedParseContent + testContent);
        } catch (err) {
          return { failedParseContent: failedParseContent + testContent };
        }
      } else {
        const jsonStart = testContent.indexOf("{");
        if (jsonStart) {
          try {
            jsonResponse = JSON.parse(testContent.substring(jsonStart));
            return { failedParseContent: null, jsonResponse };
          } catch (err) {
            console.debug("Moving start position didn't fix JSON parse error");
          }
        }
        return { failedParseContent: testContent };
      }
    }
    return { failedParseContent: null, jsonResponse };
  }
  async function responseTextFromStreamResponse(app, response, aiModel, responseJsonExpected, streamCallback) {
    if (typeof global !== "undefined" && typeof global.fetch !== "undefined") {
      return await streamIsomorphicFetch(app, response, aiModel, responseJsonExpected, streamCallback);
    } else {
      return await streamWindowFetch(app, response, aiModel, responseJsonExpected, streamCallback);
    }
  }
  async function streamIsomorphicFetch(app, response, aiModel, responseJsonExpected, callback) {
    const responseBody = response.body;
    let abort = false;
    let receivedContent = "";
    let failedParseContent, incrementalContents;
    await new Promise((resolve, _reject) => {
      const readStream = () => {
        let failLoops = 0;
        const processChunk = () => {
          const chunk = responseBody.read();
          if (chunk) {
            failLoops = 0;
            const decoded = chunk.toString();
            const responseObject = callback(app, decoded, receivedContent, aiModel, responseJsonExpected, failedParseContent);
            ({ abort, failedParseContent, incrementalContents, receivedContent } = responseObject);
            if (abort || !shouldContinueStream(incrementalContents, receivedContent)) {
              resolve();
              return;
            }
            processChunk();
          } else {
            failLoops += 1;
            if (failLoops < 3) {
              setTimeout(processChunk, streamTimeoutSeconds * 1e3);
            } else {
              resolve();
            }
          }
        };
        processChunk();
      };
      responseBody.on("readable", readStream);
    });
    return receivedContent;
  }
  async function streamWindowFetch(app, response, aiModel, responseJsonExpected, callback) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let abort, error, failedParseContent, incrementalContents;
    let failLoops = 0;
    let receivedContent = "";
    while (!error) {
      let value = null, done = false;
      try {
        await Promise.race([
          { done, value } = await reader.read(),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Timeout")), streamTimeoutSeconds * 1e3)
          )
        ]);
      } catch (e) {
        error = e;
        console.log(`Failed to receive further stream data in time`, e);
        break;
      }
      if (done || failLoops > 3) {
        console.debug("Completed generating response length");
        break;
      } else if (value) {
        const decodedValue = decoder.decode(value, { stream: true });
        try {
          if (typeof decodedValue === "string") {
            failLoops = 0;
            const response2 = callback(app, decodedValue, receivedContent, aiModel, responseJsonExpected, failedParseContent);
            if (response2) {
              ({ abort, failedParseContent, incrementalContents, receivedContent } = response2);
              console.log("incrementalContent", incrementalContents, "receivedContent", receivedContent);
              if (abort)
                break;
              if (!shouldContinueStream(incrementalContents, receivedContent))
                break;
            } else {
              console.error("Failed to parse stream from", value, "as JSON");
              failLoops += 1;
            }
          } else {
            console.error("Failed to parse stream from", value, "as JSON");
            failLoops += 1;
          }
        } catch (error2) {
          console.error("There was an error parsing the response from stream:", error2);
          break;
        }
      } else {
        failLoops += 1;
      }
    }
    return receivedContent;
  }
  function shouldContinueStream(chunkStrings, accumulatedResponse) {
    let tooMuchSpace;
    if (chunkStrings?.length && (accumulatedResponse?.length || 0) >= MAX_SPACES_ABORT_RESPONSE) {
      const sansNewlines = accumulatedResponse.replace(/\n/g, " ");
      tooMuchSpace = sansNewlines.substring(sansNewlines.length - MAX_SPACES_ABORT_RESPONSE).trim() === "";
      if (tooMuchSpace)
        console.debug("Response exceeds empty space threshold. Aborting");
    }
    return !tooMuchSpace;
  }
  function extendUrlWithParameters(basePath, paramObject) {
    let path = basePath;
    if (basePath.indexOf("?") !== -1) {
      path += "&";
    } else {
      path += "?";
    }
    function deepSerialize(object, prefix) {
      const keyValues = [];
      for (let property in object) {
        if (object.hasOwnProperty(property)) {
          const key = prefix ? prefix + "[" + property + "]" : property;
          const value = object[property];
          keyValues.push(
            value !== null && typeof value === "object" ? deepSerialize(value, key) : encodeURIComponent(key) + "=" + encodeURIComponent(value)
          );
        }
      }
      return keyValues.join("&");
    }
    path += deepSerialize(paramObject);
    return path;
  }

  // lib/fetch-ollama.js
  async function callOllama(plugin2, app, model, messages, promptKey, allowResponse, modelsQueried = []) {
    const stream = shouldStream(plugin2);
    const jsonEndpoint = isJsonPrompt(promptKey);
    let response;
    const streamCallback = stream ? streamAccumulate.bind(null, modelsQueried, promptKey) : null;
    if (jsonEndpoint) {
      response = await responsePromiseFromGenerate(
        app,
        messages,
        model,
        promptKey,
        streamCallback,
        allowResponse,
        plugin2.constants.requestTimeoutSeconds
      );
    } else {
      response = await responseFromChat(
        app,
        messages,
        model,
        promptKey,
        streamCallback,
        allowResponse,
        plugin2.constants.requestTimeoutSeconds,
        { isTestEnvironment: plugin2.isTestEnvironment }
      );
    }
    console.debug("Ollama", model, "model sez:\n", response);
    return response;
  }
  async function ollamaAvailableModels(plugin2, alertOnEmptyApp = null) {
    try {
      const json = await fetchJson(`${OLLAMA_URL}/api/tags`);
      if (!json)
        return null;
      if (json?.models?.length) {
        const availableModels = json.models.map((m) => m.name);
        const transformedModels = availableModels.map((m) => m.split(":")[0]);
        const uniqueModels = transformedModels.filter((value, index, array) => array.indexOf(value) === index);
        const sortedModels = uniqueModels.sort((a, b) => {
          const aValue = OLLAMA_MODEL_PREFERENCES.indexOf(a) === -1 ? 10 : OLLAMA_MODEL_PREFERENCES.indexOf(a);
          const bValue = OLLAMA_MODEL_PREFERENCES.indexOf(b) === -1 ? 10 : OLLAMA_MODEL_PREFERENCES.indexOf(b);
          return aValue - bValue;
        });
        console.debug("Ollama reports", availableModels, "available models, transformed to", sortedModels);
        return sortedModels;
      } else {
        if (alertOnEmptyApp) {
          if (Array.isArray(json?.models)) {
            alertOnEmptyApp.alert("Ollama is running but no LLMs are reported as available. Have you Run 'ollama run mistral' yet?");
          } else {
            alertOnEmptyApp.alert(`Unable to fetch Ollama models. Was Ollama started with "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"?`);
          }
        }
        return null;
      }
    } catch (error) {
      console.log("Error trying to fetch Ollama versions: ", error, "Are you sure Ollama was started with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
    }
  }
  async function responseFromChat(app, messages, model, promptKey, streamCallback, allowResponse, timeoutSeconds, { isTestEnvironment = false } = {}) {
    if (isTestEnvironment)
      console.log("Calling Ollama with", model, "and streamCallback", streamCallback);
    let response;
    try {
      await Promise.race([
        response = await fetch(`${OLLAMA_URL}/api/chat`, {
          body: JSON.stringify({ model, messages, stream: !!streamCallback }),
          method: "POST"
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Ollama Generate Timeout")), timeoutSeconds * 1e3))
      ]);
    } catch (e) {
      throw e;
    }
    if (response?.ok) {
      return await responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds });
    } else {
      throw new Error("Failed to call Ollama with", model, messages, "and stream", !!streamCallback, "response was", response, "at", /* @__PURE__ */ new Date());
    }
  }
  async function responsePromiseFromGenerate(app, messages, model, promptKey, streamCallback, allowResponse, timeoutSeconds) {
    const jsonQuery = jsonFromMessages(messages);
    jsonQuery.model = model;
    jsonQuery.stream = !!streamCallback;
    let response;
    try {
      await Promise.race([
        response = await fetch(`${OLLAMA_URL}/api/generate`, {
          body: JSON.stringify(jsonQuery),
          method: "POST"
        }),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Ollama Generate Timeout")), timeoutSeconds * 1e3)
        )
      ]);
    } catch (e) {
      throw e;
    }
    return await responseFromStreamOrChunk(
      app,
      response,
      model,
      promptKey,
      streamCallback,
      allowResponse,
      { timeoutSeconds }
    );
  }
  function streamAccumulate(modelsQueriedArray, promptKey, app, decodedValue, receivedContent, aiModel, jsonResponseExpected, failedParseContent) {
    let jsonResponse, content = "";
    const responses = decodedValue.replace(/}\s*\n\{/g, "} \n{").split(" \n");
    const incrementalContents = [];
    for (const response of responses) {
      const parseableJson = response.replace(/"\n/, `"\\n`).replace(/"""/, `"\\""`);
      ({ failedParseContent, jsonResponse } = jsonResponseFromStreamChunk(parseableJson, failedParseContent));
      if (jsonResponse) {
        const responseContent = jsonResponse.message?.content || jsonResponse.response;
        if (responseContent) {
          incrementalContents.push(responseContent);
          content += responseContent;
        } else {
          console.debug("No response content found. Response", response, "\nParses to", parseableJson, "\nWhich yields JSON received", jsonResponse);
        }
      }
      if (content) {
        receivedContent += content;
        const userSelection = app.alert(receivedContent, {
          actions: [{ icon: "pending", label: "Generating response" }],
          preface: streamPrefaceString(aiModel, modelsQueriedArray, promptKey, jsonResponseExpected),
          scrollToEnd: true
        });
        if (userSelection === 0) {
          console.error("User chose to abort stream. Todo: return abort here?");
        }
      } else if (failedParseContent) {
        console.debug("Attempting to parse yielded failure. Received content so far is", receivedContent, "this stream deduced", responses.length, "responses");
      }
    }
    return { abort: jsonResponse.done, failedParseContent, incrementalContents, receivedContent };
  }

  // lib/prompts.js
  var PROMPT_KEYS = [
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
    "thesaurus"
  ];
  async function contentfulPromptParams(app, noteUUID, promptKey, promptKeyParams, aiModel, { contentIndex = null, contentIndexText = null, inputLimit = null } = {}) {
    let noteContent = "", noteName = "";
    if (!inputLimit)
      inputLimit = isModelOllama(aiModel) ? OLLAMA_TOKEN_CHARACTER_LIMIT : openAiTokenLimit(aiModel);
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
    const noteContentCharacterLimit = Math.min(inputLimit * 0.5, longContent ? 5e3 : 1e3);
    boundedContent = boundedContent.replace(/<!--\s\{[^}]+\}\s-->/g, "");
    if (noteContent && noteContent.length > noteContentCharacterLimit) {
      boundedContent = relevantContentFromContent(noteContent, contentIndex, noteContentCharacterLimit);
    }
    const limitedLines = limitContextLines(aiModel, promptKey);
    if (limitedLines && Number.isInteger(contentIndex)) {
      boundedContent = relevantLinesFromContent(boundedContent, contentIndex);
    }
    return { ...promptKeyParams, noteContent: boundedContent, noteName };
  }
  function promptsFromPromptKey(promptKey, promptParams, rejectedResponses, aiModel) {
    let messages = [];
    if (tooDumbForExample(aiModel)) {
      promptParams = { ...promptParams, suppressExample: true };
    }
    messages.push({ role: "system", content: systemPromptFromPromptKey(promptKey) });
    const userPrompt = userPromptFromPromptKey(promptKey, promptParams);
    if (Array.isArray(userPrompt)) {
      userPrompt.forEach((content) => {
        messages.push({ role: "user", content: truncate(content) });
      });
    } else {
      messages.push({ role: "user", content: truncate(userPrompt) });
    }
    const substantiveRejectedResponses = rejectedResponses?.filter((rejectedResponse) => rejectedResponse?.length > 0);
    if (substantiveRejectedResponses?.length) {
      let message = REJECTED_RESPONSE_PREFIX;
      substantiveRejectedResponses.forEach((rejectedResponse) => {
        message += `* ${rejectedResponse}
`;
      });
      const multiple = substantiveRejectedResponses.length > 1;
      message += `
Do NOT repeat ${multiple ? "any" : "the"} rejected response, ${multiple ? "these are" : "this is"} the WRONG RESPONSE.`;
      messages.push({ role: "user", content: message });
    }
    return messages;
  }
  var SYSTEM_PROMPTS = {
    defaultPrompt: "You are a helpful assistant that responds with markdown-formatted content.",
    reviseContent: "You are a helpful assistant that revises markdown-formatted content, as instructed.",
    reviseText: "You are a helpful assistant that revises text, as instructed.",
    rhyming: "You are a helpful rhyming word generator that responds in JSON with an array of rhyming words",
    sortGroceriesJson: "You are a helpful assistant that responds in JSON with sorted groceries using the 'instruction' key as a guide",
    suggestTasks: "You are a Fortune 100 CEO that returns an array of insightful tasks within the 'result' key of a JSON response",
    summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
    thesaurus: "You are a helpful thesaurus that responds in JSON with an array of alternate word choices that fit the context provided"
  };
  function messageArrayFromPrompt(promptKey, promptParams) {
    if (!PROMPT_KEYS.includes(promptKey))
      throw `Please add "${promptKey}" to PROMPT_KEYS array`;
    const userPrompts = {
      answer: ({ instruction }) => [
        `Succinctly answer the following question: ${instruction}`,
        "Do not explain your answer. Do not mention the question that was asked. Do not include unnecessary punctuation."
      ],
      answerSelection: ({ text }) => [text],
      complete: ({ noteContent }) => `Continue the following markdown-formatted content:

${noteContent}`,
      reviseContent: ({ noteContent, instruction }) => [instruction, noteContent],
      reviseText: ({ instruction, text }) => [instruction, text],
      rhyming: ({ noteContent, text }) => [
        JSON.stringify({
          instruction: `Respond with a JSON object containing ONLY ONE KEY called "result", that contains a JSON array of up to 10 rhyming words or phrases`,
          rhymesWith: text,
          rhymingWordContext: noteContent.replace(text, `<replace>${text}</replace>`),
          example: { input: { rhymesWith: "you" }, response: { result: ["knew", "blue", "shoe", "slew", "shrew", "debut", "voodoo", "field of view", "kangaroo", "view"] } }
        })
      ],
      sortGroceriesText: ({ groceryArray }) => [
        `Sort the following list of groceries by where it can be found in the grocery store:`,
        `- [ ] ${groceryArray.join(`
- [ ]`)}`,
        `Prefix each grocery aisle (each task section) with a "# ".

For example, if the input groceries were "Bananas", "Donuts", and "Bread", then the correct answer would be "# Produce
[ ] Bananas

# Bakery
[ ] Donuts
[ ] Bread"`,
        `DO NOT RESPOND WITH ANY EXPLANATION, only groceries and aisles. Return the exact same ${groceryArray.length} groceries provided in the array, without additions or subtractions.`
      ],
      sortGroceriesJson: ({ groceryArray }) => [
        JSON.stringify({
          instruction: `Respond with a JSON object, where the key is the aisle/department in which a grocery can be found, and the value is the array of groceries that can be found in that aisle/department.

Return the EXACT SAME ${groceryArray.length} groceries from the "groceries" key, without additions or subtractions.`,
          groceries: groceryArray,
          example: {
            input: { groceries: [" Bananas", "Donuts", "Grapes", "Bread", "salmon fillets"] },
            response: { "Produce": ["Bananas", "Grapes"], "Bakery": ["Donuts", "Bread"], "Seafood": ["salmon fillets"] }
          }
        })
      ],
      suggestTasks: ({ chosenTasks, noteContent, noteName, text }) => {
        const queryJson = {
          instruction: `Respond with a JSON object that contains an array of 10 tasks that will be inserted at the <inserTasks> token in the provided markdown content`,
          taskContext: `Title: ${noteName}

Content:
${noteContent.replace(text, `<insertTasks>`)}`,
          example: {
            input: { taskContext: `Title: Clean the house

Content: 
- [ ] Mop the floors
<insertTasks>` },
            response: {
              result: [
                "Dust the living room furniture",
                "Fold and put away the laundry",
                "Water indoor plants",
                "Hang up any recent mail",
                "Fold and put away laundry",
                "Take out the trash & recycling",
                "Wipe down bathroom mirrors & counter",
                "Sweep the entry and porch",
                "Organize the pantry",
                "Vacuum"
              ]
            }
          }
        };
        if (chosenTasks) {
          queryJson.alreadyAcceptedTasks = `The following tasks have been proposed and accepted already. DO NOT REPEAT THESE, but do suggest complementary tasks:
* ${chosenTasks.join("\n * ")}`;
        }
        return JSON.stringify(queryJson);
      },
      summarize: ({ noteContent }) => `Summarize the following markdown-formatted note:

${noteContent}`,
      thesaurus: ({ noteContent, text }) => [
        JSON.stringify({
          instruction: `Respond with a JSON object containing ONLY ONE KEY called "result". The value for the "result" key should be a 10-element array of the best words or phrases to replace "${text}" while remaining consistent with the included "replaceWordContext" markdown document.`,
          replaceWord: text,
          replaceWordContext: noteContent.replace(text, `<replaceWord>${text}</replaceWord>`),
          example: {
            input: { replaceWord: "helpful", replaceWordContext: "Mother always said that I should be <replaceWord>helpful</replaceWord> with my coworkers" },
            response: { result: ["useful", "friendly", "constructive", "cooperative", "sympathetic", "supportive", "kind", "considerate", "beneficent", "accommodating"] }
          }
        })
      ]
    };
    return userPrompts[promptKey]({ ...promptParams });
  }
  function userPromptFromPromptKey(promptKey, promptParams) {
    let userPrompts;
    if (["continue", "insertTextComplete", "replaceTextComplete"].find((key) => key === promptKey)) {
      const { noteContent } = promptParams;
      let tokenAndSurroundingContent;
      if (promptKey === "replaceTextComplete") {
        tokenAndSurroundingContent = promptParams.text;
      } else {
        const replaceToken = promptKey === "insertTextComplete" ? `${PLUGIN_NAME}: Complete` : `${PLUGIN_NAME}: Continue`;
        console.debug("Note content", noteContent, "replace token", replaceToken);
        tokenAndSurroundingContent = `~~~
${noteContent.replace(`{${replaceToken}}`, "<replaceToken>")}
~~~`;
      }
      userPrompts = [
        `Respond with text that will replace <replaceToken> in the following input markdown document, delimited by ~~~:`,
        tokenAndSurroundingContent,
        `Your response should be grammatically correct and not repeat the markdown document. DO NOT explain your answer.`,
        `Most importantly, DO NOT respond with <replaceToken> itself and DO NOT repeat word sequences from the markdown document. BE CONCISE.`
      ];
    } else {
      userPrompts = messageArrayFromPrompt(promptKey, promptParams);
      if (promptParams.suppressExample && userPrompts[0]?.includes("example")) {
        try {
          const json = JSON.parse(userPrompts[0]);
          delete json.example;
          userPrompts[0] = JSON.stringify(json);
        } catch (e) {
        }
      }
    }
    console.debug("Got user messages", userPrompts, "for", promptKey, "given promptParams", promptParams);
    return userPrompts;
  }
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
  function relevantLinesFromContent(content, contentIndex) {
    const maxContextLines = 4;
    const lines = content.split("\n").filter((l) => l.length);
    if (lines.length > maxContextLines) {
      let traverseChar = 0;
      let targetContentLine = lines.findIndex((line) => {
        if (traverseChar + line.length > contentIndex)
          return true;
        traverseChar += line.length + 1;
      });
      if (targetContentLine >= 0) {
        const startLine = Math.max(0, targetContentLine - Math.floor(maxContextLines * 0.75));
        const endLine = Math.min(lines.length, targetContentLine + Math.floor(maxContextLines * 0.25));
        console.debug("Submitting line index", startLine, "through", endLine, "of", lines.length, "lines");
        content = lines.slice(startLine, endLine).join("\n");
      }
    }
    return content;
  }
  function systemPromptFromPromptKey(promptKey) {
    const systemPrompts = SYSTEM_PROMPTS;
    return systemPrompts[promptKey] || systemPrompts.defaultPrompt;
  }
  function contentIndexFromParams(contentIndexText, noteContent) {
    let contentIndex = null;
    if (contentIndexText) {
      contentIndex = noteContent.indexOf(contentIndexText);
    }
    if (contentIndex === -1)
      contentIndex = null;
    return contentIndex;
  }

  // lib/openai-functions.js
  function toolsValueFromPrompt(promptKey) {
    let openaiFunction;
    switch (promptKey) {
      case "rhyming":
      case "thesaurus":
        const description = promptKey === "rhyming" ? "Array of 10 contextually relevant rhyming words" : "Array of 10 contextually relevant alternate words";
        openaiFunction = {
          "type": "function",
          "function": {
            "name": `calculate_${promptKey}_array`,
            "description": `Return the best ${promptKey} responses`,
            "parameters": {
              "type": "object",
              "properties": {
                "result": {
                  "type": "array",
                  "description": description,
                  "items": {
                    "type": "string"
                  }
                }
              },
              "required": ["result"]
            }
          }
        };
    }
    if (openaiFunction) {
      return [openaiFunction];
    } else {
      return null;
    }
  }

  // lib/ai-provider-settings.js
  async function apiKeyFromAppOrUser(plugin2, app, providerEm) {
    const apiKey = apiKeyFromApp(plugin2, app, providerEm) || await apiKeyFromUser(plugin2, app, providerEm);
    if (!apiKey) {
      app.alert("Couldn't find a valid OpenAI API key. An OpenAI account is necessary to generate images.");
      return null;
    }
    return apiKey;
  }
  function apiKeyFromApp(plugin2, app, providerEm) {
    const providerKeyLabel = settingKeyLabel(providerEm);
    if (app.settings[providerKeyLabel]) {
      return app.settings[providerKeyLabel].trim();
    } else if (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]) {
      const deprecatedKey = (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]).trim();
      app.setSetting(settingKeyLabel("openai"), deprecatedKey);
      return deprecatedKey;
    } else {
      if (plugin2.constants.isTestEnvironment) {
        throw new Error(`Couldnt find a ${providerEm} key in ${app.settings}`);
      } else {
        app.alert("Please configure your OpenAI key in plugin settings.");
      }
      return null;
    }
  }
  async function apiKeyFromUser(plugin2, app, providerEm) {
    const apiKey = await app.prompt(OPENAI_API_KEY_TEXT);
    if (apiKey) {
      app.setSetting(settingKeyLabel(providerEm), apiKey);
    }
    return apiKey;
  }

  // lib/fetch-ai-provider.js
  async function callOpenAI(plugin2, app, model, messages, promptKey, allowResponse, modelsQueried = []) {
    model = model?.trim()?.length ? model : defaultProviderModel("openai");
    const tools = toolsValueFromPrompt(promptKey);
    const streamCallback = shouldStream(plugin2) ? streamAccumulate2.bind(null, modelsQueried, promptKey) : null;
    try {
      return await requestWithRetry(
        app,
        model,
        messages,
        "openai",
        tools,
        apiKeyFromApp(plugin2, app, "openai"),
        promptKey,
        streamCallback,
        allowResponse,
        { timeoutSeconds: plugin2.constants.requestTimeoutSeconds }
      );
    } catch (error) {
      if (plugin2.isTestEnvironment) {
        console.error("Failed to call OpenAI", error);
      } else {
        app.alert("Failed to call OpenAI: " + error);
      }
      return null;
    }
  }
  async function requestWithRetry(app, model, messages, providerEm, tools, apiKey, promptKey, streamCallback, allowResponse, {
    retries = 3,
    timeoutSeconds = 30
  } = {}) {
    let error, response;
    if (!apiKey?.length) {
      app.alert("Please configure your OpenAI key in plugin settings.");
      return null;
    }
    const jsonResponseExpected = isJsonPrompt(promptKey);
    for (let i = 0; i < retries; i++) {
      if (i > 0)
        console.debug(`Loop ${i + 1}: Retrying ${model} with ${promptKey}`);
      try {
        const body = { model, messages, stream: !!streamCallback };
        if (tools)
          body.tools = tools;
        body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
        if (jsonResponseExpected && (model.includes("gpt-4") || model.includes("gpt-3.5-turbo-1106"))) {
          body.response_format = { type: "json_object" };
        }
        console.debug(`Sending ${providerEm} body ${body} at ${/* @__PURE__ */ new Date()}`);
        response = await Promise.race([
          fetch(PROVIDER_ENDPOINTS[providerEm], {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutSeconds * 1e3)
          )
        ]);
      } catch (e) {
        error = e;
        console.log(`Attempt ${i + 1} failed with`, e, `at ${/* @__PURE__ */ new Date()}. Retrying...`);
      }
      if (response?.ok) {
        break;
      }
    }
    console.debug("Response from promises is", response, "specifically response?.ok", response?.ok);
    if (response?.ok) {
      return await responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds });
    } else if (!response) {
      app.alert("Failed to call OpenAI: " + error);
      return null;
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
  }
  function streamAccumulate2(modelsQueriedArray, promptKey, app, decodedValue, receivedContent, aiModel, jsonResponseExpected, failedParseContent) {
    let stop = false, jsonResponse;
    const responses = decodedValue.split(/^data: /m).filter((s) => s.trim().length);
    const incrementalContents = [];
    for (const jsonString of responses) {
      if (jsonString.includes("[DONE]")) {
        console.debug("Received [DONE] from jsonString");
        stop = true;
        break;
      }
      ({ failedParseContent, jsonResponse } = jsonResponseFromStreamChunk(jsonString, failedParseContent));
      if (jsonResponse) {
        const content = jsonResponse.choices?.[0]?.delta?.content || jsonResponse.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments;
        if (content) {
          incrementalContents.push(content);
          receivedContent += content;
          app.alert(receivedContent, {
            actions: [{ icon: "pending", label: "Generating response" }],
            preface: streamPrefaceString(aiModel, modelsQueriedArray, promptKey, jsonResponseExpected),
            scrollToEnd: true
          });
        } else {
          stop = !!jsonResponse?.finish_reason?.length || !!jsonResponse?.choices?.[0]?.finish_reason?.length;
          if (stop) {
            console.log("Finishing stream for reason", jsonResponse?.finish_reason || jsonResponse?.choices?.[0]?.finish_reason);
            break;
          }
        }
      }
    }
    return { abort: stop, failedParseContent, incrementalContents, receivedContent };
  }

  // lib/model-picker.js
  var MAX_CANDIDATE_MODELS = 3;
  async function notePromptResponse(plugin2, app, noteUUID, promptKey, promptParams, {
    preferredModels = null,
    confirmInsert = true,
    contentIndex = null,
    rejectedResponses = null,
    allowResponse = null,
    contentIndexText
  } = {}) {
    preferredModels = preferredModels || await recommendedAiModels(plugin2, app, promptKey);
    if (!preferredModels.length)
      return;
    const startAt = /* @__PURE__ */ new Date();
    const { response, modelUsed } = await sendQuery(
      plugin2,
      app,
      noteUUID,
      promptKey,
      promptParams,
      { allowResponse, contentIndex, contentIndexText, preferredModels, rejectedResponses }
    );
    if (response === null) {
      app.alert("Failed to receive a usable response from AI");
      console.error("No result was returned from sendQuery with models", preferredModels);
      return;
    }
    if (confirmInsert) {
      const actions = [];
      preferredModels.forEach((model) => {
        const modelLabel = model.split(":")[0];
        actions.push({ icon: "chevron_right", label: `Try ${modelLabel}${model === modelUsed ? " again" : ""}` });
      });
      const primaryAction = { icon: "check_circle", label: "Approve" };
      let responseAsText = response, jsonResponse = false;
      if (typeof response === "object") {
        if (response.result?.length) {
          responseAsText = "Results:\n* " + response.result.join("\n * ");
        } else {
          jsonResponse = true;
          responseAsText = JSON.stringify(response);
        }
      }
      const selectedValue = await app.alert(responseAsText, {
        actions,
        preface: `${jsonResponse ? "JSON response s" : "S"}uggested by ${modelUsed}
Will be utilized after your preliminary approval`,
        primaryAction
      });
      console.debug("User chose", selectedValue, "from", actions);
      if (selectedValue === -1) {
        return response;
      } else if (preferredModels[selectedValue]) {
        const preferredModel = preferredModels[selectedValue];
        const updatedRejects = rejectedResponses || [];
        updatedRejects.push(responseAsText);
        preferredModels = [preferredModel, ...preferredModels.filter((model) => model !== preferredModel)];
        console.debug("User chose to try", preferredModel, "next so preferred models are", preferredModels, "Rejected responses now", updatedRejects);
        return await notePromptResponse(plugin2, app, noteUUID, promptKey, promptParams, {
          confirmInsert,
          contentIndex,
          preferredModels,
          rejectedResponses: updatedRejects
        });
      } else if (Number.isInteger(selectedValue)) {
        app.alert(`Did not recognize your selection "${selectedValue}"`);
      }
    } else {
      const secondsUsed = Math.floor((/* @__PURE__ */ new Date() - startAt) / 1e3);
      app.alert(`Finished generating ${response} response with ${modelUsed} in ${secondsUsed} second${secondsUsed === 1 ? "" : "s"}`);
      return response;
    }
  }
  async function recommendedAiModels(plugin2, app, promptKey) {
    let candidateAiModels = [];
    if (app.settings[plugin2.constants.labelAiModel]?.trim()) {
      candidateAiModels = app.settings[plugin2.constants.labelAiModel].trim().split(",").map((w) => w.trim()).filter((n) => n);
    }
    if (plugin2.lastModelUsed && (!isModelOllama(plugin2.lastModelUsed) || plugin2.ollamaModelsFound?.includes(plugin2.lastModelUsed))) {
      candidateAiModels.push(plugin2.lastModelUsed);
    }
    if (!plugin2.noFallbackModels) {
      const ollamaModels = plugin2.ollamaModelsFound || !plugin2.noLocalModels && await ollamaAvailableModels(plugin2, app);
      if (ollamaModels && !plugin2.ollamaModelsFound) {
        plugin2.ollamaModelsFound = ollamaModels;
      }
      candidateAiModels = includingFallbackModels(plugin2, app, candidateAiModels);
      if (!candidateAiModels.length) {
        candidateAiModels = await aiModelFromUserIntervention(plugin2, app);
        if (!candidateAiModels?.length)
          return null;
      }
    }
    if (["sortGroceriesJson"].includes(promptKey)) {
      candidateAiModels = candidateAiModels.filter((m) => m.includes("gpt-4"));
    }
    return candidateAiModels.slice(0, MAX_CANDIDATE_MODELS);
  }
  async function sendQuery(plugin2, app, noteUUID, promptKey, promptParams, {
    contentIndex = null,
    contentIndexText = null,
    preferredModels = null,
    rejectedResponses = null,
    allowResponse = null
  } = {}) {
    preferredModels = (preferredModels || await recommendedAiModels(plugin2, app, promptKey)).filter((n) => n);
    console.debug("Starting to query", promptKey, "with preferredModels", preferredModels);
    let modelsQueried = [];
    for (const aiModel of preferredModels) {
      const queryPromptParams = await contentfulPromptParams(
        app,
        noteUUID,
        promptKey,
        promptParams,
        aiModel,
        { contentIndex, contentIndexText }
      );
      const messages = promptsFromPromptKey(promptKey, queryPromptParams, rejectedResponses, aiModel);
      let response;
      plugin2.callCountByModel[aiModel] = (plugin2.callCountByModel[aiModel] || 0) + 1;
      plugin2.lastModelUsed = aiModel;
      modelsQueried.push(aiModel);
      try {
        response = await responseFromPrompts(plugin2, app, aiModel, promptKey, messages, { allowResponse, modelsQueried });
      } catch (e) {
        console.error("Caught exception trying to make call with", aiModel, e);
      }
      if (response && (!allowResponse || allowResponse(response))) {
        return { response, modelUsed: aiModel };
      } else {
        plugin2.errorCountByModel[aiModel] = (plugin2.errorCountByModel[aiModel] || 0) + 1;
        console.error("Failed to make call with", aiModel, "response", response, "while messages are", messages, "Error counts", plugin2.errorCountByModel);
      }
    }
    if (modelsQueried.length && modelsQueried.find((m) => isModelOllama(m)) && !plugin2.noLocalModels) {
      const availableModels = await ollamaAvailableModels(plugin2, app);
      plugin2.ollamaModelsFound = availableModels;
      console.debug("Found availableModels", availableModels, "after receiving no results in sendQuery. plugin.ollamaModelsFound is now", plugin2.ollamaModelsFound);
    }
    plugin2.lastModelUsed = null;
    return { response: null, modelUsed: null };
  }
  function responseFromPrompts(plugin2, app, aiModel, promptKey, messages, { allowResponse = null, modelsQueried = null } = {}) {
    if (isModelOllama(aiModel)) {
      return callOllama(plugin2, app, aiModel, messages, promptKey, allowResponse, modelsQueried);
    } else {
      return callOpenAI(plugin2, app, aiModel, messages, promptKey, allowResponse, modelsQueried);
    }
  }
  function includingFallbackModels(plugin2, app, candidateAiModels) {
    for (const providerEm of Object.keys(PROVIDER_SETTING_KEY_LABELS)) {
      const providerSettingLabel = PROVIDER_SETTING_KEY_LABELS[providerEm];
      if (app.settings[providerSettingLabel]?.length && !candidateAiModels.find((m) => m === PROVIDER_DEFAULT_MODEL[providerEm])) {
        candidateAiModels.push(PROVIDER_DEFAULT_MODEL[providerEm]);
        console.debug(`Added ${providerSettingLabel} model ${PROVIDER_DEFAULT_MODEL[providerEm]} to candidates`);
      }
    }
    if (plugin2.ollamaModelsFound?.length) {
      candidateAiModels = candidateAiModels.concat(plugin2.ollamaModelsFound.filter((m) => !candidateAiModels.includes(m)));
    }
    console.debug("Ended with", candidateAiModels);
    return candidateAiModels;
  }
  async function aiModelFromUserIntervention(plugin2, app, { optionSelected = null } = {}) {
    optionSelected = optionSelected || await app.prompt(NO_MODEL_FOUND_TEXT, {
      inputs: [
        {
          type: "radio",
          label: "Which model would you prefer to use?",
          options: [
            { label: "OpenAI: best for most users. Offers image generation", value: "openai" },
            { label: "Ollama: best for experts who want high customization, or a free option)", value: "ollama" }
          ],
          value: "openai"
        }
      ]
    });
    if (optionSelected === "openai") {
      const openaiKey = await app.prompt(OPENAI_API_KEY_TEXT);
      if (openaiKey && openaiKey.length >= MIN_OPENAI_KEY_CHARACTERS) {
        app.setSetting(plugin2.constants.labelApiKey, openaiKey.trim());
        await app.alert(`An OpenAI was successfully stored. The default OpenAI model, "${defaultProviderModel("openai")}", will be used for future AI lookups.`);
        return [defaultProviderModel("openai")];
      } else {
        console.debug("User entered invalid OpenAI key");
        const nextStep = await app.alert(OPENAI_INVALID_KEY_TEXT, { actions: [
          { icon: "settings", label: "Retry entering key" }
        ] });
        console.debug("nextStep selected", nextStep);
        if (nextStep === 0) {
          return await aiModelFromUserIntervention(plugin2, app, { optionSelected });
        }
        return null;
      }
    } else if (optionSelected === "ollama") {
      await app.alert(OLLAMA_INSTALL_TEXT);
      return null;
    }
  }

  // lib/functions/chat.js
  async function initiateChat(plugin2, app, aiModels, messageHistory = []) {
    let promptHistory;
    if (messageHistory.length) {
      promptHistory = messageHistory;
    } else {
      promptHistory = [{ content: "What's on your mind?", role: "assistant" }];
    }
    const modelsQueried = [];
    while (true) {
      const conversation = promptHistory.map((chat) => `${chat.role}: ${chat.content}`).join("\n\n");
      console.debug("Prompting user for next message to send to", plugin2.lastModelUsed || aiModels[0]);
      const [userMessage, modelToUse] = await app.prompt(conversation, {
        inputs: [
          { type: "text", label: "Message to send" },
          {
            type: "radio",
            label: "Send to",
            options: aiModels.map((model) => ({ label: model, value: model })),
            value: plugin2.lastModelUsed || aiModels[0]
          }
        ]
      }, { scrollToBottom: true });
      if (modelToUse) {
        promptHistory.push({ role: "user", content: userMessage });
        modelsQueried.push(modelToUse);
        const response = await responseFromPrompts(plugin2, app, modelToUse, "chat", promptHistory, { modelsQueried });
        if (response) {
          promptHistory.push({ role: "assistant", content: `[${modelToUse}] ${response}` });
          const alertResponse = await app.alert(response, { preface: conversation, actions: [{ icon: "navigate_next", label: "Ask a follow up question" }] });
          if (alertResponse === 0)
            continue;
        }
      }
      break;
    }
    console.debug("Finished chat with history", promptHistory);
  }

  // lib/functions/groceries.js
  function groceryArrayFromContent(content) {
    const lines = content.split("\n");
    const groceryLines = lines.filter((line) => line.match(/^[-*\[]\s/));
    const groceryArray = groceryLines.map((line) => optionWithoutPrefix(line).replace(/<!--.*-->/g, "").trim());
    return groceryArray;
  }
  async function groceryContentFromJsonOrText(plugin2, app, noteUUID, groceryArray) {
    const jsonModels = await recommendedAiModels(plugin2, app, "sortGroceriesJson");
    if (jsonModels.length) {
      const confirmation = groceryCountJsonConfirmation.bind(null, groceryArray.length);
      const jsonGroceries = await notePromptResponse(
        plugin2,
        app,
        noteUUID,
        "sortGroceriesJson",
        { groceryArray },
        { allowResponse: confirmation }
      );
      if (typeof jsonGroceries === "object") {
        return noteContentFromGroceryJsonResponse(jsonGroceries);
      }
    } else {
      const sortedListContent = await notePromptResponse(
        plugin2,
        app,
        noteUUID,
        "sortGroceriesText",
        { groceryArray },
        { allowResponse: groceryCountTextConfirmation.bind(null, groceryArray.length) }
      );
      if (sortedListContent?.length) {
        return noteContentFromGroceryTextResponse(sortedListContent);
      }
    }
  }
  function noteContentFromGroceryJsonResponse(jsonGroceries) {
    let text = "";
    for (const aisle of Object.keys(jsonGroceries)) {
      const groceries = jsonGroceries[aisle];
      text += `# ${aisle}
`;
      groceries.forEach((grocery) => {
        text += `- [ ] ${grocery}
`;
      });
      text += "\n";
    }
    return text;
  }
  function noteContentFromGroceryTextResponse(text) {
    text = text.replace(/^[\\-]{3,100}/g, "");
    text = text.replace(/^([-\\*]|\[\s\])\s/g, "- [ ] ");
    text = text.replace(/^[\s]*```.*/g, "");
    return text.trim();
  }
  function groceryCountJsonConfirmation(originalCount, proposedJson) {
    if (!proposedJson || typeof proposedJson !== "object")
      return false;
    const newCount = Object.values(proposedJson).reduce((sum, array) => sum + array.length, 0);
    console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
    return newCount === originalCount;
  }
  function groceryCountTextConfirmation(originalCount, proposedContent) {
    if (!proposedContent?.length)
      return false;
    const newCount = proposedContent.match(/^[-*\s]*\[[\s\]]+[\w]/gm)?.length || 0;
    console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
    return newCount === originalCount;
  }

  // lib/functions/image-generator.js
  async function imageFromPreceding(plugin2, app, apiKey) {
    const note = await app.notes.find(app.context.noteUUID);
    const noteContent = await note.content();
    const promptIndex = noteContent.indexOf(`{${plugin2.constants.pluginName}: ${IMAGE_FROM_PRECEDING_LABEL}`);
    const precedingContent = noteContent.substring(0, promptIndex).trim();
    const prompt = precedingContent.split("\n").pop();
    console.debug("Deduced prompt", prompt);
    if (prompt?.trim()) {
      try {
        const markdown = await imageMarkdownFromPrompt(plugin2, app, prompt.trim(), apiKey, { note });
        if (markdown) {
          app.context.replaceSelection(markdown);
        }
      } catch (e) {
        console.error("Error generating images from preceding text", e);
        app.alert("There was an error generating images from preceding text:" + e);
      }
    } else {
      app.alert("Could not determine preceding text to use as a prompt");
    }
  }
  async function imageFromPrompt(plugin2, app, apiKey) {
    const instruction = await app.prompt(IMAGE_GENERATION_PROMPT);
    if (!instruction)
      return;
    const note = await app.notes.find(app.context.noteUUID);
    const markdown = await imageMarkdownFromPrompt(plugin2, app, instruction, apiKey, { note });
    if (markdown) {
      app.context.replaceSelection(markdown);
    }
  }
  async function sizeModelFromUser(plugin2, app, prompt) {
    const [sizeModel, style] = await app.prompt(`Generating image for "${prompt.trim()}"`, {
      inputs: [
        {
          label: "Model & Size",
          options: [
            { label: "Dall-e-2 3x 512x512", value: "512x512~dall-e-2" },
            { label: "Dall-e-2 3x 1024x1024", value: "1024x1024~dall-e-2" },
            { label: "Dall-e-3 1x 1024x1024", value: "1024x1024~dall-e-3" },
            { label: "Dall-e-3 1x 1792x1024", value: "1792x1024~dall-e-3" },
            { label: "Dall-e-3 1x 1024x1792", value: "1024x1792~dall-e-3" }
          ],
          type: "radio",
          value: plugin2.lastImageModel || DALL_E_DEFAULT
        },
        {
          label: "Style - Used by Dall-e-3 models only (Optional)",
          options: [
            { label: "Vivid (default)", value: "vivid" },
            { label: "Natural", value: "natural" }
          ],
          type: "select",
          value: "vivid"
        }
      ]
    });
    plugin2.lastImageModel = sizeModel;
    const [size, model] = sizeModel.split("~");
    return [size, model, style];
  }
  async function imageMarkdownFromPrompt(plugin2, app, prompt, apiKey, { note = null } = {}) {
    if (!prompt) {
      app.alert("Couldn't find a prompt to generate image from");
      return null;
    }
    const [size, model, style] = await sizeModelFromUser(plugin2, app, prompt);
    const jsonBody = { prompt, model, n: model === "dall-e-2" ? 3 : 1, size };
    if (style && model === "dall-e-3")
      jsonBody.style = style;
    app.alert(`Generating ${jsonBody.n} image${jsonBody.n === 1 ? "" : "s"} for "${prompt.trim()}"...`);
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // As of Dec 2023, v3 can only generate one image per run
      body: JSON.stringify(jsonBody)
    });
    const result = await response.json();
    const { data } = result;
    if (data?.length) {
      const urls = data.map((d) => d.url);
      console.debug("Received options", urls, "at", /* @__PURE__ */ new Date());
      const radioOptions = urls.map((url) => ({ image: url, value: url }));
      radioOptions.push({ label: "Regenerate image", value: "more" });
      const chosenImageURL = await app.prompt(`Received ${urls.length} options`, {
        inputs: [{
          label: "Choose an image",
          options: radioOptions,
          type: "radio"
        }]
      });
      if (chosenImageURL === "more") {
        return imageMarkdownFromPrompt(plugin2, app, prompt, apiKey, { note });
      } else if (chosenImageURL) {
        console.debug("Fetching and uploading chosen URL", chosenImageURL);
        const imageData = await fetchImageAsDataURL(chosenImageURL);
        console.debug("Got", imageData ? imageData.length : "no", "length image data");
        if (!note)
          note = await app.notes.find(app.context.noteUUID);
        console.debug("Got note", note, "to insert image into");
        const ampleImageUrl = await note.attachMedia(imageData);
        console.debug("Ample image URL returned as", ampleImageUrl, "returning it as image");
        return `![image](${ampleImageUrl})`;
      }
      return null;
    } else {
      return null;
    }
  }
  async function fetchImageAsDataURL(url) {
    const response = await fetch(`${CORS_PROXY}/${url}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      reader.onerror = function(event) {
        reader.abort();
        reject(event.target.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  // lib/functions/suggest-tasks.js
  async function taskArrayFromSuggestions(plugin2, app, contentIndexText) {
    const allowResponse = (response2) => {
      const validJson = typeof response2 === "object" && (response2.result || response2.response?.result || response2.input?.response?.result || response2.input?.result);
      const validString = typeof response2 === "string" && arrayFromResponseString(response2)?.length;
      return validJson || validString;
    };
    const chosenTasks = [];
    const response = await notePromptResponse(
      plugin2,
      app,
      app.context.noteUUID,
      "suggestTasks",
      {},
      {
        allowResponse,
        contentIndexText
      }
    );
    if (response) {
      let unchosenTasks = taskArrayFromResponse(response);
      while (true) {
        const promptOptions = unchosenTasks.map((t) => ({ label: t, value: t }));
        if (!promptOptions.length)
          break;
        promptOptions.push({ label: "Add more tasks", value: "more" });
        promptOptions.push({ label: "Done picking tasks", value: "done" });
        const promptString = `Which tasks would you like to add to your note?` + (chosenTasks.length ? `
${chosenTasks.length} task${chosenTasks.length === 1 ? "" : "s"} will be inserted when you choose the "Done picking tasks" option` : "");
        const insertTask = await app.prompt(promptString, {
          inputs: [
            {
              label: "Choose tasks",
              options: promptOptions,
              type: "radio",
              value: promptOptions[0].value
            }
          ]
        });
        if (insertTask) {
          if (insertTask === "done") {
            break;
          } else if (insertTask === "more") {
            await addMoreTasks(plugin2, app, allowResponse, contentIndexText, chosenTasks, unchosenTasks);
          } else {
            chosenTasks.push(insertTask);
            unchosenTasks = unchosenTasks.filter((task) => !chosenTasks.includes(task));
          }
        } else {
          break;
        }
      }
    } else {
      app.alert("Could not determine any tasks to suggest from the existing note content");
      return null;
    }
    if (chosenTasks.length) {
      const taskArray = chosenTasks.map((task) => `- [ ] ${task}
`);
      console.debug("Replacing with tasks", taskArray);
      await app.context.replaceSelection(`
${taskArray.join("\n")}`);
    }
    return null;
  }
  async function addMoreTasks(plugin2, app, allowResponse, contentIndexText, chosenTasks, unchosenTasks) {
    const rejectedResponses = unchosenTasks;
    const moreTaskResponse = await notePromptResponse(
      plugin2,
      app,
      app.context.noteUUID,
      "suggestTasks",
      { chosenTasks },
      { allowResponse, contentIndexText, rejectedResponses }
    );
    const newTasks = moreTaskResponse && taskArrayFromResponse(moreTaskResponse);
    if (newTasks) {
      newTasks.forEach((t) => !unchosenTasks.includes(t) && !chosenTasks.includes(t) ? unchosenTasks.push(t) : null);
    }
  }
  function taskArrayFromResponse(response) {
    if (typeof response === "string") {
      return arrayFromResponseString(response);
    } else {
      let tasks = response.result || response.response?.result || response.input?.response?.result || response.input?.result;
      if (typeof tasks === "object" && !Array.isArray(tasks)) {
        tasks = Object.values(tasks);
        if (Array.isArray(tasks) && Array.isArray(tasks[0])) {
          tasks = tasks[0];
        }
      }
      if (!Array.isArray(tasks)) {
        console.error("Could not determine tasks from response", response);
        return [];
      }
      if (tasks.find((t) => typeof t !== "string")) {
        tasks = tasks.map((task) => {
          if (typeof task === "string") {
            return task;
          } else if (Array.isArray(task)) {
            return task[0];
          } else {
            const objectValues = Object.values(task);
            return objectValues[0];
          }
        });
      }
      if (tasks.length === 1 && tasks[0].includes("\n")) {
        tasks = tasks[0].split("\n");
      }
      const tasksWithoutPrefix = tasks.map((taskText) => optionWithoutPrefix(taskText));
      console.debug("Received tasks", tasksWithoutPrefix);
      return tasksWithoutPrefix;
    }
  }

  // lib/plugin.js
  var plugin = {
    // --------------------------------------------------------------------------------------
    constants: {
      labelApiKey: null,
      // Todo: Deprecate PROVIDER_SETTING_KEY_LABELS["openai"],
      labelAiModel: AI_MODEL_LABEL,
      pluginName: PLUGIN_NAME,
      requestTimeoutSeconds: 30
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
      [LOOK_UP_OLLAMA_MODEL_ACTION_LABEL]: async function(app) {
        const noOllamaString = `Unable to connect to Ollama. Ensure you stop the process if it is currently running, then start it with "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"`;
        try {
          const ollamaModels = await ollamaAvailableModels(this);
          if (ollamaModels?.length) {
            this.ollamaModelsFound = ollamaModels;
            app.alert(`Successfully connected to Ollama! Available models include: 

* ${this.ollamaModelsFound.join("\n* ")}`);
          } else {
            const json = await fetchJson(`${OLLAMA_URL}/api/tags`);
            if (Array.isArray(json?.models)) {
              app.alert("Successfully connected to Ollama, but could not find any running models. Try running 'ollama run mistral' in a terminal window?");
            } else {
              app.alert(noOllamaString);
            }
          }
        } catch (error) {
          app.alert(noOllamaString);
        }
      },
      // --------------------------------------------------------------------------
      "Show AI Usage by Model": async function(app) {
        const callCountByModel = this.callCountByModel;
        const callCountByModelText = Object.keys(callCountByModel).map((model) => `${model}: ${callCountByModel[model]}`).join("\n");
        const errorCountByModel = this.errorCountByModel;
        const errorCountByModelText = Object.keys(errorCountByModel).map((model) => `${model}: ${errorCountByModel[model]}`).join("\n");
        let alertText = `Since the app was last started on this platform:
${callCountByModelText}

`;
        if (errorCountByModelText.length) {
          alertText += `Errors:
` + errorCountByModelText;
        } else {
          alertText += `No errors reported.`;
        }
        await app.alert(alertText);
      },
      // --------------------------------------------------------------------------
      "Answer": async function(app) {
        let aiModels = await recommendedAiModels(this, app, "answer");
        const options = aiModels.map((model) => ({ label: model, value: model }));
        const [instruction, preferredModel] = await app.prompt(QUESTION_ANSWER_PROMPT, {
          inputs: [
            { type: "text", label: "Question", placeholder: "What's the meaning of life in 500 characters or less?" },
            {
              type: "radio",
              label: `AI Model${this.lastModelUsed ? `. Defaults to last used` : ""}`,
              options,
              value: this.lastModelUsed || aiModels?.at(0)
            }
          ]
        });
        console.debug("Instruction", instruction, "preferredModel", preferredModel);
        if (!instruction)
          return;
        if (preferredModel)
          aiModels = [preferredModel].concat(aiModels.filter((model) => model !== preferredModel));
        return await this._noteOptionResultPrompt(
          app,
          null,
          "answer",
          { instruction },
          { preferredModels: aiModels }
        );
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
      [IMAGE_FROM_PRECEDING_LABEL]: async function(app) {
        const apiKey = await apiKeyFromAppOrUser(this, app, "openai");
        if (apiKey) {
          await imageFromPreceding(this, app, apiKey);
        }
      },
      // --------------------------------------------------------------------------
      [IMAGE_FROM_PROMPT_LABEL]: async function(app) {
        const apiKey = await apiKeyFromAppOrUser(this, app, "openai");
        if (apiKey) {
          await imageFromPrompt(this, app, apiKey);
        }
      },
      // --------------------------------------------------------------------------
      [SUGGEST_TASKS_LABEL]: async function(app) {
        const contentIndexText = `${PLUGIN_NAME}: ${SUGGEST_TASKS_LABEL}`;
        return await taskArrayFromSuggestions(this, app, contentIndexText);
      }
    },
    // --------------------------------------------------------------------------
    // https://www.amplenote.com/help/developing_amplenote_plugins#noteOption
    noteOption: {
      // --------------------------------------------------------------------------
      "Revise": async function(app, noteUUID) {
        const instruction = await app.prompt("How should this note be revised?");
        if (!instruction)
          return;
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
      }
    },
    // --------------------------------------------------------------------------
    // https://www.amplenote.com/help/developing_amplenote_plugins#replaceText
    replaceText: {
      "Answer": {
        check(app, text) {
          return /(who|what|when|where|why|how)|\?/i.test(text);
        },
        async run(app, text) {
          const answerPicked = await notePromptResponse(
            this,
            app,
            app.context.noteUUID,
            "answerSelection",
            { text },
            { confirmInsert: true, contentIndexText: text }
          );
          if (answerPicked) {
            return `${text} ${answerPicked}`;
          }
        }
      },
      // --------------------------------------------------------------------------
      "Complete": async function(app, text) {
        const { response } = await sendQuery(this, app, app.context.noteUUID, "replaceTextComplete", { text: `${text}<token>` });
        if (response) {
          return `${text} ${response}`;
        }
      },
      // --------------------------------------------------------------------------
      "Revise": async function(app, text) {
        const instruction = await app.prompt("How should this text be revised?");
        if (!instruction)
          return null;
        return await notePromptResponse(
          this,
          app,
          app.context.noteUUID,
          "reviseText",
          { instruction, text }
        );
      },
      // --------------------------------------------------------------------------
      "Rhymes": {
        check(app, text) {
          return text.split(" ").length <= MAX_WORDS_TO_SHOW_RHYME;
        },
        async run(app, text) {
          return await this._wordReplacer(app, text, "rhyming");
        }
      },
      // --------------------------------------------------------------------------
      "Thesaurus": {
        check(app, text) {
          return text.split(" ").length <= MAX_WORDS_TO_SHOW_THESAURUS;
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
      let aiResponse = await notePromptResponse(
        this,
        app,
        noteUUID,
        promptKey,
        promptKeyParams,
        { preferredModels, confirmInsert: false }
      );
      if (aiResponse?.length) {
        const trimmedResponse = cleanTextFromAnswer(aiResponse);
        const options = [];
        if (noteUUID) {
          options.push(
            { label: "Insert at start (prepend)", value: "prepend" },
            { label: "Insert at end (append)", value: "append" },
            { label: "Replace", value: "replace" }
          );
        }
        options.push({ label: "Ask follow up question", value: "followup" });
        let valueSelected;
        if (options.length > 1) {
          valueSelected = await app.prompt(`${APP_OPTION_VALUE_USE_PROMPT}

${trimmedResponse || aiResponse}`, {
            inputs: [{ type: "radio", label: "Choose an action", options, value: options[0] }]
          });
        } else {
          valueSelected = await app.alert(trimmedResponse || aiResponse, { actions: [{ label: "Ask follow up questions" }] });
          if (valueSelected === 0)
            valueSelected = "followup";
        }
        console.debug("User picked", valueSelected, "for response", aiResponse);
        switch (valueSelected) {
          case "prepend":
            app.insertNoteContent({ uuid: noteUUID }, aiResponse);
            break;
          case "append":
            app.insertNoteContent({ uuid: noteUUID }, aiResponse, { atEnd: true });
            break;
          case "replace":
            app.replaceNoteContent({ uuid: noteUUID }, aiResponse);
            break;
          case "followup":
            const aiModel = this.lastModelUsed || (preferredModels?.length ? preferredModels[0] : null);
            const promptParams = await contentfulPromptParams(app, noteUUID, promptKey, promptKeyParams, aiModel);
            const systemUserMessages = promptsFromPromptKey(promptKey, promptParams, [], aiModel);
            const messages = systemUserMessages.concat({ role: "assistant", content: trimmedResponse });
            return await initiateChat(this, app, preferredModels?.length ? preferredModels : [aiModel], messages);
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
      if (contentIndex === -1)
        contentIndex = null;
      const allowResponse = (jsonResponse) => {
        return typeof jsonResponse === "object" && jsonResponse.result;
      };
      const response = await notePromptResponse(
        this,
        app,
        noteUUID,
        promptKey,
        { text },
        { allowResponse, contentIndex }
      );
      let options;
      if (response?.result) {
        options = arrayFromJumbleResponse(response.result);
        options = options.filter((option) => option !== text);
      } else {
        return null;
      }
      const optionList = options.map((word) => optionWithoutPrefix(word))?.map((word) => word.trim())?.filter((n) => n.length && n.split(" ").length <= MAX_REALISTIC_THESAURUS_RHYME_WORDS);
      if (optionList?.length) {
        console.debug("Presenting option list", optionList);
        const selectedValue = await app.prompt(`Choose a replacement for "${text}"`, {
          inputs: [{
            type: "radio",
            label: `${optionList.length} candidate${optionList.length === 1 ? "" : "s"} found`,
            options: optionList.map((option) => ({ label: option, value: option }))
          }]
        });
        if (selectedValue) {
          return selectedValue;
        }
      } else {
        const followUp = apiKeyFromApp(this, app, "openai")?.length ? "Consider adding an OpenAI API key to your plugin settings?" : "Try again?";
        app.alert(`Unable to get a usable response from available AI models. ${followUp}`);
      }
      return null;
    },
    // --------------------------------------------------------------------------
    async _completeText(app, promptKey) {
      const replaceToken = promptKey === "continue" ? `${PLUGIN_NAME}: Continue` : `${PLUGIN_NAME}: Complete`;
      const answer = await notePromptResponse(
        this,
        app,
        app.context.noteUUID,
        promptKey,
        {},
        { contentIndexText: replaceToken }
      );
      if (answer) {
        const trimmedAnswer = await trimNoteContentFromAnswer(app, answer, { replaceToken });
        console.debug("Inserting trimmed response text:", trimmedAnswer);
        return trimmedAnswer;
      } else {
        return null;
      }
    }
  };
  var plugin_default = plugin;
})();
