(() => {
  // lib/constants.js
  var KILOBYTE = 1024;
  var TOKEN_CHARACTERS = 4;
  var AI_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4')";
  var DEFAULT_CHARACTER_LIMIT = 12e3;
  var DEFAULT_OPENAI_MODEL = "gpt-4-1106-preview";
  var LOOK_UP_OLLAMA_MODEL_ACTION_LABEL = "Look up available Ollama models";
  var MAX_WORDS_TO_SHOW_RHYME = 4;
  var MAX_WORDS_TO_SHOW_THESAURUS = 4;
  var MAX_REALISTIC_THESAURUS_RHYME_WORDS = 4;
  var MIN_OPENAI_KEY_CHARACTERS = 50;
  var OLLAMA_URL = "http://localhost:11434";
  var OLLAMA_TOKEN_CHARACTER_LIMIT = 2e4;
  var OLLAMA_MODEL_PREFERENCES = [
    "mistral",
    "openhermes2.5-mistral",
    "llama2"
  ];
  var OPENAI_KEY_LABEL = "OpenAI API Key";
  var OPENAI_TOKEN_LIMITS = {
    "gpt-3.5": 4 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo": 4 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo-16k": 16 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo-1106": 16 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-3.5-turbo-instruct": 4 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4": 8 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-1106-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-32k": 32 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-32k-0613": 32 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-vision-preview": 128 * KILOBYTE * TOKEN_CHARACTERS
  };
  var PLUGIN_NAME = "AmpleAI";
  var REJECTED_RESPONSE_PREFIX = "The following responses were rejected:\n";
  function openAiTokenLimit(model) {
    return OPENAI_TOKEN_LIMITS[model];
  }
  function openAiModels() {
    return Object.keys(OPENAI_TOKEN_LIMITS);
  }

  // lib/prompt-api-params.js
  function isJsonEndpoint(promptKey) {
    return !!["rhyming", "thesaurus", "sortGroceriesJson"].find((key) => key === promptKey);
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
    if (["rhyming", "thesaurus"].find((key) => key === promptKey)) {
      return 2;
    } else if (["answer"].find((key) => key === promptKey)) {
      return 1;
    } else if (["revise", "sortGroceriesJson", "sortGroceriesText"].find((key) => key === promptKey)) {
      return -1;
    } else {
      return 0;
    }
  }

  // lib/fetch-json.js
  var streamTimeoutSeconds = 2;
  function shouldStream(plugin2) {
    return !plugin2.constants.isTestEnvironment;
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
  function extractJsonFromString(string) {
    const jsonStart = string.indexOf("{");
    if (jsonStart === -1)
      return null;
    const jsonAndAfter = string.substring(jsonStart).trim();
    let openBrackets = 0, jsonText = "";
    for (const char of jsonAndAfter) {
      jsonText += char;
      if (char === "{") {
        openBrackets += 1;
      } else if (char === "}") {
        openBrackets -= 1;
      }
      if (openBrackets === 0)
        break;
    }
    let json;
    try {
      json = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse jsonText", e);
      const reformattedText = jsonText.replaceAll(`""`, `"`);
      if (reformattedText !== jsonText) {
        try {
          json = JSON.parse(reformattedText);
        } catch (e2) {
          console.error("Reformatted text still fails", e2);
        }
      }
    }
    return json;
  }
  async function responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds = 30 } = {}) {
    const jsonResponseExpected = isJsonEndpoint(promptKey);
    let result;
    if (streamCallback) {
      result = await responseTextFromStreamResponse(app, response, model, jsonResponseExpected, streamCallback);
      app.alert(result, { scrollToEnd: true });
    } else {
      try {
        await Promise.race([
          new Promise(async (resolve, _) => {
            const jsonResponse = await response.json();
            result = jsonResponse?.choices?.at(0)?.message?.content || jsonResponse?.message?.content || jsonResponse?.response;
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
    if (jsonResponseExpected) {
      result = extractJsonFromString(result);
    }
    if (!allowResponse || allowResponse(result)) {
      return result;
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
  async function responseTextFromStreamResponse(app, response, aiModel, responseJsonExpected, streamCallback) {
    if (typeof global !== "undefined" && typeof global.fetch !== "undefined") {
      return await streamIsomorphicFetch(app, response, aiModel, responseJsonExpected, streamCallback);
    } else {
      return await streamWindowFetch(app, response, aiModel, responseJsonExpected, streamCallback);
    }
  }
  async function streamIsomorphicFetch(app, response, aiModel, responseJsonExpected, callback) {
    const responseBody = await response.body;
    let abort, content;
    await responseBody.on("readable", () => {
      let failLoops = 0;
      let receivedContent = "";
      while (failLoops < 3) {
        const chunk = responseBody.read();
        if (chunk) {
          failLoops = 0;
          const decoded = chunk.toString();
          const responseObject = callback(app, decoded, receivedContent, aiModel, responseJsonExpected);
          console.debug("responseObject content", responseObject?.receivedContent);
          ({ abort, receivedContent } = responseObject);
          if (receivedContent)
            content = receivedContent;
          if (abort)
            break;
        } else {
          failLoops += 1;
        }
      }
    });
    return content;
  }
  async function streamWindowFetch(app, response, aiModel, responseJsonExpected, callback) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let error, abort;
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
            const response2 = callback(app, decodedValue, receivedContent, aiModel, responseJsonExpected);
            if (response2) {
              ({ abort, receivedContent } = response2);
              if (abort)
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
  async function callOllama(plugin2, app, model, messages, promptKey, allowResponse) {
    const stream = shouldStream(plugin2);
    const jsonEndpoint = isJsonEndpoint(promptKey);
    let response;
    const streamCallback = stream ? streamAccumulate : null;
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
    return await fetchJson(`${OLLAMA_URL}/api/tags`).then((json) => {
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
      } else if (Array.isArray(json?.models) && alertOnEmptyApp) {
        alertOnEmptyApp.alert("Ollama is running but no LLMs are reported as available. Have you Run 'ollama run llama2' yet?");
      } else {
        return null;
      }
    }).catch((error) => {
      console.log("Error trying to fetch Ollama versions: ", error, "Are you sure Ollama was started with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
    });
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
  function streamAccumulate(app, decodedValue, receivedContent, aiModel, jsonResponseExpected) {
    let jsonResponse, content = "";
    const responses = decodedValue.replace(/}\n\{/g, "} \n{").split(" \n");
    for (const response in responses) {
      try {
        jsonResponse = JSON.parse(decodedValue.trim());
      } catch (e) {
        console.debug("Failed to parse JSON from", decodedValue, "with error", e, "Received content so far is", receivedContent);
        return { receivedContent };
      }
      const responseContent = jsonResponse?.message?.content || jsonResponse?.response;
      if (responseContent) {
        content += responseContent;
      } else {
        console.debug("No response content found in decodedValue response", decodedValue);
      }
    }
    if (content) {
      receivedContent += content;
      const userSelection = app.alert(receivedContent, {
        actions: [{ icon: "pending", label: "Generating response" }],
        preface: `${aiModel} is generating ${jsonResponseExpected ? "JSON " : ""}response...`,
        scrollToEnd: true
      });
      if (userSelection === 0) {
        console.error("User chose to abort stream. Todo: return abort here?");
      }
    }
    return { abort: jsonResponse.done, receivedContent };
  }

  // lib/fetch-openai.js
  async function callOpenAI(plugin2, app, model, messages, promptKey, allowResponse) {
    model = model?.trim()?.length ? model : DEFAULT_OPENAI_MODEL;
    const streamCallback = shouldStream(plugin2) ? streamAccumulate2 : null;
    try {
      return await requestWithRetry(
        app,
        model,
        messages,
        apiKeyFromApp(plugin2, app),
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
  function apiKeyFromApp(plugin2, app) {
    if (app.settings[plugin2.constants.labelApiKey]) {
      return app.settings[plugin2.constants.labelApiKey].trim();
    } else if (app.settings["API Key"]) {
      const deprecatedKey = app.settings["API Key"].trim();
      app.setSetting(plugin2.constants.labelApiKey, deprecatedKey);
      return deprecatedKey;
    } else {
      if (plugin2.constants.isTestEnvironment) {
        throw new Error(`Couldnt find an OpenAI key in ${plugin2.constants.labelApiKey}`);
      } else {
        app.alert("Please configure your OpenAI key in plugin settings.");
      }
      return null;
    }
  }
  async function requestWithRetry(app, model, messages, apiKey, promptKey, streamCallback, allowResponse, {
    retries = 3,
    timeoutSeconds = 30
  } = {}) {
    let error, response;
    if (!apiKey?.length) {
      app.alert("Please configure your OpenAI key in plugin settings.");
      return null;
    }
    const jsonResponseExpected = isJsonEndpoint(promptKey);
    for (let i = 0; i < retries; i++) {
      try {
        const body = { model, messages, stream: !!streamCallback };
        body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
        if (jsonResponseExpected && model.includes("gpt-4"))
          body.response_format = { type: "json_object" };
        console.debug("Sending OpenAI", body, "query at", /* @__PURE__ */ new Date());
        response = await Promise.race([
          fetch("https://api.openai.com/v1/chat/completions", {
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
  function streamAccumulate2(app, decodedValue, receivedContent, aiModel, jsonResponseExpected) {
    let stop = false;
    const responses = decodedValue.split(/^data: /m).filter((s) => s.trim().length);
    for (const jsonString of responses) {
      if (jsonString.includes("[DONE]")) {
        stop = true;
        break;
      }
      const jsonStart = jsonString.indexOf("{");
      const json = JSON.parse(jsonString.substring(jsonStart).trim());
      const content = json?.choices?.[0]?.delta?.content;
      if (content) {
        receivedContent += content;
        app.alert(receivedContent, {
          actions: [{ icon: "pending", label: "Generating response" }],
          preface: `${aiModel} is generating ${jsonResponseExpected ? "JSON " : ""}response...`,
          scrollToEnd: true
        });
      } else {
        stop = !!json?.finish_reason?.length || !!json?.choices?.[0]?.finish_reason?.length;
        break;
      }
    }
    return { abort: stop, receivedContent };
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
  function cleanTextFromAnswer(answer) {
    return answer.split("\n").filter((line) => !/^(~~~|```(markdown)?)$/.test(line.trim())).join("\n");
  }

  // lib/prompts.js
  function promptsFromPromptKey(promptKey, promptParams, contentIndex, rejectedResponses, aiModel, inputLimit = DEFAULT_CHARACTER_LIMIT) {
    let messages = [];
    messages.push({ role: "system", content: systemPromptFromPromptKey(promptKey) });
    const userPrompt = userPromptFromPromptKey(promptKey, promptParams, contentIndex, aiModel, inputLimit);
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
    summarize: "You are a helpful assistant that summarizes notes that are markdown-formatted.",
    thesaurus: "You are a helpful thesaurus that responds in JSON with an array of alternate word choices that fit the context provided"
  };
  function userPromptFromPromptKey(promptKey, promptParams, contentIndex, aiModel, inputLimit) {
    const { noteContent } = promptParams;
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
    let userPrompts;
    if (["continue", "insertTextComplete", "replaceTextComplete"].find((key) => key === promptKey)) {
      let tokenAndSurroundingContent;
      if (promptKey === "replaceTextComplete") {
        tokenAndSurroundingContent = promptParams.text;
      } else {
        const replaceToken = promptKey === "insertTextComplete" ? `${PLUGIN_NAME}: Complete` : `${PLUGIN_NAME}: Continue`;
        if (!boundedContent.includes(replaceToken) && noteContent.includes(replaceToken)) {
          contentIndex = noteContent.indexOf(replaceToken);
          console.debug("Couldn't find", replaceToken, "in", boundedContent, "so truncating to", relevantContentFromContent(noteContent, contentIndex, noteContentCharacterLimit), "given", noteContentCharacterLimit);
          boundedContent = relevantContentFromContent(noteContent, contentIndex, noteContentCharacterLimit);
        }
        console.debug("Note content", noteContent, "bounded content", boundedContent, "replace token", replaceToken, "content index", contentIndex, "with noteContentCharacterLimit", noteContentCharacterLimit);
        tokenAndSurroundingContent = `~~~
${boundedContent.replace(`{${replaceToken}}`, "<replaceToken>")}
~~~`;
      }
      userPrompts = [
        `Respond with text that will replace <replaceToken> in the following input markdown document, delimited by ~~~:`,
        tokenAndSurroundingContent,
        `Your response should be grammatically correct and not repeat the markdown document. DO NOT explain your answer.`,
        `Most importantly, DO NOT respond with <replaceToken> itself and DO NOT repeat word sequences from the markdown document. BE CONCISE.`
      ];
    } else {
      userPrompts = messageArrayFromPrompt(promptKey, { ...promptParams, noteContent: boundedContent });
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
  function messageArrayFromPrompt(promptKey, promptParams) {
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

  // lib/prompt-strings.js
  var APP_OPTION_VALUE_USE_PROMPT = "What would you like to do with this result?";
  var NO_MODEL_FOUND_TEXT = `Could not find an available AI to call. Do you want to install and utilize Ollama, or would you prefer using OpenAI?<br><br>For casual-to-intermediate users, we recommend using OpenAI.`;
  var OLLAMA_INSTALL_TEXT = `Rough installation instructions:<br>1. Download Ollama: https://ollama.ai/download<br>2. Install Ollama<br>3. Install one or more LLMs that will fit within the RAM your computer (examples at https://github.com/jmorganca/ollama)<br>4. Ensure that Ollama isn't already running, then start it in the console using "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"<br>You can test whether Ollama is running by invoking Quick Open and running the "${LOOK_UP_OLLAMA_MODEL_ACTION_LABEL}" action`;
  var OPENAI_API_KEY_TEXT = `Paste your OpenAI API key in the field below.<br><br> Once you have an OpenAI account, get your key here: https://platform.openai.com/account/api-keys`;
  var QUESTION_ANSWER_PROMPT = "What would you like to know?";

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
    let noteContent = "";
    if (noteUUID) {
      const note = await app.notes.find(noteUUID);
      noteContent = await note.content();
    }
    preferredModels = preferredModels || await recommendedAiModels(plugin2, app, promptKey);
    if (!preferredModels.length)
      return;
    if (!Number.isInteger(contentIndex) && contentIndexText && noteContent) {
      contentIndex = contentIndexFromParams(contentIndexText, noteContent);
    }
    const startAt = /* @__PURE__ */ new Date();
    const { response, modelUsed } = await sendQuery(
      plugin2,
      app,
      promptKey,
      { ...promptParams, noteContent },
      { allowResponse, contentIndex, preferredModels, rejectedResponses }
    );
    if (response === null) {
      console.error("No result was returned from sendQuery with models", preferredModels);
      return;
    }
    if (confirmInsert) {
      const actions = [];
      preferredModels.forEach((model) => {
        const modelLabel = model.split(":")[0];
        actions.push({ icon: "settings", label: `Try ${modelLabel}${preferredModels.length <= 2 && model === modelUsed ? " again" : ""}` });
      });
      const primaryAction = { icon: "post_add", label: "Accept" };
      let responseAsText = response, jsonResponse = false;
      if (typeof response === "object") {
        jsonResponse = true;
        responseAsText = JSON.stringify(response);
      }
      const selectedValue = await app.alert(responseAsText, { actions, preface: `${jsonResponse ? "JSON response s" : "S"}uggested by ${modelUsed}
Will be parsed & applied after your preliminary approval`, primaryAction });
      console.debug("User chose", selectedValue, "from", actions);
      if (selectedValue === -1) {
        return response;
      } else if (preferredModels[selectedValue]) {
        const preferredModel = preferredModels[selectedValue];
        const updatedRejects = rejectedResponses || [];
        updatedRejects.push(response);
        preferredModels = [preferredModel, ...preferredModels.filter((model) => model !== preferredModel)];
        console.debug("User chose to try", preferredModel, "next so preferred models are", preferredModels);
        const options = { confirmInsert, contentIndex, preferredModels, rejectedResponses: updatedRejects };
        return await notePromptResponse(plugin2, app, noteUUID, promptKey, promptParams, options);
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
    if (plugin2.lastModelUsed) {
      candidateAiModels.push(plugin2.lastModelUsed);
    }
    if (!plugin2.noFallbackModels) {
      const ollamaModels = plugin2.ollamaModelsFound || await ollamaAvailableModels(plugin2, app);
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
  async function sendQuery(plugin2, app, promptKey, promptParams, {
    contentIndex = null,
    preferredModels = null,
    rejectedResponses = null,
    allowResponse = null
  } = {}) {
    preferredModels = (preferredModels || await recommendedAiModels(plugin2, app, promptKey)).filter((n) => n);
    console.debug("Starting to query", promptKey, "with preferredModels", preferredModels);
    for (const aiModel of preferredModels) {
      const inputLimit = isModelOllama(aiModel) ? OLLAMA_TOKEN_CHARACTER_LIMIT : openAiTokenLimit(aiModel);
      const suppressExample = tooDumbForExample(aiModel);
      const messages = promptsFromPromptKey(promptKey, { ...promptParams, suppressExample }, contentIndex, rejectedResponses, aiModel, inputLimit);
      let response;
      plugin2.callCountByModel[aiModel] = (plugin2.callCountByModel[aiModel] || 0) + 1;
      plugin2.lastModelUsed = aiModel;
      try {
        response = await responseFromPrompts(plugin2, app, aiModel, promptKey, messages, { allowResponse });
      } catch (e) {
        console.error("Caught exception trying to make call with", aiModel, e);
      }
      if (response && (!allowResponse || allowResponse(response))) {
        return { response, modelUsed: aiModel };
      } else {
        plugin2.errorCountByModel[aiModel] = (plugin2.errorCountByModel[aiModel] || 0) + 1;
        console.error("Failed to make call with", aiModel, "response", response, "while messages are", messages);
      }
    }
    return { response: null, modelUsed: null };
  }
  function responseFromPrompts(plugin2, app, aiModel, promptKey, messages, { allowResponse = null } = {}) {
    if (isModelOllama(aiModel)) {
      return callOllama(plugin2, app, aiModel, messages, promptKey, allowResponse);
    } else {
      return callOpenAI(plugin2, app, aiModel, messages, promptKey, allowResponse);
    }
  }
  function includingFallbackModels(plugin2, app, candidateAiModels) {
    if (app.settings[OPENAI_KEY_LABEL]?.length && !candidateAiModels.find((m) => m === DEFAULT_OPENAI_MODEL)) {
      candidateAiModels = candidateAiModels.concat(DEFAULT_OPENAI_MODEL);
    } else if (!app.settings[OPENAI_KEY_LABEL]?.length) {
      console.error("No OpenAI key found in", OPENAI_KEY_LABEL, "setting");
    } else if (candidateAiModels.find((m) => m === DEFAULT_OPENAI_MODEL)) {
      console.debug("Already an OpenAI model among candidates,", candidateAiModels.find((m) => m === DEFAULT_OPENAI_MODEL));
    }
    if (plugin2.ollamaModelsFound?.length) {
      candidateAiModels = candidateAiModels.concat(plugin2.ollamaModelsFound.filter((m) => !candidateAiModels.includes(m)));
    }
    console.debug("Ended with", candidateAiModels);
    return candidateAiModels;
  }
  function isModelOllama(model) {
    return !openAiModels().includes(model);
  }
  async function aiModelFromUserIntervention(plugin2, app) {
    const optionSelected = await app.prompt(NO_MODEL_FOUND_TEXT, {
      inputs: [
        {
          type: "radio",
          label: "Which model would you prefer to use?",
          options: [
            { label: "OpenAI (best for most casual-to-intermediate users)", value: "openai" },
            { label: "Ollama (best for people who want high customization, or a free option)", value: "ollama" }
          ]
        }
      ]
    });
    if (optionSelected === "openai") {
      const openaiKey = await app.prompt(OPENAI_API_KEY_TEXT);
      if (openaiKey.length >= MIN_OPENAI_KEY_CHARACTERS) {
        app.setSetting(plugin2.constants.labelApiKey, openaiKey);
        await app.alert(`An OpenAI was successfully stored. The default OpenAI model, "${DEFAULT_OPENAI_MODEL}", will be used for future AI lookups.`);
        return [DEFAULT_OPENAI_MODEL];
      } else {
        app.alert("That doesn't seem to be a valid OpenAI API key. You can enter one later in the settings for this plugin, or you can install Ollama.");
        return null;
      }
    } else {
      app.alert(OLLAMA_INSTALL_TEXT);
      return null;
    }
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

  // lib/functions/chat.js
  async function initiateChat(plugin2, app, aiModels, messageHistory = []) {
    let promptHistory;
    if (messageHistory.length) {
      promptHistory = messageHistory;
    } else {
      promptHistory = [{ message: "What's on your mind?", role: "assistant" }];
    }
    while (true) {
      const conversation = promptHistory.map((chat) => `${chat.role}: ${chat.message}`).join("\n\n");
      const [userMessage, modelToUse] = await app.prompt(conversation, {
        inputs: [
          { type: "text", label: "Message to send" },
          {
            type: "radio",
            label: "Send to",
            options: aiModels.map((model) => ({ label: model, value: model })),
            value: plugin2.lastModelUsed
          }
        ]
      }, { scrollToBottom: true });
      if (modelToUse) {
        promptHistory.push({ role: "user", message: userMessage });
        const response = await responseFromPrompts(plugin2, app, modelToUse, "chat", promptHistory);
        if (response) {
          promptHistory.push({ role: "assistant", message: `[${modelToUse}] ${response}` });
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
    const groceryArray = groceryLines.map((line) => line.replace(/^[-*\[\]\s]+/g, "").replace(/<!--.*-->/g, "").trim());
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

  // lib/plugin.js
  var plugin = {
    // --------------------------------------------------------------------------------------
    constants: {
      labelApiKey: OPENAI_KEY_LABEL,
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
        await fetchJson(`${OLLAMA_URL}/api/tags`).then((json) => {
          if (json?.models?.length) {
            this.ollamaModelsFound = json.models.map((m) => m.name);
            app.alert(`Successfully connected to Ollama! Available models include: ${this.ollamaModelsFound.join(",")}`);
          } else if (Array.isArray(json?.models)) {
            app.alert("Successfully connected to Ollama, but could not find any running models. Try running 'ollama run llama2' in a terminal window?");
          }
        }).catch((error) => {
          app.alert("Unable to connect to Ollama. Ensure you stop the process if it is currently running, then start it with 'OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve'");
        });
      },
      // --------------------------------------------------------------------------
      "Show AI Usage by Model": async function(app) {
        const callCountByModel = this.callCountByModel;
        const callCountByModelText = Object.keys(callCountByModel).map((model) => `${model}: ${callCountByModel[model]}`).join("\n");
        const errorCountByModel = this.errorCountByModel;
        const errorCountByModelText = Object.keys(errorCountByModel).map((model) => `${model}: ${errorCountByModel[model]}`).join("\n");
        await app.alert(`Since the app was last started on this platform:
` + callCountByModelText + "\n\nError counts:\n" + errorCountByModelText);
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
        const { response } = await sendQuery(this, app, "replaceTextComplete", { text: `${text}<token>` });
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
    async _noteOptionResultPrompt(app, noteUUID, promptKey, promptParams, { preferredModels = null } = {}) {
      let aiResponse = await notePromptResponse(
        this,
        app,
        noteUUID,
        promptKey,
        promptParams,
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
            const messages = [
              { role: "user", message: promptParams.instruction },
              { role: "assistant", message: trimmedResponse }
            ];
            return await initiateChat(this, app, preferredModels, messages);
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
      const response = await notePromptResponse(
        this,
        app,
        noteUUID,
        promptKey,
        { text },
        { contentIndex }
      );
      let options;
      if (response?.result) {
        options = arrayFromJumbleResponse(response.result);
        options = options.filter((option) => option !== text);
      } else {
        return null;
      }
      const optionList = options.map((word) => word.replace(/^[\d\-]+\.?[\s]?/g, ""))?.map((word) => word.trim())?.filter((n) => n.length && n.split(" ").length <= MAX_REALISTIC_THESAURUS_RHYME_WORDS);
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
