(() => {
  // lib/app-util.js
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
  function cleanTextFromAnswer(answer) {
    return answer.split("\n").filter((line) => !/^(~~~|```(markdown)?)$/.test(line.trim())).join("\n");
  }
  function debugData(noteHandleOrSearchCandidate) {
    const isNoteHandle = "keywordDensityEstimate" in noteHandleOrSearchCandidate;
    const contentAttr = isNoteHandle ? "content" : "bodyContent";
    return Object.fromEntries(["name", "keywordDensityEstimate", "preContentMatchScore", "tags", contentAttr].map((k) => {
      const value = noteHandleOrSearchCandidate[k];
      if (!value || Array.isArray(value) && !value.length) {
        return null;
      } else if (typeof value === "string" && value.length > 100) {
        return [k, `${value.slice(0, 100)}...`];
      } else if (Number.isFinite(value)) {
        return [k, Math.round(10 * value) / 10];
      } else {
        return [k, value];
      }
    }).filter(Boolean));
  }
  function jsonFromAiText(jsonText) {
    let json;
    const trimmed = jsonText.trim();
    let arrayStart = trimmed.indexOf("[");
    let objectStart = trimmed.indexOf("{");
    const hasClosingBrace = trimmed.includes("}");
    const hasClosingBracket = trimmed.includes("]");
    let isArray = false;
    let jsonStart = -1;
    if (hasClosingBrace && objectStart === -1) {
      jsonText = `{${jsonText}`;
      objectStart = 0;
    }
    if (hasClosingBracket && arrayStart === -1) {
      jsonText = `[${jsonText}`;
      arrayStart = 0;
    }
    arrayStart = jsonText.indexOf("[");
    objectStart = jsonText.indexOf("{");
    if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
      isArray = true;
      jsonStart = arrayStart;
    } else if (objectStart !== -1) {
      isArray = false;
      jsonStart = objectStart;
    } else {
      jsonText = `{${jsonText}}`;
      jsonStart = 0;
      isArray = false;
    }
    const endChar = isArray ? "]" : "}";
    let jsonEnd = jsonText.lastIndexOf(endChar);
    if (jsonEnd === -1) {
      if (jsonText[jsonText.length - 1] === ",")
        jsonText = jsonText.substring(0, jsonText.length - 1);
      const missingArrayClose = jsonText.includes("[") && !jsonText.includes("]");
      const missingObjectClose = jsonText.includes("{") && !jsonText.includes("}");
      if (missingArrayClose && missingObjectClose) {
        jsonText += "}]";
      } else if (missingArrayClose) {
        jsonText += "]";
      } else if (missingObjectClose) {
        jsonText += "}";
      } else {
        jsonText = isArray ? `${jsonText}]` : `${jsonText}}`;
      }
    } else {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }
    try {
      json = JSON.parse(jsonText);
      return json;
    } catch (e) {
      const parseTextWas = jsonText;
      jsonText = balancedJsonFromString(jsonText);
      console.error(`Failed to parse jsonText START:
${parseTextWas}
END
 due to ${e}. Attempted rebalance yielded: ${jsonText} (original size ${parseTextWas.length || "(null)"}, rebalance size ${jsonText?.length || "(0)"})`);
      try {
        json = JSON.parse(jsonText);
        return json;
      } catch (e2) {
        console.error("Rebalanced jsonText still fails", e2);
      }
      let reformattedText = jsonText.replace(/"""/g, `"\\""`).replace(/"\n/g, `"\\n`);
      reformattedText = reformattedText.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1"$2":');
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
  function noteUrlFromUUID(noteUUID) {
    return `https://www.amplenote.com/notes/${noteUUID}`;
  }
  function optionWithoutPrefix(option) {
    if (!option)
      return option;
    const withoutStarAndNumber = option.trim().replace(/^[\-*\d.]+\s+/, "");
    const withoutCheckbox = withoutStarAndNumber.replace(/^-?\s*\[\s*]\s+/, "");
    return withoutCheckbox;
  }
  function pluralize(number, noun) {
    const numValue = typeof number === "string" ? parseFloat(number) : number;
    if (!Number.isInteger(numValue) && !Number.isFinite(numValue)) {
      throw new Error("pluralize() requires an integer to be given");
    }
    const numberPart = numValue.toLocaleString();
    return `${numberPart} ${noun}${parseInt(numValue) === 1 ? "" : "s"}`;
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
            console.error("LLM response seems to have returned content after prompt. Truncating");
            refinedAnswer = refinedAnswer.substring(0, afterSentenceIndex);
          }
        }
      }
    }
    const originalLines = noteContent.split("\n").map((w) => w.trim());
    const withoutOriginalLines = refinedAnswer.split("\n").filter((line) => !originalLines.includes(line.trim())).join("\n");
    const withoutJunkLines = cleanTextFromAnswer(withoutOriginalLines);
    console.debug(`Answer originally ${answer.length} length, refined answer length ${refinedAnswer.length} ("${refinedAnswer}"). Without repeated lines ${withoutJunkLines.length} length`);
    return withoutJunkLines.trim();
  }
  function truncate(text, limit) {
    return text.length > limit ? text.slice(0, limit) : text;
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

  // lib/constants/functionality.js
  var MAX_WORDS_TO_SHOW_RHYME = 4;
  var MAX_WORDS_TO_SHOW_THESAURUS = 4;
  var MAX_REALISTIC_THESAURUS_RHYME_WORDS = 4;
  var REJECTED_RESPONSE_PREFIX = "The following responses were rejected:\n";

  // lib/constants/units.js
  var KILOBYTE = 1024;
  var TOKEN_CHARACTERS = 4;

  // lib/constants/provider.js
  var DALL_E_DEFAULT = "1024x1024~dall-e-3";
  var DEFAULT_MODEL_TOKEN_LIMIT = 50 * KILOBYTE * TOKEN_CHARACTERS;
  var LOOK_UP_OLLAMA_MODEL_ACTION_LABEL = "Look up available Ollama models";
  var MIN_API_KEY_CHARACTERS = {
    anthropic: 80,
    // sk-ant-api03- prefix + long string
    deepseek: 40,
    // Standard API key length
    gemini: 30,
    // AIza prefix + ~35 chars
    grok: 40,
    // xai- prefix + ~48 chars
    openai: 50,
    // sk- prefix + ~48 chars
    perplexity: 40
    // pplx- prefix + ~44 chars
  };
  var OLLAMA_URL = "http://localhost:11434";
  var OLLAMA_TOKEN_CHARACTER_LIMIT = 2e4;
  var OLLAMA_MODEL_PREFERENCES = [
    "mistral",
    "openhermes2.5-mistral",
    "llama2"
  ];
  var PROVIDER_API_KEY_RETRIEVE_URL = {
    anthropic: "https://console.anthropic.com/settings/keys",
    deepseek: "https://platform.deepseek.com/api_keys",
    gemini: "https://aistudio.google.com/app/api-keys",
    grok: "https://console.x.ai/team/default/api-keys",
    // Originally Claude thought it https://x.com/settings/grok/api-keys"
    openai: "https://platform.openai.com/api-keys",
    // https://platform.openai.com/docs/api-reference/authentication
    perplexity: "https://www.perplexity.ai/account/api/keys"
  };
  var PROVIDER_DEFAULT_MODEL = {
    anthropic: "claude-sonnet-4-5",
    deepseek: "deepseek-chat",
    gemini: "gemini-3-pro-preview",
    grok: "grok-4-1-fast",
    openai: "gpt-5.2",
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
  var REMOTE_AI_PROVIDER_EMS = Object.keys(PROVIDER_ENDPOINTS);
  var ANTHROPIC_TOKEN_LIMITS = {
    // Latest models (Claude 4.5 family)
    "claude-sonnet-4-5": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-sonnet-4-5-20250929": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-haiku-4-5": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-haiku-4-5-20251001": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-opus-4-5": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-opus-4-5-20251101": 200 * KILOBYTE * TOKEN_CHARACTERS,
    // Legacy models (Claude 4 family)
    "claude-opus-4-1": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-opus-4-1-20250805": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-sonnet-4-0": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-sonnet-4-20250514": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-3-7-sonnet-latest": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-3-7-sonnet-20250219": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-opus-4-0": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-opus-4-20250514": 200 * KILOBYTE * TOKEN_CHARACTERS,
    // Legacy models (Claude 3.5 family)
    "claude-3-5-haiku-latest": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-3-5-haiku-20241022": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "claude-3-5-sonnet-latest": 200 * KILOBYTE * TOKEN_CHARACTERS,
    // Legacy models (Claude 3 family)
    "claude-3-haiku-20240307": 200 * KILOBYTE * TOKEN_CHARACTERS
  };
  var DEEPSEEK_TOKEN_LIMITS = {
    "deepseek-chat": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "deepseek-reasoner": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "deepseek-r1": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "deepseek-r1-0528": 64 * KILOBYTE * TOKEN_CHARACTERS
  };
  var GEMINI_TOKEN_LIMITS = {
    // Gemini 3 family
    "gemini-3-flash": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-3-flash-preview": 64 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-3-pro": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-3-pro-preview": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-3-pro-image-preview": 64 * KILOBYTE * TOKEN_CHARACTERS,
    // Gemini 2.5 family
    "gemini-2.5-pro": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.5-flash": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.5-flash-lite": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.5-flash-lite-preview-06-17": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    // Gemini 2.0 family
    "gemini-2.0-flash": 1024 * KILOBYTE * TOKEN_CHARACTERS,
    "gemini-2.0-flash-lite": 1024 * KILOBYTE * TOKEN_CHARACTERS
  };
  var GROK_TOKEN_LIMITS = {
    "grok-4-1-fast": 2048 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-4-fast": 2048 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-4": 256 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-4-0709": 256 * KILOBYTE * TOKEN_CHARACTERS,
    // Grok 3 family
    "grok-3": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-3-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-3-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-3-mini-beta": 128 * KILOBYTE * TOKEN_CHARACTERS,
    // Grok 2 family
    "grok-2-vision-1212": 8 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-2-image-1212": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "grok-2-1212": 128 * KILOBYTE * TOKEN_CHARACTERS
  };
  var OPENAI_TOKEN_LIMITS = {
    "gpt-5.2": 400 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-5.1": 400 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-5.1-codex-max": 400 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-5": 400 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-5-fast": 400 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-5-thinking": 400 * KILOBYTE * TOKEN_CHARACTERS,
    // GPT-4.1 family
    "gpt-4.1": 1e3 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4.1-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
    // GPT-4o family
    "gpt-4o": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4o-mini": 128 * KILOBYTE * TOKEN_CHARACTERS,
    // O-series models
    "o3": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "o3-mini": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "o3-pro": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "o4-mini": 200 * KILOBYTE * TOKEN_CHARACTERS,
    // Legacy GPT-4 models
    "gpt-4": 8 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-1106-preview": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-32k": 32 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-32k-0613": 32 * KILOBYTE * TOKEN_CHARACTERS,
    "gpt-4-vision-preview": 128 * KILOBYTE * TOKEN_CHARACTERS
  };
  var PERPLEXITY_TOKEN_LIMITS = {
    "sonar-pro": 200 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar-reasoning-pro": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar-reasoning": 128 * KILOBYTE * TOKEN_CHARACTERS,
    "sonar-deep-research": 128 * KILOBYTE * TOKEN_CHARACTERS
  };
  var MODEL_TOKEN_LIMITS = {
    ...ANTHROPIC_TOKEN_LIMITS,
    ...DEEPSEEK_TOKEN_LIMITS,
    ...GEMINI_TOKEN_LIMITS,
    ...GROK_TOKEN_LIMITS,
    ...OPENAI_TOKEN_LIMITS
    // ...PERPLEXITY_TOKEN_LIMITS,
  };
  var MODELS_PER_PROVIDER = {
    anthropic: Object.keys(ANTHROPIC_TOKEN_LIMITS),
    deepseek: Object.keys(DEEPSEEK_TOKEN_LIMITS),
    gemini: Object.keys(GEMINI_TOKEN_LIMITS),
    grok: Object.keys(GROK_TOKEN_LIMITS),
    openai: Object.keys(OPENAI_TOKEN_LIMITS)
    // perplexity: Object.keys(PERPLEXITY_TOKEN_LIMITS),
  };

  // lib/constants/prompt-strings.js
  var APP_OPTION_VALUE_USE_PROMPT = "What would you like to do with this result?";
  var IMAGE_GENERATION_PROMPT = "What would you like to generate an image of?";
  var NO_MODEL_FOUND_TEXT = `No AI provider has been to setup.

For casual-to-intermediate users, we recommend using OpenAI, Anthropic and Gemini, since all offers high quality results. OpenAI can generate images.`;
  var OLLAMA_INSTALL_TEXT = `Rough installation instructions:
1. Download Ollama: https://ollama.ai/download
2. Install Ollama
3. Install one or more LLMs that will fit within the RAM your computer (examples at https://github.com/jmorganca/ollama)
4. Ensure that Ollama isn't already running, then start it in the console using "OLLAMA_ORIGINS=https://plugins.amplenote.com ollama serve"
You can test whether Ollama is running by invoking Quick Open and running the "${LOOK_UP_OLLAMA_MODEL_ACTION_LABEL}" action`;
  var OPENAI_API_KEY_URL = "https://platform.openai.com/account/api-keys";
  var OPENAI_API_KEY_TEXT = `Paste your LLM API key in the field below.

Once you have an OpenAI account, get your key here: ${OPENAI_API_KEY_URL}`;
  var PROVIDER_INVALID_KEY_TEXT = "That doesn't seem to be a valid API key. You can enter one later in the settings for this plugin.";
  var QUESTION_ANSWER_PROMPT = "What would you like to know?";
  var PROVIDER_API_KEY_TEXT = {
    anthropic: `Paste your Anthropic API key in the field below.

Your API key should start with "sk-ant-api03-". Get your key here:
${PROVIDER_API_KEY_RETRIEVE_URL.anthropic}`,
    deepseek: `Paste your DeepSeek API key in the field below.

Sign up for a DeepSeek account and get your API key here:
${PROVIDER_API_KEY_RETRIEVE_URL.deepseek}`,
    gemini: `Paste your Gemini API key in the field below.

Your API key should start with "AIza". Get your key from Google AI Studio:
${PROVIDER_API_KEY_RETRIEVE_URL.gemini}`,
    grok: `Paste your Grok API key in the field below.

Your API key should start with "xai-". Get your key from the xAI console:
${PROVIDER_API_KEY_RETRIEVE_URL.grok}`,
    openai: `Paste your OpenAI API key in the field below.

Your API key should start with "sk-". Get your key here:
${PROVIDER_API_KEY_RETRIEVE_URL.openai}`,
    perplexity: `Paste your Perplexity API key in the field below.

Your API key should start with "pplx-". Get your key here:
${PROVIDER_API_KEY_RETRIEVE_URL.perplexity}`
  };

  // lib/constants/search-settings.js
  var ATTEMPT_FIRST_PASS = "first_pass";
  var ATTEMPT_INDIVIDUAL = "individual";
  var ATTEMPT_STRATEGIES = [ATTEMPT_FIRST_PASS, ATTEMPT_INDIVIDUAL];
  var DEFAULT_SEARCH_NOTES_RETURNED = 10;
  var KEYWORD_BODY_PRIMARY_WEIGHT = 1;
  var KEYWORD_BODY_SECONDARY_WEIGHT = 0.5;
  var KEYWORD_DENSITY_DIVISOR = 500;
  var KEYWORD_TAG_PRIMARY_WEIGHT = 1;
  var KEYWORD_TAG_SECONDARY_WEIGHT = 0.5;
  var KEYWORD_TITLE_PRIMARY_WEIGHT = 5;
  var KEYWORD_TITLE_SECONDARY_WEIGHT = 2;
  var MAX_CANDIDATES_FOR_DENSITY_CALCULATION = 100;
  var MAX_PHASE4_TIMEOUT_RETRIES = 3;
  var MAX_CHARACTERS_TO_SEARCH_BODY = 4e3;
  var MAX_NOTES_PER_QUERY = 100;
  var MAX_CANDIDATES_PER_KEYWORD = 30;
  var MAX_DEEP_ANALYZED_NOTES = 30;
  var MAX_SEARCH_CONCURRENCY = 10;
  var MAX_SECONDARY_KEYWORDS_TO_QUERY = 15;
  var MIN_KEEP_RESULT_SCORE = 5;
  var MIN_PHASE2_TARGET_CANDIDATES = 50;
  var PHASE4_TIMEOUT_SECONDS = 60;
  var PRE_CONTENT_MAX_SCORE_PER_KEYWORD = 10;
  var PRE_CONTENT_MIN_PRIMARY_SCORE = 0.5;
  var PRE_CONTENT_MIN_SECONDARY_SCORE = 0.2;
  var PRE_CONTENT_SECONDARY_MULTIPLIER = 0.5;
  var PRE_CONTENT_TAG_WORD_PRIMARY_SCORE = 0.2;
  var PRE_CONTENT_TAG_WORD_SECONDARY_SCORE = 0.1;
  var RANK_MATCH_COUNT_CAP = 10;
  var RESULT_TAG_DEFAULT = "plugins/ample-ai/search-results";

  // lib/constants/settings.js
  function settingKeyLabel(providerEm) {
    return PROVIDER_SETTING_KEY_LABELS[providerEm];
  }
  var ADD_PROVIDER_API_KEY_LABEL = "Add Provider API key";
  var AI_LEGACY_MODEL_LABEL = "Preferred AI model (e.g., 'gpt-4')";
  var AI_MODEL_LABEL = "Preferred AI models (comma separated)";
  var CORS_PROXY = "https://wispy-darkness-7716.amplenote.workers.dev";
  var IMAGE_FROM_PRECEDING_LABEL = "Image from preceding text";
  var IMAGE_FROM_PROMPT_LABEL = "Image from prompt";
  var IS_TEST_ENVIRONMENT = typeof process !== "undefined" && process.env?.NODE_ENV === "test";
  var MAX_SPACES_ABORT_RESPONSE = 30;
  var SEARCH_AGENT_RESULT_TAG_LABEL = `Tag to apply to search result summary notes`;
  var SEARCH_USING_AGENT_LABEL = "AI Search Agent";
  var SUGGEST_TASKS_LABEL = "Suggest tasks";
  var PLUGIN_NAME = "AmpleAI";
  var PROVIDER_SETTING_KEY_LABELS = {
    anthropic: "Anthropic API Key",
    deepseek: "DeepSeek API Key",
    gemini: "Gemini API Key",
    grok: "Grok API Key",
    openai: "OpenAI API Key"
    // perplexity: "Perplexity API Key",
  };

  // lib/providers/ai-provider-settings.js
  async function apiKeyFromAppOrUser(app, providerEm) {
    const apiKey = apiKeyFromApp(app, providerEm) || await apiKeyFromUser(app, providerEm);
    if (!apiKey) {
      app.alert("Couldn't find a valid OpenAI API key. An OpenAI account is necessary to generate images.");
      return null;
    }
    return apiKey;
  }
  function apiKeyFromApp(app, providerEm) {
    const providerKeyLabel = settingKeyLabel(providerEm);
    if (app.settings[providerKeyLabel]) {
      return app.settings[providerKeyLabel].trim();
    } else if (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]) {
      const deprecatedKey = (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]).trim();
      app.setSetting(settingKeyLabel("openai"), deprecatedKey);
      return deprecatedKey;
    } else {
      if (IS_TEST_ENVIRONMENT) {
        throw new Error(`Couldnt find a ${providerEm} key in ${app.settings}`);
      } else {
        app.alert("Please configure your OpenAI key in plugin settings.");
      }
      return null;
    }
  }
  async function apiKeyFromUser(app, providerEm) {
    const apiKey = await app.prompt(OPENAI_API_KEY_TEXT);
    if (apiKey) {
      app.setSetting(settingKeyLabel(providerEm), apiKey);
    }
    return apiKey;
  }
  function configuredProvidersSorted(appSettings) {
    const modelsSetting = appSettings[AI_MODEL_LABEL];
    const preferredModels2 = parsePreferredModels(modelsSetting);
    const sortedProviders = [];
    for (const model of preferredModels2) {
      const providerEm = providerFromModel(model);
      const settingKey = PROVIDER_SETTING_KEY_LABELS[providerEm];
      const minKeyLength = MIN_API_KEY_CHARACTERS[providerEm];
      const isConfigured = appSettings[settingKey]?.trim()?.length >= minKeyLength;
      if (isConfigured && !sortedProviders.includes(providerEm)) {
        sortedProviders.push(providerEm);
      }
    }
    for (const providerEm of REMOTE_AI_PROVIDER_EMS) {
      const settingKey = PROVIDER_SETTING_KEY_LABELS[providerEm];
      const minKeyLength = MIN_API_KEY_CHARACTERS[providerEm];
      const isConfigured = appSettings[settingKey]?.trim()?.length >= minKeyLength;
      if (isConfigured && !sortedProviders.includes(providerEm)) {
        sortedProviders.push(providerEm);
      }
    }
    return sortedProviders;
  }
  function defaultProviderModel(providerEm) {
    return PROVIDER_DEFAULT_MODEL[providerEm];
  }
  function modelTokenLimit(model) {
    return MODEL_TOKEN_LIMITS[model] || DEFAULT_MODEL_TOKEN_LIMIT;
  }
  function isModelOllama(model) {
    return !remoteAiModels().includes(model);
  }
  function modelForProvider(modelsSetting, providerEm) {
    const preferredModels2 = parsePreferredModels(modelsSetting);
    const providerModels = MODELS_PER_PROVIDER[providerEm];
    for (const model of preferredModels2) {
      if (providerModels && providerModels.includes(model)) {
        return model;
      }
    }
    return PROVIDER_DEFAULT_MODEL[providerEm];
  }
  function parsePreferredModels(modelsSetting) {
    if (!modelsSetting || typeof modelsSetting !== "string")
      return [];
    return modelsSetting.split(",").map((m) => m.trim()).filter(Boolean);
  }
  function preferredModel(app, lastUsedModel = null) {
    const models = preferredModels(app);
    if (lastUsedModel && models.includes(lastUsedModel)) {
      return lastUsedModel;
    }
    return models?.at(0);
  }
  function preferredModels(app) {
    if (!app || !app.settings)
      return [];
    const preferredModelsFromSetting = parsePreferredModels(app.settings[AI_MODEL_LABEL]);
    if (preferredModelsFromSetting?.length)
      return preferredModelsFromSetting;
    const providers = configuredProvidersSorted(app.settings);
    return providers.map((providerEm) => PROVIDER_DEFAULT_MODEL[providerEm]);
  }
  function providerEndpointUrl(model, apiKey) {
    const providerEm = providerFromModel(model);
    let endpoint = PROVIDER_ENDPOINTS[providerEm];
    endpoint = endpoint.replace("{model-name}", model);
    if (providerEm === "gemini") {
      endpoint = `${endpoint}?key=${apiKey}`;
    }
    return endpoint;
  }
  function providerFromModel(model) {
    for (const [providerEm, models] of Object.entries(MODELS_PER_PROVIDER)) {
      if (models.includes(model)) {
        return providerEm;
      }
    }
    throw new Error(`Model ${model} not found in any provider`);
  }
  function providerNameFromProviderEm(providerEm) {
    const providerNames = {
      anthropic: "Anthropic",
      deepseek: "DeepSeek",
      gemini: "Gemini",
      grok: "Grok",
      openai: "OpenAI",
      perplexity: "Perplexity"
    };
    return providerNames[providerEm] || providerEm.charAt(0).toUpperCase() + providerEm.slice(1);
  }
  function remoteAiModels() {
    return Object.values(MODELS_PER_PROVIDER).flat();
  }

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

  // lib/providers/fetch-json.js
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
  function contentFromProviderResponse(providerEm, jsonResponse) {
    let content;
    switch (providerEm) {
      case "anthropic":
        content = jsonResponse?.content?.at(0)?.text;
        break;
      case "gemini":
        content = jsonResponse?.candidates?.at(0)?.content?.parts?.at(0)?.text;
        break;
      case "ollama":
        content = jsonResponse?.message?.content || jsonResponse?.response;
        break;
      case "deepseek":
      case "grok":
      case "openai":
      case "perplexity":
      default:
        content = jsonResponse?.choices?.at(0)?.message?.content || jsonResponse?.choices?.at(0)?.message?.tool_calls?.at(0)?.function?.arguments;
        break;
    }
    if (!content) {
      console.debug(`Could not extract content from ${providerEm} response:`, JSON.stringify(jsonResponse, null, 2));
    }
    return content || null;
  }
  async function responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds = 30 } = {}) {
    const jsonResponseExpected = isJsonPrompt(promptKey);
    const providerEm = providerFromModel(model);
    let result;
    if (streamCallback) {
      result = await responseTextFromStreamResponse(app, response, model, jsonResponseExpected, streamCallback);
      app.alert(result, { scrollToEnd: true });
    } else {
      try {
        await Promise.race([
          new Promise(async (resolve, _) => {
            const jsonResponse = await response.json();
            result = contentFromProviderResponse(providerEm, jsonResponse);
            resolve(result);
          }),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error(`${providerEm} Timeout`)), timeoutSeconds * 1e3)
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

  // lib/providers/fetch-ollama.js
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

  // lib/providers/openai-functions.js
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

  // lib/providers/fetch-ai-provider.js
  var TIMEOUT_SECONDS = 30;
  async function callRemoteAI(plugin2, app, model, messages, promptKey, allowResponse, modelsQueried = []) {
    const providerEm = providerFromModel(model);
    model = model?.trim()?.length ? model : defaultProviderModel(providerEm);
    const tools = toolsValueFromPrompt(promptKey);
    const streamCallback = shouldStream(plugin2) ? streamAccumulate2.bind(null, modelsQueried, promptKey) : null;
    try {
      return await requestWithRetry(
        app,
        model,
        messages,
        tools,
        promptKey,
        streamCallback,
        allowResponse,
        { timeoutSeconds: plugin2.constants.requestTimeoutSeconds }
      );
    } catch (error) {
      if (plugin2.isTestEnvironment) {
        throw error;
      } else {
        const providerName = providerNameFromProviderEm(providerEm);
        app.alert(`Failed to call ${providerName}: ${error}`);
      }
      return null;
    }
  }
  async function llmPrompt(app, plugin2, prompt, { aiModel = null, concurrency = 1, jsonResponse = false, timeoutSeconds = null } = {}) {
    let modelCandidates = preferredModels(app);
    if (aiModel) {
      modelCandidates = modelCandidates.filter((m) => m !== aiModel);
      modelCandidates.unshift(aiModel);
    }
    const modelToUse = modelCandidates.shift();
    const messages = [{ role: "user", content: prompt }];
    const requestOptions = timeoutSeconds ? { timeoutSeconds } : {};
    const fetchResponse = await makeRequest(app, messages, modelToUse, requestOptions);
    const promptKey = jsonResponse ? "llmPromptJson" : null;
    const response = await responseFromStreamOrChunk(app, fetchResponse, modelToUse, promptKey, null, null);
    if (response && jsonResponse) {
      return extractJsonFromString(response);
    } else {
      return response;
    }
  }
  function headersForProvider(providerEm, apiKey) {
    const baseHeaders = { "Content-Type": "application/json" };
    switch (providerEm) {
      case "anthropic":
        return {
          ...baseHeaders,
          "x-api-key": apiKey,
          "anthropic-dangerous-direct-browser-access": "true",
          "anthropic-version": "2023-06-01"
        };
      case "gemini":
        return baseHeaders;
      default:
        return {
          ...baseHeaders,
          "Authorization": `Bearer ${apiKey}`
        };
    }
  }
  function requestBodyForProvider(messages, model, stream, tools, { promptKey = null } = {}) {
    let body;
    const providerEm = providerFromModel(model);
    const jsonResponseExpected = isJsonPrompt(promptKey);
    switch (providerEm) {
      case "anthropic": {
        const systemMessage = messages.find((m) => m.role === "system");
        const nonSystemMessages = messages.filter((m) => m.role !== "system");
        body = {
          "max_tokens": 4096,
          // WBH confirmed Q4 2025 Anthropic requires explicit max_tokens. TBD if this is the best value
          model,
          messages: nonSystemMessages
        };
        if (stream) {
          body.stream = stream;
        }
        if (systemMessage) {
          body.system = systemMessage.content;
        }
        break;
      }
      case "gemini": {
        const systemMsg = messages.find((m) => m.role === "system");
        const nonSystemMsgs = messages.filter((m) => m.role !== "system");
        body = {
          contents: nonSystemMsgs.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        };
        if (systemMsg) {
          body.systemInstruction = { parts: [{ text: systemMsg.content }] };
        }
        if (jsonResponseExpected) {
          body.generationConfig = { responseMimeType: "application/json" };
        }
        break;
      }
      case "grok":
      case "perplexity":
        body = { model, messages };
        if (stream)
          body.stream = stream;
        if (tools)
          body.tools = tools;
        break;
      case "deepseek": {
        body = { model, messages };
        if (stream)
          body.stream = stream;
        if (tools)
          body.tools = tools;
        body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
        if (jsonResponseExpected) {
          body.response_format = { type: "json_object" };
        }
        break;
      }
      case "openai":
      default: {
        body = { model, messages };
        if (stream)
          body.stream = stream;
        if (tools)
          body.tools = tools;
        const supportsFrequencyPenalty = !model.match(/^(o\d|gpt-5)/);
        if (supportsFrequencyPenalty) {
          body.frequency_penalty = frequencyPenaltyFromPromptKey(promptKey);
        }
        if (jsonResponseExpected) {
          body.response_format = { type: "json_object" };
        }
        break;
      }
    }
    return body;
  }
  async function makeRequest(app, messages, model, {
    attemptNumber = 1,
    promptKey = null,
    stream = null,
    timeoutSeconds = TIMEOUT_SECONDS,
    tools = null
  } = {}) {
    const providerEm = providerFromModel(model);
    if (attemptNumber > 0)
      console.debug(`Attempt #${attemptNumber}: Trying ${model} with ${promptKey || "no promptKey"}`);
    const apiKey = apiKeyFromApp(app, providerEm);
    const body = requestBodyForProvider(messages, model, stream, tools, { promptKey });
    const endpoint = providerEndpointUrl(model, apiKey);
    console.debug(`Calling ${providerEm} at ${endpoint} with body ${JSON.stringify(body)} at ${/* @__PURE__ */ new Date()}`);
    const headers = headersForProvider(providerEm, apiKey);
    const fetchResponse = await Promise.race([
      fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutSeconds * 1e3)
      )
    ]);
    if (!fetchResponse.ok) {
      const err = new Error(`Request failed with status ${fetchResponse.status}`);
      err.response = fetchResponse;
      throw err;
    }
    return fetchResponse;
  }
  async function requestWithRetry(app, model, messages, tools, promptKey, streamCallback, allowResponse, {
    suppressParallel = false,
    retries = 3,
    timeoutSeconds = TIMEOUT_SECONDS
  } = {}) {
    let error, response;
    const providerEm = providerFromModel(model);
    const providerName = providerNameFromProviderEm(providerEm);
    const stream = !!streamCallback;
    if (suppressParallel) {
      for (let i = 0; i < retries; i++) {
        try {
          response = await makeRequest(
            app,
            messages,
            model,
            { attemptNumber: i, promptKey, stream, timeoutSeconds, tools }
          );
          break;
        } catch (e) {
          error = e;
          response = e.response;
          console.log(`Attempt ${i + 1} failed with`, e, `at ${/* @__PURE__ */ new Date()}. Retrying...`);
        }
      }
    } else {
      const promises = Array.from(
        { length: retries },
        (_, i) => makeRequest(app, messages, model, { attemptNumber: i, promptKey, stream, timeoutSeconds, tools }).catch((e) => {
          console.log(`Parallel attempt ${i + 1} failed with`, e, `at ${/* @__PURE__ */ new Date()}`);
          throw e;
        })
      );
      try {
        response = await Promise.any(promises);
      } catch (aggregateError) {
        error = aggregateError.errors?.[0] || aggregateError;
        response = error?.response;
      }
    }
    console.debug("Response from promises is", response, "specifically response?.ok", response?.ok);
    if (response?.ok) {
      return await responseFromStreamOrChunk(app, response, model, promptKey, streamCallback, allowResponse, { timeoutSeconds });
    } else if (!response) {
      app.alert(`Failed to call ${providerName}: ${error}`);
      return null;
    } else if (response.status === 401) {
      app.alert(`Invalid ${providerName} API key. Please configure your ${providerName} key in plugin settings.`);
      return null;
    } else {
      const result = await response.json();
      console.error(`API error response from ${providerName}:`, result);
      if (result && result.error) {
        const errorMessage = result.error.message || JSON.stringify(result.error);
        app.alert(`Failed to call ${providerName}: ${errorMessage}`);
        return null;
      }
    }
  }
  function parseAnthropicStream(decodedValue, app, receivedContent, aiModel, modelsQueriedArray, promptKey, jsonResponseExpected) {
    let stop = false;
    const incrementalContents = [];
    const lines = decodedValue.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("event:")) {
        const eventType = line.substring(6).trim();
        if (eventType === "message_stop") {
          console.debug("Received message_stop from Anthropic");
          stop = true;
          break;
        }
      } else if (line.startsWith("data:")) {
        try {
          const data = JSON.parse(line.substring(5).trim());
          if (data.type === "content_block_delta" && data.delta?.text) {
            const content = data.delta.text;
            incrementalContents.push(content);
            receivedContent += content;
            app.alert(receivedContent, {
              actions: [{ icon: "pending", label: "Generating response" }],
              preface: streamPrefaceString(aiModel, modelsQueriedArray, promptKey, jsonResponseExpected),
              scrollToEnd: true
            });
          }
        } catch (e) {
        }
      }
    }
    return { stop, incrementalContents, receivedContent };
  }
  function parseGeminiStream(decodedValue, app, receivedContent, aiModel, modelsQueriedArray, promptKey, jsonResponseExpected, failedParseContent) {
    let stop = false;
    const incrementalContents = [];
    const responses = decodedValue.split(/^data: /m).filter((s) => s.trim().length);
    for (const jsonString of responses) {
      if (jsonString.includes("[DONE]")) {
        console.debug("Received [DONE] from Gemini");
        stop = true;
        break;
      }
      let jsonResponse;
      ({ failedParseContent, jsonResponse } = jsonResponseFromStreamChunk(jsonString, failedParseContent));
      if (jsonResponse) {
        const content = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          incrementalContents.push(content);
          receivedContent += content;
          app.alert(receivedContent, {
            actions: [{ icon: "pending", label: "Generating response" }],
            preface: streamPrefaceString(aiModel, modelsQueriedArray, promptKey, jsonResponseExpected),
            scrollToEnd: true
          });
        } else if (jsonResponse.candidates?.[0]?.finishReason) {
          console.log("Finishing Gemini stream for reason", jsonResponse.candidates[0].finishReason);
          stop = true;
          break;
        }
      }
    }
    return { stop, incrementalContents, receivedContent, failedParseContent };
  }
  function parseOpenAICompatibleStream(decodedValue, app, receivedContent, aiModel, modelsQueriedArray, promptKey, jsonResponseExpected, failedParseContent) {
    let stop = false;
    const incrementalContents = [];
    const responses = decodedValue.split(/^data: /m).filter((s) => s.trim().length);
    for (const jsonString of responses) {
      if (jsonString.includes("[DONE]")) {
        console.debug("Received [DONE] from jsonString");
        stop = true;
        break;
      }
      let jsonResponse;
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
    return { stop, incrementalContents, receivedContent, failedParseContent };
  }
  function streamAccumulate2(modelsQueriedArray, promptKey, app, decodedValue, receivedContent, aiModel, jsonResponseExpected, failedParseContent) {
    const providerEm = providerFromModel(aiModel);
    let result;
    switch (providerEm) {
      case "anthropic":
        result = parseAnthropicStream(decodedValue, app, receivedContent, aiModel, modelsQueriedArray, promptKey, jsonResponseExpected);
        break;
      case "gemini":
        result = parseGeminiStream(decodedValue, app, receivedContent, aiModel, modelsQueriedArray, promptKey, jsonResponseExpected, failedParseContent);
        break;
      case "deepseek":
      case "grok":
      case "openai":
      case "perplexity":
        result = parseOpenAICompatibleStream(decodedValue, app, receivedContent, aiModel, modelsQueriedArray, promptKey, jsonResponseExpected, failedParseContent);
        break;
      default:
        console.error(`Unknown provider for streaming: ${providerEm}`);
        result = { stop: true, incrementalContents: [], receivedContent, failedParseContent };
    }
    return {
      abort: result.stop,
      failedParseContent: result.failedParseContent || null,
      incrementalContents: result.incrementalContents,
      receivedContent: result.receivedContent
    };
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
    if (!inputLimit) {
      inputLimit = isModelOllama(aiModel) ? OLLAMA_TOKEN_CHARACTER_LIMIT : modelTokenLimit(aiModel);
    }
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

  // lib/model-picker.js
  var MAX_CANDIDATE_MODELS = 3;
  async function notePromptResponse(plugin2, app, noteUUID, promptKey, promptParams, {
    preferredModels: preferredModels2 = null,
    confirmInsert = true,
    contentIndex = null,
    rejectedResponses = null,
    allowResponse = null,
    contentIndexText
  } = {}) {
    preferredModels2 = preferredModels2 || await recommendedAiModels(plugin2, app, promptKey);
    if (!preferredModels2.length)
      return;
    const startAt = /* @__PURE__ */ new Date();
    const { response, modelUsed } = await sendQuery(
      plugin2,
      app,
      noteUUID,
      promptKey,
      promptParams,
      { allowResponse, contentIndex, contentIndexText, preferredModels: preferredModels2, rejectedResponses }
    );
    if (response === null) {
      app.alert("Failed to receive a usable response from AI");
      console.error("No result was returned from sendQuery with models", preferredModels2);
      return;
    }
    if (confirmInsert) {
      const actions = [];
      preferredModels2.forEach((model) => {
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
      } else if (preferredModels2[selectedValue]) {
        const preferredModel2 = preferredModels2[selectedValue];
        const updatedRejects = rejectedResponses || [];
        updatedRejects.push(responseAsText);
        preferredModels2 = [preferredModel2, ...preferredModels2.filter((model) => model !== preferredModel2)];
        console.debug("User chose to try", preferredModel2, "next so preferred models are", preferredModels2, "Rejected responses now", updatedRejects);
        return await notePromptResponse(plugin2, app, noteUUID, promptKey, promptParams, {
          confirmInsert,
          contentIndex,
          preferredModels: preferredModels2,
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
    preferredModels: preferredModels2 = null,
    rejectedResponses = null,
    allowResponse = null
  } = {}) {
    preferredModels2 = (preferredModels2 || await recommendedAiModels(plugin2, app, promptKey)).filter((n) => n);
    console.debug("Starting to query", promptKey, "with preferredModels", preferredModels2);
    let modelsQueried = [];
    for (const aiModel of preferredModels2) {
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
        console.error(`Failed to make call with "${aiModel}" response "${response}" while messages are "${messages}". Error counts`, plugin2.errorCountByModel);
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
      return callRemoteAI(plugin2, app, aiModel, messages, promptKey, allowResponse, modelsQueried);
    }
  }
  async function aiModelFromUserIntervention(plugin2, app, { defaultProvider = "openai", optionSelected = null } = {}) {
    const providerOptions = [
      { label: "Anthropic: Versatile provider most known for excellent coding models", value: "anthropic" },
      { label: "Google: Gemini has shown dramatic improvement over 2025", value: "gemini" },
      { label: "OpenAI: Popular all-around model. Offers image generation", value: "openai" },
      { label: "Grok: Elon is spending a lot of money to play catchup, is it working?", value: "grok" },
      { label: "DeepSeek: Chinese model good for deep thinking", value: "deepseek" },
      { label: "Ollama: best for experts who want high customization, or a free option", value: "ollama" }
    ];
    const sortedConfiguredProviderEms = configuredProvidersSorted(app.settings);
    const configuredProviderNames = sortedConfiguredProviderEms.map((providerEm) => providerNameFromProviderEm(providerEm));
    for (const option of providerOptions) {
      if (option.value !== "ollama" && sortedConfiguredProviderEms.includes(option.value)) {
        const modelName = modelForProvider(app.settings[AI_MODEL_LABEL], option.value);
        option.label += `  \u2705 Currently using ${modelName}`;
      }
    }
    const promptText = configuredProviderNames.length ? `Configured providers: ${configuredProviderNames.join(", ")}` : NO_MODEL_FOUND_TEXT;
    optionSelected = optionSelected || await app.prompt(promptText, {
      inputs: [
        {
          type: "radio",
          label: "Which AI provider would you like enable?",
          options: providerOptions,
          value: defaultProvider
        }
      ]
    });
    if (optionSelected === "ollama") {
      await app.alert(OLLAMA_INSTALL_TEXT);
      return null;
    }
    if (REMOTE_AI_PROVIDER_EMS.includes(optionSelected)) {
      const providerPrompt = PROVIDER_API_KEY_TEXT[optionSelected];
      const existingKey = app.settings[PROVIDER_SETTING_KEY_LABELS[optionSelected]] || "";
      const apiKey = await app.prompt(providerPrompt, { inputs: [{ label: "API Key", type: "string", value: existingKey }] });
      const minKeyLength = MIN_API_KEY_CHARACTERS[optionSelected];
      if (apiKey && apiKey.trim().length >= minKeyLength) {
        const settingKey = PROVIDER_SETTING_KEY_LABELS[optionSelected];
        await app.setSetting(settingKey, apiKey.trim());
        app.settings[settingKey] = apiKey.trim();
        return await promptForProviderPrecedence(app);
      } else {
        console.debug(`User entered invalid ${optionSelected} key`);
        const nextStep = await app.alert(PROVIDER_INVALID_KEY_TEXT, { actions: [
          { icon: "settings", label: "Retry entering key" }
        ] });
        console.debug("nextStep selected", nextStep);
        if (nextStep === 0) {
          return await aiModelFromUserIntervention(plugin2, app, { optionSelected });
        }
        return null;
      }
    }
    return null;
  }
  function includingFallbackModels(plugin2, app, candidateAiModels) {
    for (const providerEm of REMOTE_AI_PROVIDER_EMS) {
      const providerSettingLabel = PROVIDER_SETTING_KEY_LABELS[providerEm];
      if (app.settings[providerSettingLabel]?.length && !candidateAiModels.find((m) => m === PROVIDER_DEFAULT_MODEL[providerEm])) {
        candidateAiModels.push(PROVIDER_DEFAULT_MODEL[providerEm]);
        console.debug(`Added ${providerSettingLabel} model ${PROVIDER_DEFAULT_MODEL[providerEm]} to candidates`);
      }
    }
    if (plugin2.ollamaModelsFound?.length) {
      candidateAiModels = candidateAiModels.concat(plugin2.ollamaModelsFound.filter((m) => !candidateAiModels.includes(m)));
    }
    console.debug("Available models are", candidateAiModels);
    return candidateAiModels;
  }
  async function promptForProviderPrecedence(app) {
    const configuredProviderEms = configuredProvidersSorted(app.settings);
    console.log("Found configuredProviderEms", configuredProviderEms, "from settings", app.settings[AI_MODEL_LABEL]);
    if (configuredProviderEms.length === 0)
      return [];
    if (configuredProviderEms.length === 1) {
      return app.settings[AI_MODEL_LABEL]?.length ? [app.settings[AI_MODEL_LABEL]] : [PROVIDER_DEFAULT_MODEL[configuredProviderEms[0]]];
    }
    const inputs = configuredProviderEms.map((providerEm, index) => ({
      type: "string",
      label: `${providerNameFromProviderEm(providerEm)} precedence`,
      value: String(index + 1),
      placeholder: "Enter number (1 = highest priority)"
    }));
    const promptText = "Set the priority for each AI provider (1 = highest priority, will be tried first)";
    const results = await app.prompt(promptText, { inputs });
    if (!results)
      return null;
    const providerPrecedence = [];
    for (let i = 0; i < configuredProviderEms.length; i++) {
      const providerEm = configuredProviderEms[i];
      const precedenceValue = parseInt(results[i]) || i + 1;
      providerPrecedence.push({ providerEm, precedence: precedenceValue });
    }
    providerPrecedence.sort((a, b) => a.precedence - b.precedence);
    const sortedModels = providerPrecedence.map(({ providerEm }) => modelForProvider(app.settings[AI_MODEL_LABEL], providerEm));
    app.setSetting(AI_MODEL_LABEL, sortedModels.join(", "));
    return sortedModels;
  }

  // lib/functions/chat.js
  async function initiateChat(plugin2, app, messageHistory = []) {
    const aiModels = preferredModels(app);
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

  // lib/functions/search/candidate-evaluation.js
  var LLM_SCORE_BODY_CONTENT_LENGTH = 3e3;
  var MAX_NOTES_PER_RANKING = 10;
  var MIN_ACCEPT_SCORE = 8;
  async function phase4_scoreAndRank(searchAgent, analyzedCandidates, criteria, userQuery) {
    const previouslyRatedUuids = searchAgent.ratedNoteUuids || /* @__PURE__ */ new Set();
    const unratedCandidates = analyzedCandidates.filter((candidate) => !previouslyRatedUuids.has(candidate.uuid));
    if (previouslyRatedUuids.size > 0 && unratedCandidates.length < analyzedCandidates.length) {
      const excludedCount = analyzedCandidates.length - unratedCandidates.length;
      console.log(`[Phase 4] Excluding ${excludedCount} already-rated notes from scoring`);
    }
    const candidatesToAnalyze = unratedCandidates.slice(0, MAX_DEEP_ANALYZED_NOTES);
    searchAgent.emitProgress(`Phase 4: Ranking ${pluralize(candidatesToAnalyze.length, "result")}...`);
    const batches = [];
    for (let i = 0; i < candidatesToAnalyze.length; i += MAX_NOTES_PER_RANKING) {
      batches.push(candidatesToAnalyze.slice(i, i + MAX_NOTES_PER_RANKING));
    }
    console.log(`[Phase 4] ${candidatesToAnalyze.length > MAX_NOTES_PER_RANKING ? "Split" : "Taking"} ${candidatesToAnalyze.length} candidates in ${pluralize(batches.length, "batch")} for final scoring`);
    const batchResults = await Promise.all(
      batches.map((batch) => scoreCandidateBatchWithRetry(searchAgent, batch, criteria, userQuery))
    );
    const rankedNotes = batchResults.flat();
    const sortedNotes = rankedNotes.sort((a, b) => b.finalScore - a.finalScore);
    const ratedUuids = sortedNotes.map((note) => note.uuid);
    if (ratedUuids.length) {
      searchAgent.recordRatedNoteUuids(ratedUuids);
    }
    console.log(`[Phase 4] Finished with ${sortedNotes.length} sorted notes, headlined by "${sortedNotes[0]?.name}"`);
    return sortedNotes;
  }
  async function phase5_sanityCheck(searchAgent, rankedNotes, criteria, userQuery) {
    searchAgent.emitProgress(`Phase 5: Verifying ${pluralize(rankedNotes.length, "result")}...`);
    if (rankedNotes.length === 0) {
      return searchAgent.handleNoResults(criteria);
    }
    const pruneResult = rankedNotesAfterRemovingPoorMatches(rankedNotes);
    if (pruneResult.removedCount) {
      rankedNotes = pruneResult.rankedNotes;
      console.log(`Pruned ${pluralize(pruneResult.removedCount, "low quality result")} (score < ${MIN_KEEP_RESULT_SCORE} or "poor match"), leaving ${pruneResult.rankedNotes.length} notes:`, rankedNotes.map((n) => debugData(n)));
    } else {
      console.log(`No results pruned among ${rankedNotes.length} candidates:`, rankedNotes.map((n) => debugData(n)));
    }
    const topResult = rankedNotes[0];
    if (topResult.finalScore >= MIN_ACCEPT_SCORE) {
      searchAgent.emitProgress(`Found ${topResult.finalScore}/10 match, returning up to ${pluralize(criteria.resultCount, "result")} (type ${typeof criteria.resultCount})`);
      return searchAgent.formatResult(true, rankedNotes, criteria.resultCount);
    }
    const sanityPrompt = `
Original query: "${userQuery}"

Top recommended note:
- Title: "${topResult.name}"
- Score: ${topResult.finalScore}/10
- Tags: ${topResult.tags.join(", ") || "none"}
- Reasoning: ${topResult.scoreBreakdown.reasoning}

Does this genuinely seem like what the user is looking for?

Consider:
1. Does the title make sense given the query?
2. Is the score reasonable (>6.0 suggests good match)?
3. Are there obvious mismatches?

Return ONLY valid JSON:
{
  "confident": true,
  "concerns": null,
  "suggestAction": "accept"
}

Or if not confident:
{
  "confident": false,
  "concerns": "Explanation of concern",
  "suggestAction": "retry_broader" | "retry_narrower" | "insufficient_data"
}
`;
    const sanityCheck = await searchAgent.llm(sanityPrompt, { jsonResponse: true });
    if (sanityCheck.confident || searchAgent.retryCount >= searchAgent.maxRetries) {
      searchAgent.emitProgress(`Search completed with ${pluralize(criteria.resultCount, "final result")}`);
      return searchAgent.formatResult(true, rankedNotes, criteria.resultCount);
    }
    console.log(`Sanity check failed: ${sanityCheck.concerns}`);
    searchAgent.retryCount++;
    if (sanityCheck.suggestAction === "retry_broader") {
      return searchAgent.nextSearchAttempt(userQuery, criteria);
    }
    return searchAgent.formatResult(false, rankedNotes, criteria.resultCount);
  }
  function isTimeoutError(error) {
    if (!error || !error.message)
      return false;
    const message = error.message.toLowerCase();
    return message.includes("timeout");
  }
  function rankedNotesAfterRemovingPoorMatches(rankedNotes) {
    const poorMatchRegex = /poor match/i;
    const filteredRankedNotes = rankedNotes.filter((r) => {
      const reasoning = r.scoreBreakdown && r.scoreBreakdown.reasoning ? r.scoreBreakdown.reasoning : "";
      const hasPoorMatchLanguage = poorMatchRegex.test(reasoning);
      return r.finalScore >= MIN_KEEP_RESULT_SCORE && !hasPoorMatchLanguage;
    });
    if (filteredRankedNotes.length && filteredRankedNotes.length < rankedNotes.length) {
      return { rankedNotes: filteredRankedNotes, removedCount: rankedNotes.length - filteredRankedNotes.length };
    }
    return { rankedNotes, removedCount: 0 };
  }
  async function scoreCandidateBatch(searchAgent, candidates, criteria, userQuery) {
    const now = /* @__PURE__ */ new Date();
    const scoringPrompt = `
You are scoring note search results. Original query: "${userQuery}"

Extracted criteria:
${JSON.stringify(criteria, null, 2)}

Score each candidate note 0-10 on these dimensions:
1. COHERENCE: Does the title & content of this note seem to generally match the user's query?
2. TITLE_RELEVANCE: How well does the note title match the search intent?
3. KEYWORD_DENSITY: How concentrated are the keywords in the content?
4. TAG_ALIGNMENT: Does it have relevant or preferred tags?
5. RECENCY: If the user specified recency requirement, does it meet that? If no user-specified requirement, score 10 for recency within a month of today (${now.toDateString()}), and scale down to 0 for candidates from 12+ months earlier.

Candidates to score:
${candidates.map((candidate) => `
UUID: ${candidate.uuid}
Title: "${candidate.name}"
Tags: ${candidate.tags?.join(", ") || "none"}
Updated: ${candidate.updated}
Body Content (ending with $END$): ${candidate.bodyContent.slice(0, LLM_SCORE_BODY_CONTENT_LENGTH)}
$END$
`).join("\n\n")}

Return ONLY valid JSON array with one entry per candidate, using the UUID to identify each:
[
  {
    "uuid": "the-candidate-uuid",
    "coherence": 7,
    "titleRelevance": 8,
    "keywordDensity": 7,
    "tagAlignment": 6,
    "recency": 5,
    "reasoning": "Brief explanation of why this note matches"
  }
]
`;
    const scores = await searchAgent.llm(scoringPrompt, { jsonResponse: true, timeoutSeconds: PHASE4_TIMEOUT_SECONDS });
    const scoresArray = Array.isArray(scores) ? scores : [scores];
    const candidatesByUuid = new Map(candidates.map((candidate) => [candidate.uuid, candidate]));
    const weights = {
      coherence: 0.25,
      keywordDensity: 0.25,
      recency: 0.1,
      tagAlignment: 0.15,
      titleRelevance: 0.25
    };
    return scoresArray.map((score) => {
      const weightedLlmScore = Object.entries(weights).reduce((sum, [key, weight]) => {
        const rawValue = score[key];
        const value = Number(rawValue === void 0 || rawValue === null ? 0 : rawValue);
        return sum + value * weight;
      }, 0);
      const note = candidatesByUuid.get(score.uuid);
      if (note) {
        score.keywordDensitySignal = Math.round(Math.min(RANK_MATCH_COUNT_CAP, note.keywordDensityEstimate || 1) * 0.2 * 10) / 10;
        const finalScore = weightedLlmScore + score.keywordDensitySignal;
        note.finalScore = Math.round(finalScore * 10) / 10;
        note.scoreBreakdown = score;
        note.reasoning = score.reasoning;
      }
      return note;
    }).filter(Boolean);
  }
  async function scoreCandidateBatchWithRetry(searchAgent, candidates, criteria, userQuery) {
    let lastError = null;
    let lastElapsedSeconds = 0;
    for (let attempt = 1; attempt <= MAX_PHASE4_TIMEOUT_RETRIES; attempt++) {
      const attemptStartTime = Date.now();
      try {
        return await scoreCandidateBatch(searchAgent, candidates, criteria, userQuery);
      } catch (error) {
        lastError = error;
        lastElapsedSeconds = Math.round((Date.now() - attemptStartTime) / 100) / 10;
        if (isTimeoutError(error)) {
          searchAgent.emitProgress(`Batch scoring timed out after ${lastElapsedSeconds}s (attempt ${attempt}/${MAX_PHASE4_TIMEOUT_RETRIES})`);
          if (attempt < MAX_PHASE4_TIMEOUT_RETRIES) {
            continue;
          }
        } else {
          searchAgent.emitProgress(`Batch scoring failed, retrying once...`);
          const retryStartTime = Date.now();
          try {
            return await scoreCandidateBatch(searchAgent, candidates, criteria, userQuery);
          } catch (retryError) {
            const retryElapsedSeconds = Math.round((Date.now() - retryStartTime) / 100) / 10;
            searchAgent.emitProgress(`Batch scoring failed after ${retryElapsedSeconds}s retry ("${retryError}")`);
            return [];
          }
        }
      }
    }
    searchAgent.emitProgress(`Batch scoring failed after ${MAX_PHASE4_TIMEOUT_RETRIES} timeout retries, last timeout at ${lastElapsedSeconds}s ("${lastError}")`);
    return [];
  }

  // lib/functions/search/generate-summary-note.js
  var MAX_SCORE_DISPLAY = 10;
  async function createSearchSummaryNote(searchAgent, searchResult, searchCriteria, userQuery) {
    const { notes } = searchResult;
    try {
      const modelUsed = preferredModel(searchAgent.app, searchAgent.lastModelUsed) || "unknown model";
      const titlePrompt = `Create a brief, descriptive title (max 40 chars) for a search results note.
Search query: "${userQuery}"
Found: ${searchResult.found ? "Yes" : "No"}
Return ONLY the title text, nothing else.`;
      const titleBase = await searchAgent.llm(titlePrompt);
      const now = /* @__PURE__ */ new Date();
      const noteTitle = `${titleBase.trim()} (${modelUsed} queried at ${now.toLocaleDateString()})`;
      let noteContent = "";
      if (notes?.length) {
        noteContent += `# Matched Notes (${notes.length === searchResult.maxResultCount ? "top " : ""}${pluralize(notes.length, "result")})

`;
        noteContent += `| ***Note*** | ***Score (1-10)*** | ***Reasoning*** | ***Tags*** |
`;
        noteContent += `| --- | --- | --- | --- |
`;
        notes.forEach((note) => {
          noteContent += `| [${note.name}](${note.url}) | ${Math.min(note.finalScore?.toFixed(1), MAX_SCORE_DISPLAY)} | ${note.reasoning || "N/A"} | ${note.tags && note.tags.length > 0 ? note.tags.join(", ") : "Not found"} |
`;
        });
      } else {
        noteContent += `## No Results Found

No notes matched the search criteria.

`;
      }
      noteContent += `


# Search Inputs

**Query:** "${userQuery}"

`;
      noteContent += `**Result summary:** ${searchResult.resultSummary}

`;
      noteContent += `**Search criteria:**

`;
      noteContent += "```json\n";
      noteContent += JSON.stringify(searchCriteria, null, 2);
      noteContent += "\n```\n";
      const searchResultTag = searchAgent.summaryNoteTag();
      const localUuid = await searchAgent.app.createNote(noteTitle.trim(), [searchResultTag].filter(Boolean));
      const summaryNoteHandle = await searchAgent.app.findNote(localUuid);
      console.log(`Created ${localUuid} which translates to`, summaryNoteHandle);
      await searchAgent.app.replaceNoteContent(summaryNoteHandle, noteContent);
      return {
        uuid: summaryNoteHandle.uuid,
        name: noteTitle.trim(),
        url: noteUrlFromUUID(summaryNoteHandle.uuid)
      };
    } catch (error) {
      console.error("Failed to create search summary note:", error);
      return null;
    }
  }

  // lib/functions/search/search-candidate-note.js
  var MAX_LENGTH_REDUCTION = 10;
  var SearchCandidateNote = class {
    // Private field for UUID to ensure url stays in sync
    #uuid;
    // --------------------------------------------------------------------------
    // @param {string} uuid - Note UUID
    // @param {string} name - Note title
    // @param {Array<string>} tags - Note tags
    // @param {string} created - ISO timestamp of note creation
    // @param {string} updated - ISO timestamp of last note update
    constructor(uuid, name, tags, created, updated, { bodyContent = null } = {}) {
      this.#uuid = uuid;
      this.created = created;
      this.name = name;
      this.tags = tags || [];
      this.updated = updated;
      this.bodyContent = bodyContent?.slice(0, MAX_CHARACTERS_TO_SEARCH_BODY) || "";
      this.originalContentLength = bodyContent ? bodyContent.length : 0;
      this.keywordDensityEstimate = 0;
      this.keywordDensityIncludesTagBoost = false;
      this.preContentMatchScore = 0;
      this.scorePerKeyword = {};
      this.tagBoost = 0;
      this.checks = {};
      this.finalScore = 0;
      this.reasoning = null;
      this.scoreBreakdown = {};
    }
    // --------------------------------------------------------------------------
    // UUID getter - returns the note's UUID
    get uuid() {
      return this.#uuid;
    }
    // --------------------------------------------------------------------------
    // URL getter - derives the Amplenote URL from the UUID
    // URL is always in sync with UUID since it's computed on access
    get url() {
      return `https://www.amplenote.com/notes/${this.#uuid}`;
    }
    // --------------------------------------------------------------------------
    // Factory method to create a new instance by fetching note content from a noteHandle
    //
    // @param {Object} noteHandle - Note handle object from Amplenote Plugin API (app.filterNotes, app.searchNotes, app.notes.find, etc.)
    //   Expected properties:
    //   - uuid {string} - Note UUID
    //   - name {string} - Note title
    //   - tags {Array<string>} - Array of tag names applied to the note
    //   - created {string} - ISO timestamp of note creation
    //   - updated {string} - ISO timestamp of last note update
    //   Expected methods:
    //   - content() {Promise<string>} - Async method returning the note's markdown content
    // @returns {Promise<SearchCandidateNote>} New instance with fetched and truncated content
    static create(noteHandle) {
      return new SearchCandidateNote(
        noteHandle.uuid,
        noteHandle.name,
        noteHandle.tags,
        noteHandle.created,
        noteHandle.updated
      );
    }
    // --------------------------------------------------------------------------
    // Calculate and set the keyword density estimate for this note
    // The estimate reflects the density of keyword matches relative to note length.
    // Higher values indicate more concentrated keyword matches in shorter content.
    //
    // Scoring:
    // - Primary keyword in title: KEYWORD_TITLE_PRIMARY_WEIGHT points per match
    // - Primary keyword in body: KEYWORD_BODY_PRIMARY_WEIGHT point per match
    // - Secondary keyword in title: KEYWORD_TITLE_SECONDARY_WEIGHT points per match
    // - Secondary keyword in body: KEYWORD_BODY_SECONDARY_WEIGHT points per match
    // - Primary keyword containing tag hierarchy part: KEYWORD_TAG_PRIMARY_WEIGHT point
    // - Secondary keyword containing tag hierarchy part: KEYWORD_TAG_SECONDARY_WEIGHT points
    //
    // Final score = totalPoints / (originalContentLength / KEYWORD_DENSITY_DIVISOR)
    //
    // @param {Array<string>} primaryKeywords - Primary search keywords
    // @param {Array<string>} secondaryKeywords - Secondary search keywords
    calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords) {
      let totalPoints = 0;
      const titleLower = (this.name || "").toLowerCase();
      const bodyLower = (this.bodyContent || "").toLowerCase();
      const tagParts = tagHierarchyPartsFromTags(this.tags);
      for (const keyword of primaryKeywords || []) {
        const keywordLower = keyword.toLowerCase();
        totalPoints += countMatches(titleLower, keywordLower) * KEYWORD_TITLE_PRIMARY_WEIGHT;
        totalPoints += countMatches(bodyLower, keywordLower) * KEYWORD_BODY_PRIMARY_WEIGHT;
        if (keywordContainsTagPart(keywordLower, tagParts)) {
          totalPoints += KEYWORD_TAG_PRIMARY_WEIGHT;
        }
      }
      for (const keyword of secondaryKeywords || []) {
        const keywordLower = keyword.toLowerCase();
        totalPoints += countMatches(titleLower, keywordLower) * KEYWORD_TITLE_SECONDARY_WEIGHT;
        totalPoints += countMatches(bodyLower, keywordLower) * KEYWORD_BODY_SECONDARY_WEIGHT;
        if (keywordContainsTagPart(keywordLower, tagParts)) {
          totalPoints += KEYWORD_TAG_SECONDARY_WEIGHT;
        }
      }
      const lengthReduction = Math.min(this.originalContentLength / KEYWORD_DENSITY_DIVISOR, MAX_LENGTH_REDUCTION);
      this.keywordDensityIncludesTagBoost = Number.isFinite(this.tagBoost) && this.tagBoost > 0;
      this.keywordDensityEstimate = this.tagBoost + totalPoints - lengthReduction;
    }
    // --------------------------------------------------------------------------
    // Set the body content and original content length from the provided content string.
    // Truncates the content to MAX_CHARACTERS_TO_SEARCH_BODY and updates originalContentLength.
    //
    // @param {string} content - The full note content
    setBodyContent(content) {
      this.originalContentLength = content ? content.length : 0;
      this.bodyContent = content ? content.slice(0, MAX_CHARACTERS_TO_SEARCH_BODY) : "";
    }
    // --------------------------------------------------------------------------
    // Ensure pre-content score is calculated for the given keyword.
    // If a score doesn't already exist in scorePerKeyword, calculates and stores
    // the score based on matches in note name and tags.
    // Updates preContentMatchScore after processing.
    //
    // @param {boolean} isPrimary - Whether this is a primary keyword (higher weight)
    // @param {string} keyword - Keyword to ensure score for
    ensureKeywordPreContentScore(isPrimary, keyword) {
      const keywordLower = keyword.toLowerCase();
      if (Number.isFinite(this.scorePerKeyword[keywordLower]))
        return;
      const nameLower = (this.name || "").toLowerCase();
      const nameMatchScore = scoreFromNameMatch(keywordLower, nameLower, isPrimary);
      const tagMatchScore = scoreFromTagMatches(keywordLower, this.tags, isPrimary);
      const totalScore = Math.min(nameMatchScore + tagMatchScore, PRE_CONTENT_MAX_SCORE_PER_KEYWORD);
      this.scorePerKeyword[keywordLower] = totalScore;
      this.preContentMatchScore = Object.values(this.scorePerKeyword).reduce((sum, s) => sum + s, 0);
    }
    // --------------------------------------------------------------------------
    // Set the tag boost multiplier
    setTagBoost(boost) {
      this.tagBoost = boost;
      if (Number.isFinite(boost) && boost > 0 && !this.keywordDensityIncludesTagBoost) {
        this.keywordDensityEstimate += boost;
        this.keywordDensityIncludesTagBoost = true;
      }
    }
  };
  function scoreFromNameMatch(keywordLower, nameLower, isPrimary) {
    if (!keywordLower || !nameLower)
      return 0;
    const matchIndex = nameLower.indexOf(keywordLower);
    if (matchIndex === -1)
      return 0;
    const matchLength = keywordLower.length;
    let rawScore = matchLength * (0.02 * matchLength + 0.1);
    const minScore = isPrimary ? PRE_CONTENT_MIN_PRIMARY_SCORE : PRE_CONTENT_MIN_SECONDARY_SCORE;
    rawScore = Math.max(rawScore, minScore);
    rawScore = Math.min(rawScore, PRE_CONTENT_MAX_SCORE_PER_KEYWORD);
    if (!isPrimary) {
      rawScore = rawScore * PRE_CONTENT_SECONDARY_MULTIPLIER;
    }
    return rawScore;
  }
  function scoreFromTagMatches(keywordLower, tags, isPrimary) {
    if (!keywordLower || !tags || !tags.length)
      return 0;
    let totalScore = 0;
    const minMatchLengthForWordScore = 4;
    for (const hierarchicalTagString of tags) {
      const normalizedTag = hierarchicalTagString.replace(/[/\-]/g, " ");
      if (normalizedTag.includes(keywordLower)) {
        const matchLength = keywordLower.length;
        let rawScore = matchLength * (0.02 * matchLength + 0.1);
        const minScore = isPrimary ? PRE_CONTENT_MIN_PRIMARY_SCORE : PRE_CONTENT_MIN_SECONDARY_SCORE;
        rawScore = Math.max(rawScore, minScore);
        rawScore = Math.min(rawScore, PRE_CONTENT_MAX_SCORE_PER_KEYWORD);
        if (!isPrimary) {
          rawScore = rawScore * PRE_CONTENT_SECONDARY_MULTIPLIER;
        }
        totalScore += rawScore;
        continue;
      }
      const tagHierarchyParts = hierarchicalTagString.split("/");
      for (const tagHierarchyPart of tagHierarchyParts) {
        if (tagHierarchyPart.startsWith(keywordLower)) {
          const wordScore = isPrimary ? PRE_CONTENT_TAG_WORD_PRIMARY_SCORE : PRE_CONTENT_TAG_WORD_SECONDARY_SCORE;
          totalScore += wordScore;
        }
      }
    }
    return totalScore;
  }
  function countMatches(text, keyword) {
    if (!text || !keyword)
      return 0;
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\b|\\s)${escapedKeyword}`, "gi");
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }
  function keywordContainsTagPart(keywordLower, tagParts) {
    for (const tagPart of tagParts) {
      if (keywordLower.includes(tagPart)) {
        return true;
      }
    }
    return false;
  }
  function tagHierarchyPartsFromTags(tags) {
    const parts = /* @__PURE__ */ new Set();
    for (const tag of tags || []) {
      const segments = tag.split("/");
      for (const segment of segments) {
        const trimmed = segment.trim().toLowerCase();
        if (trimmed) {
          parts.add(trimmed);
        }
      }
    }
    return Array.from(parts);
  }

  // lib/functions/search/tag-utils.js
  function normalizedTagFromTagName(tagName) {
    if (!tagName)
      return null;
    if (typeof tagName !== "string")
      return null;
    return tagName.toLowerCase().replace(/[^a-z0-9/]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  function requiredTagsFromTagRequirement(tagRequirement) {
    if (!tagRequirement)
      return [];
    const mustHave = tagRequirement.mustHave;
    if (!mustHave)
      return [];
    if (Array.isArray(mustHave)) {
      return mustHave.map((t) => normalizedTagFromTagName(t)).filter(Boolean);
    }
    const normalizedTag = normalizedTagFromTagName(mustHave);
    return normalizedTag ? [normalizedTag] : [];
  }

  // lib/functions/search/phase2-candidate-collection.js
  async function phase2_collectCandidates(searchAgent, criteria) {
    const startAt = /* @__PURE__ */ new Date();
    const { dateFilter, primaryKeywords, resultCount, secondaryKeywords, tagRequirement } = criteria;
    searchAgent.emitProgress(`Phase 2: Now gathering result candidates from ${pluralize(primaryKeywords?.length || 0, "primary keyword")} and ${pluralize(secondaryKeywords?.length || 0, "secondary keyword")}...`);
    let candidates;
    if (primaryKeywords?.length) {
      candidates = await executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement);
    } else {
      return [];
    }
    if (dateFilter) {
      const dateField = dateFilter.type === "created" ? "created" : "updated";
      const afterDate = new Date(dateFilter.after);
      candidates = candidates.filter((note) => {
        const noteDate = new Date(note[dateField]);
        return noteDate >= afterDate;
      });
      console.log(`After date filter: ${candidates.length} candidates`);
    }
    if (candidates.length) {
      candidates.forEach((note) => {
        let tagBoost = 1;
        if (tagRequirement.preferred && note.tags) {
          const hasPreferredTag = note.tags.some(
            (tag) => tag === tagRequirement.preferred || tag.startsWith(tagRequirement.preferred + "/")
          );
          if (hasPreferredTag)
            tagBoost = 1.5;
        }
        note.setTagBoost(tagBoost);
      });
    }
    searchAgent.emitProgress(`Found ${candidates.length} candidate notes in ${Math.round((/* @__PURE__ */ new Date() - startAt) / 100) / 10}s`);
    return candidates;
  }
  async function addMatchesFromSearchNotes(candidatesByUuid, isPrimary, keywords, searchAgent) {
    let notesFound = [];
    for (let i = 0; i < keywords.length; i += MAX_SEARCH_CONCURRENCY) {
      const batch = keywords.slice(i, i + MAX_SEARCH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (keyword) => {
          let results = await searchAgent.app.searchNotes(keyword);
          if (!results.length)
            return { keyword, notes: [] };
          results = await filterNotesWithBody(keyword, results);
          results = eligibleNotesFromResults(results, searchAgent);
          if (results.length)
            notesFound = notesFound.concat(results);
          return { keyword, notes: uniqueUuidNoteCandidatesFromNotes(results) };
        })
      );
      for (const { keyword, notes: perKeywordNotes } of batchResults) {
        const cappedNotes = perKeywordNotes.slice(0, MAX_CANDIDATES_PER_KEYWORD);
        if (perKeywordNotes.length > MAX_CANDIDATES_PER_KEYWORD) {
          console.log(`[searchNotes] Query "${keyword}" returned ${perKeywordNotes.length} notes, capping to ${MAX_CANDIDATES_PER_KEYWORD}`);
        }
        for (const noteHandle of cappedNotes) {
          upsertCandidate(candidatesByUuid, isPrimary, noteHandle, keyword);
        }
      }
    }
    const uniqueNotes = notesFound.filter((n, i) => notesFound.indexOf(n) === i);
    console.log(`[searchNotes] Searching note bodies with`, keywords, `found ${uniqueNotes.length} unique note(s)`, uniqueNotes.map((n) => debugData(n)));
  }
  async function collectCandidatesWithKeywordLimits(candidatesByUuid, isPrimary, keywords, searchAgent, tagRequirement) {
    const maxedOutKeywords = [];
    const requiredTags = requiredTagsFromTagRequirement(tagRequirement);
    const tagFilter = requiredTags.length === 1 ? requiredTags[0] : null;
    let notesFound = [];
    for (const keyword of keywords) {
      let keywordNoteMatches;
      if (tagFilter) {
        keywordNoteMatches = await searchAgent.app.filterNotes({ query: keyword, tag: tagFilter });
      } else {
        keywordNoteMatches = await searchAgent.app.filterNotes({ query: keyword });
      }
      keywordNoteMatches = eligibleNotesFromResults(keywordNoteMatches, searchAgent);
      if (keywordNoteMatches.length >= MAX_CANDIDATES_PER_KEYWORD) {
        console.log(`Keyword "${keyword}" returned ${keywordNoteMatches.length} notes (>= ${MAX_CANDIDATES_PER_KEYWORD}), capping contribution and marking as maxed out`);
        keywordNoteMatches = keywordNoteMatches.slice(0, MAX_CANDIDATES_PER_KEYWORD);
        maxedOutKeywords.push(keyword);
      }
      notesFound = notesFound.concat(keywordNoteMatches);
      for (const note of uniqueUuidNoteCandidatesFromNotes(keywordNoteMatches)) {
        upsertCandidate(candidatesByUuid, isPrimary, note, keyword);
      }
    }
    const uniqueNotes = notesFound.filter((n, i) => notesFound.indexOf(n) === i);
    console.log(`[filterNotes with limits] Collected ${pluralize(uniqueNotes.length, "unique note")} from ${pluralize(keywords.length, "keyword")}, candidatesByUuid size: ${candidatesByUuid.size}`);
    return maxedOutKeywords;
  }
  function eligibleNotesFromResults(notes, searchAgent) {
    let filtered = notes || [];
    const summaryNoteTagToExclude = searchAgent.summaryNoteTag();
    if (summaryNoteTagToExclude) {
      filtered = filtered.filter((note) => {
        if (!note.tags)
          return true;
        return !note.tags.some(
          (tag) => tag === summaryNoteTagToExclude || tag.startsWith(summaryNoteTagToExclude + "/")
        );
      });
    }
    if (filtered.length > MAX_NOTES_PER_QUERY) {
      filtered = filtered.slice(0, MAX_NOTES_PER_QUERY);
    }
    return filtered;
  }
  function activeKeywordsForStrategy(primaryKeywords, searchAgent, secondaryKeywords) {
    const secondaryKeywordsForQuerying = (secondaryKeywords || []).slice(0, MAX_SECONDARY_KEYWORDS_TO_QUERY);
    const previouslyMaxedKeywords = searchAgent.maxedOutKeywords || /* @__PURE__ */ new Set();
    let activePrimaryKeywords;
    let activeSecondaryKeywords;
    if (searchAgent.searchAttempt === ATTEMPT_FIRST_PASS) {
      activePrimaryKeywords = [...primaryKeywords];
      activeSecondaryKeywords = [...secondaryKeywordsForQuerying];
    } else {
      activePrimaryKeywords = wordsFromMultiWordKeywords(primaryKeywords);
      activeSecondaryKeywords = wordsFromMultiWordKeywords(secondaryKeywordsForQuerying);
    }
    if (previouslyMaxedKeywords.size) {
      const originalPrimaryCount = activePrimaryKeywords.length;
      const originalSecondaryCount = activeSecondaryKeywords.length;
      activePrimaryKeywords = activePrimaryKeywords.filter((keyword) => !previouslyMaxedKeywords.has(keyword.toLowerCase()));
      activeSecondaryKeywords = activeSecondaryKeywords.filter((keyword) => !previouslyMaxedKeywords.has(keyword.toLowerCase()));
      const excludedPrimaryCount = originalPrimaryCount - activePrimaryKeywords.length;
      const excludedSecondaryCount = originalSecondaryCount - activeSecondaryKeywords.length;
      if (excludedPrimaryCount > 0 || excludedSecondaryCount > 0) {
        console.log(`[activeKeywordsForStrategy] Excluding ${excludedPrimaryCount} primary and ${excludedSecondaryCount} secondary keywords that maxed out in previous attempts`);
      }
    }
    return { activePrimaryKeywords, activeSecondaryKeywords };
  }
  async function collectSearchCandidates(candidatesByUuid, minTargetResults, primaryKeywords, searchAgent, secondaryKeywords, tagRequirement) {
    const strategyName = searchAgent.searchAttempt;
    const maxedOutPrimaryKeywords = await collectCandidatesWithKeywordLimits(candidatesByUuid, true, primaryKeywords, searchAgent, tagRequirement);
    let activeSecondaryKeywords = filterKeywordsContainingMaxedOut(secondaryKeywords, maxedOutPrimaryKeywords);
    let maxedOutSecondaryKeywords = [];
    if (candidatesByUuid.size < minTargetResults && activeSecondaryKeywords.length) {
      console.log(`[${strategyName}] Below minimum target (${minTargetResults}), broadening filterNotes with ${activeSecondaryKeywords.length} secondary keywords`);
      maxedOutSecondaryKeywords = await collectCandidatesWithKeywordLimits(
        candidatesByUuid,
        false,
        activeSecondaryKeywords,
        searchAgent,
        tagRequirement
      );
    } else if (activeSecondaryKeywords.length) {
      console.log(`[${strategyName}] Skipping ${activeSecondaryKeywords.length} secondary keyword filterNotes since primary keywords yielded ${candidatesByUuid.size} candidates`);
    }
    const maxedOutKeywords = [...maxedOutPrimaryKeywords, ...maxedOutSecondaryKeywords];
    if (maxedOutKeywords.length) {
      console.log(`[${strategyName}] Keywords that hit contribution limit: ${maxedOutKeywords.join(", ")}`);
      searchAgent.recordMaxedOutKeywords(maxedOutKeywords);
    }
    if (candidatesByUuid.size < minTargetResults) {
      console.log(`[${strategyName}] Too few candidates (${candidatesByUuid.size}) below minimum (${minTargetResults}), supplementing with app.searchNotes`);
      const remainingPrimaryKeywords = filterKeywordsContainingMaxedOut(primaryKeywords, maxedOutKeywords);
      if (remainingPrimaryKeywords.length) {
        await addMatchesFromSearchNotes(candidatesByUuid, true, remainingPrimaryKeywords, searchAgent);
      }
      if (candidatesByUuid.size < minTargetResults) {
        const remainingSecondaryKeywords = filterKeywordsContainingMaxedOut(activeSecondaryKeywords, maxedOutKeywords);
        if (remainingSecondaryKeywords.length) {
          console.log(`[${strategyName}] Searching ${remainingSecondaryKeywords.length} secondary keywords with app.searchNotes since we only located ${candidatesByUuid.size} candidates so far`);
          await addMatchesFromSearchNotes(candidatesByUuid, false, remainingSecondaryKeywords, searchAgent);
        }
      }
    } else {
      console.log(`[${strategyName}] Searched ${primaryKeywords.length} primary filterNotes queries: ${candidatesByUuid.size} unique candidates`);
    }
  }
  async function densitySortedCandidates(candidates, primaryKeywords, searchAgent, secondaryKeywords) {
    const strategyName = searchAgent.searchAttempt;
    const sortedByPreContentScore = candidates.sort((a, b) => b.preContentMatchScore - a.preContentMatchScore).slice(0, MAX_CANDIDATES_FOR_DENSITY_CALCULATION);
    if (candidates.length > sortedByPreContentScore.length) {
      console.log(`[${strategyName}] Limiting from ${candidates.length} to ${sortedByPreContentScore.length} candidates for density calculation (top preContentMatchScore). Cutoff note was`, sortedByPreContentScore[sortedByPreContentScore.length - 1]);
    }
    const densityPromises = sortedByPreContentScore.map(async (candidate) => {
      try {
        const content = await searchAgent.app.getNoteContent({ uuid: candidate.uuid });
        candidate.setBodyContent(content);
        candidate.calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords);
      } catch (error) {
        candidate.calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords);
      }
    });
    await Promise.all(densityPromises);
    const finalResults = sortedByPreContentScore.sort((a, b) => {
      const densityDiff = (b.keywordDensityEstimate || 0) - (a.keywordDensityEstimate || 0);
      if (densityDiff !== 0)
        return densityDiff;
      const bUpdated = b.updated ? new Date(b.updated).getTime() : 0;
      const aUpdated = a.updated ? new Date(a.updated).getTime() : 0;
      return bUpdated - aUpdated;
    });
    console.log(`Calculated keyword density estimates for ${finalResults.length} candidates`, finalResults.map((n) => debugData(n)));
    return finalResults;
  }
  async function executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement) {
    if (!primaryKeywords?.length)
      return [];
    const effectiveResultCount = resultCount || DEFAULT_SEARCH_NOTES_RETURNED;
    const minTargetResults = Math.max(MIN_PHASE2_TARGET_CANDIDATES, effectiveResultCount);
    const { activePrimaryKeywords, activeSecondaryKeywords } = activeKeywordsForStrategy(primaryKeywords, searchAgent, secondaryKeywords);
    if (!activePrimaryKeywords.length) {
      console.log(`[executeSearchStrategy] No active primary keywords after filtering, returning empty`);
      return [];
    }
    const candidatesByUuid = /* @__PURE__ */ new Map();
    await collectSearchCandidates(
      candidatesByUuid,
      minTargetResults,
      activePrimaryKeywords,
      searchAgent,
      activeSecondaryKeywords,
      tagRequirement
    );
    const allCandidates = Array.from(candidatesByUuid.values());
    return densitySortedCandidates(allCandidates, primaryKeywords, searchAgent, secondaryKeywords);
  }
  function filterKeywordsContainingMaxedOut(keywords, maxedOutKeywords) {
    if (!maxedOutKeywords || !maxedOutKeywords.length)
      return keywords;
    return keywords.filter((keyword) => {
      const lowerKeyword = keyword.toLowerCase();
      return !maxedOutKeywords.some((maxed) => lowerKeyword.includes(maxed.toLowerCase()));
    });
  }
  async function filterNotesWithBody(keyword, resultNotes) {
    const pattern = new RegExp(`(?:^|\\b|\\s)${keyword}`, "i");
    const eligibleNotes = await resultNotes.filter(async (note) => {
      if (pattern.test(note.name))
        return true;
      return pattern.test(note.bodyContent);
    });
    if (eligibleNotes.length !== resultNotes.length) {
      console.log(`Enforcing presence of "${keyword}" yields ${eligibleNotes.length} eligible notes from ${resultNotes.length} input notes`);
    }
    return eligibleNotes;
  }
  function uniqueUuidNoteCandidatesFromNotes(notes) {
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const note of notes || []) {
      if (!note?.uuid)
        continue;
      if (seen.has(note.uuid))
        continue;
      seen.add(note.uuid);
      unique.push(note);
    }
    return unique;
  }
  function upsertCandidate(candidatesByUuid, isPrimary, noteHandle, queryKeyword) {
    let candidate = candidatesByUuid.get(noteHandle.uuid);
    if (!candidate) {
      candidate = SearchCandidateNote.create(noteHandle);
      candidatesByUuid.set(noteHandle.uuid, candidate);
    }
    candidate.ensureKeywordPreContentScore(isPrimary, queryKeyword);
  }
  function wordsFromMultiWordKeywords(keywords) {
    const allWords = [];
    for (const keyword of keywords) {
      const words = keyword.split(/\s+/).filter((word) => word.length > 0);
      for (const word of words) {
        if (!allWords.includes(word)) {
          allWords.push(word);
        }
      }
    }
    return allWords;
  }

  // lib/functions/search/phase3-criteria-confirm.js
  async function phase3_criteriaConfirm(searchAgent, candidates, criteria) {
    searchAgent.emitProgress("Phase 3: Analyzing top candidates...");
    const preliminaryRanked = rankPreliminary(candidates);
    const topCandidates = preliminaryRanked.slice(0, MAX_DEEP_ANALYZED_NOTES);
    if (!hasDeepAnalysisCriteria(criteria)) {
      console.log("No deep analysis criteria specified, skipping criteria confirmation phase");
      return { validCandidates: topCandidates, allAnalyzed: topCandidates };
    }
    console.log(`Deep analyzing top ${Math.min(MAX_DEEP_ANALYZED_NOTES, candidates.length)} of ${candidates.length} candidates`);
    const deepAnalyzedNotes = await searchAgent.parallelLimit(
      topCandidates.map((note) => () => analyzeNoteCriteriaMatch(note, searchAgent, criteria)),
      MAX_SEARCH_CONCURRENCY
    );
    if (deepAnalyzedNotes.length !== topCandidates.length) {
      if (searchAgent.plugin.constants.isTestEnvironment) {
        throw new Error("Deep analyzed notes count mismatch in test environment");
      } else {
        console.warn("Warning: Deep analyzed notes count mismatch:", { expected: topCandidates.length, actual: deepAnalyzedNotes.length });
      }
    }
    const validCandidates = deepAnalyzedNotes.filter((note) => {
      const { checks } = note;
      const requiredTags = requiredTagsFromTagRequirement(criteria.tagRequirement);
      if (criteria.booleanRequirements.containsPDF && !checks.hasPDF)
        return false;
      if (criteria.booleanRequirements.containsImage && !checks.hasImage)
        return false;
      if (criteria.booleanRequirements.containsURL && !checks.hasURL)
        return false;
      if (criteria.exactPhrase && !checks.hasExactPhrase)
        return false;
      if (requiredTags.length && !checks.hasRequiredTags)
        return false;
      return true;
    });
    console.log(`${validCandidates.length} candidates passed criteria checks among ${candidates.length} candidates`);
    searchAgent.emitProgress(`${validCandidates.length} notes match all criteria`);
    return { validCandidates, allAnalyzed: deepAnalyzedNotes };
  }
  async function analyzeNoteCriteriaMatch(noteCandidate, searchAgent, searchParams) {
    const checks = {};
    const needAttachments = searchParams.booleanRequirements.containsPDF;
    const needImages = searchParams.booleanRequirements.containsImage;
    const requiredTags = requiredTagsFromTagRequirement(searchParams.tagRequirement);
    const fetches = [];
    if (needAttachments) {
      fetches.push(
        searchAgent.app.notes.find(noteCandidate.uuid).then((n) => n.attachments()).then((attachments) => {
          checks.hasPDF = attachments.some((a) => a.type === "application/pdf" || a.name.endsWith(".pdf"));
          checks.attachmentCount = attachments.length;
        })
      );
    }
    if (needImages) {
      fetches.push(
        searchAgent.app.notes.find(noteCandidate.uuid).then((n) => n.images()).then((images) => {
          checks.hasImage = images.length > 0;
          checks.imageCount = images.length;
        })
      );
    }
    if (searchParams.exactPhrase) {
      checks.hasExactPhrase = noteCandidate.bodyContent.includes(searchParams.exactPhrase);
    }
    if (searchParams.criteria.containsURL) {
      checks.hasURL = /https?:\/\/[^\s]+/.test(noteCandidate.bodyContent);
      const urls = noteCandidate.bodyContent.match(/https?:\/\/[^\s]+/g);
      checks.urlCount = urls ? urls.length : 0;
    }
    if (requiredTags.length) {
      const tagCheck = requiredTagCheckFromNoteTags(noteCandidate.tags, requiredTags);
      checks.hasRequiredTags = tagCheck.hasAllRequiredTags;
      checks.missingRequiredTags = tagCheck.missingRequiredTags;
    }
    await Promise.all(fetches);
    noteCandidate.checks = checks;
    return noteCandidate;
  }
  function hasDeepAnalysisCriteria(criteria) {
    const requiredTags = requiredTagsFromTagRequirement(criteria.tagRequirement);
    return criteria.booleanRequirements.containsPDF || criteria.booleanRequirements.containsImage || criteria.booleanRequirements.containsURL || criteria.exactPhrase || requiredTags.length;
  }
  function rankPreliminary(noteCandidates) {
    return [...noteCandidates].sort((a, b) => {
      const densityDiff = (b.keywordDensityEstimate || 0) - (a.keywordDensityEstimate || 0);
      if (densityDiff !== 0)
        return densityDiff;
      const bUpdated = b.updated ? new Date(b.updated).getTime() : 0;
      const aUpdated = a.updated ? new Date(a.updated).getTime() : 0;
      return bUpdated - aUpdated;
    });
  }
  function requiredTagCheckFromNoteTags(noteTags, requiredTags) {
    const normalizedNoteTags = Array.isArray(noteTags) ? noteTags : [];
    const normalizedRequiredTags = (Array.isArray(requiredTags) ? requiredTags : []).map((t) => normalizedTagFromTagName(t)).filter(Boolean);
    const missingRequiredTags = [];
    for (const requiredTag of normalizedRequiredTags) {
      const hasTag = normalizedNoteTags.some((noteTag) => {
        return noteTag === requiredTag || noteTag.startsWith(requiredTag + "/");
      });
      if (!hasTag)
        missingRequiredTags.push(requiredTag);
    }
    return { hasAllRequiredTags: missingRequiredTags.length === 0, missingRequiredTags };
  }

  // lib/functions/search/user-criteria.js
  var UserCriteria = class {
    // --------------------------------------------------------------------------
    constructor(options = {}) {
      this.primaryKeywords = options.primaryKeywords || [];
      this.secondaryKeywords = options.secondaryKeywords || [];
      this.exactPhrase = options.exactPhrase || null;
      this.booleanRequirements = {
        containsPDF: options.criteria?.containsPDF || false,
        containsImage: options.criteria?.containsImage || false,
        containsURL: options.criteria?.containsURL || false
      };
      this.dateFilter = options.dateFilter || null;
      this.tagRequirement = {
        mustHave: options.tagRequirement?.mustHave || null,
        preferred: options.tagRequirement?.preferred || null
      };
      this.resultCount = options.resultCount || 1;
    }
    // --------------------------------------------------------------------------
    // Legacy compatibility: Allow accessing as .criteria for backward compatibility
    // This getter returns the booleanRequirements object when accessing .criteria
    get criteria() {
      return this.booleanRequirements;
    }
    // --------------------------------------------------------------------------
    // Legacy compatibility: Allow setting .criteria
    set criteria(value) {
      this.booleanRequirements = value;
    }
    // --------------------------------------------------------------------------
    // Create a new UserCriteria instance with some fields overridden
    // Useful for retry logic where we want to broaden/narrow search
    withOverrides(overrides = {}) {
      return new UserCriteria({
        primaryKeywords: overrides.primaryKeywords || this.primaryKeywords,
        secondaryKeywords: overrides.secondaryKeywords || this.secondaryKeywords,
        exactPhrase: overrides.exactPhrase !== void 0 ? overrides.exactPhrase : this.exactPhrase,
        criteria: overrides.criteria || this.booleanRequirements,
        dateFilter: overrides.dateFilter !== void 0 ? overrides.dateFilter : this.dateFilter,
        tagRequirement: overrides.tagRequirement || this.tagRequirement,
        resultCount: overrides.resultCount || this.resultCount
      });
    }
    // --------------------------------------------------------------------------
    // Normalize a tag (lowercase with dashes, preserving hierarchical "/" separators)
    // @param {string|Array<string>|null} tag - Tag string or array of tags
    // @returns {string|Array<string>|null} Normalized tag(s)
    static normalizeTag(tag) {
      if (!tag)
        return tag;
      if (Array.isArray(tag)) {
        return tag.map((t) => UserCriteria.normalizeTag(t)).filter(Boolean);
      }
      return normalizedTagFromTagName(tag);
    }
    // --------------------------------------------------------------------------
    // Create UserCriteria from extracted LLM response with manual overrides
    static fromExtracted(extracted, options = {}) {
      const extractedTagReq = {
        mustHave: UserCriteria.normalizeTag(extracted.tagRequirement?.mustHave),
        preferred: UserCriteria.normalizeTag(extracted.tagRequirement?.preferred)
      };
      const optionsTagReq = {
        mustHave: UserCriteria.normalizeTag(options.tagRequirement?.mustHave),
        preferred: UserCriteria.normalizeTag(options.tagRequirement?.preferred)
      };
      return new UserCriteria({
        primaryKeywords: options.primaryKeywords || extracted.primaryKeywords || [],
        secondaryKeywords: options.secondaryKeywords || extracted.secondaryKeywords || [],
        exactPhrase: options.exactPhrase !== void 0 ? options.exactPhrase : extracted.exactPhrase,
        criteria: options.criteria ? { ...extracted.criteria, ...options.criteria } : extracted.criteria,
        dateFilter: options.dateFilter !== void 0 ? options.dateFilter : extracted.dateFilter,
        tagRequirement: { ...extractedTagReq, ...optionsTagReq },
        resultCount: options.resultCount || extracted.resultCount || DEFAULT_SEARCH_NOTES_RETURNED
      });
    }
    // --------------------------------------------------------------------------
    // Convert to JSON for logging/debugging
    toJSON() {
      return {
        primaryKeywords: this.primaryKeywords,
        secondaryKeywords: this.secondaryKeywords,
        exactPhrase: this.exactPhrase,
        booleanRequirements: this.booleanRequirements,
        dateFilter: this.dateFilter,
        tagRequirement: this.tagRequirement,
        resultCount: this.resultCount
      };
    }
  };

  // lib/functions/search/query-breakdown.js
  async function phase1_analyzeQuery(searchAgent, userQuery, options) {
    searchAgent.emitProgress("Phase 1: Analyzing query...");
    const analysisPrompt = `
Analyze this note search query and extract structured search criteria.

User Query: "${userQuery}"

Extract:
1. PRIMARY_KEYWORDS: 3-5 keywords most likely to appear in the note TITLE
   - PREFER two-word pairs or long single words that refer to a distinct concept (e.g., "credit card", "New York", "machine learning", "blood pressure", "chicken soup", "outreach")
   - Use single words only when they are uniquely specific on their own (e.g., "cryptocurrency")
   - Return all keywords in singular form (e.g., "recipe" not "recipes")
   - Examples of GOOD primary keywords: ["credit card", "payment", "annual fee"]
   - Examples of BAD primary keywords: ["credit", "card", "note"] (should be "credit card" and not generic words)

2. SECONDARY_KEYWORDS: 5-10 additional keywords likely in note content
   - Same two-word pair preference applies here
   - Include category terms (e.g., "financial document" for credit card topics, "outreach" or "distribution" for marketing topics)
   - Include synonyms or abbreviations (e.g., "NY" for "New York", "ML" for "machine learning")
   - Include single-word fallbacks from primary keyword phrases to catch partial matches (e.g., if "gift ideas" is user query, include "gift" to catch any notes like "2019 gifts")
   - Return all keywords in singular form (e.g., "document" not "documents")
   - Examples: ["interest rate", "billing cycle", "cash back", "reward point"]
   - Example for "gift ideas" query: ["gift", "birthday", "holiday", "christmas", "shopping list", "wishlist", "wish list"]

3. EXACT_PHRASE: If user wants exact text match, extract it (or null)

4. CRITERIA:
   - containsPDF: Did the user request notes with PDF attachments?
   - containsImage: Did user request notes with images?
   - containsURL: Did the user request notes with web links?

5. DATE_FILTER:
   - type: "created" or "updated" (or null if no date mentioned)
   - after: ISO date string (YYYY-MM-DD) for earliest date

6. TAG_REQUIREMENT:
   - mustHave: Tag that MUST be present (null if none required)
   - preferred: Tag that's PREFERRED but not required (null if none)

Return ONLY valid JSON:
{
  "primaryKeywords": ["two word", "keyword pair", "single"],
  "secondaryKeywords": ["related phrase", "synonym pair", "category term"],
  "exactPhrase": null,
  "criteria": {
    "containsPDF": false,
    "containsImage": false,
    "containsURL": false
  },
  "dateFilter": null,
  "tagRequirement": {
    "mustHave": null,
    "preferred": null
  },
}
`;
    const validateCriteria = (result) => {
      return result?.primaryKeywords && Array.isArray(result.primaryKeywords) && result.primaryKeywords.length;
    };
    const extracted = await searchAgent.llmWithRetry(analysisPrompt, validateCriteria, { jsonResponse: true });
    console.log("Extracted criteria:", extracted);
    if (!extracted.secondaryKeywords)
      extracted.secondaryKeywords = [];
    if (!extracted.criteria)
      extracted.criteria = { containsPDF: false, containsImage: false, containsURL: false };
    if (!extracted.tagRequirement)
      extracted.tagRequirement = { mustHave: null, preferred: null };
    return UserCriteria.fromExtracted(extracted, options);
  }

  // lib/functions/search-agent.js
  var MAX_SEARCH_AGENT_LLM_QUERY_RETRIES = 3;
  var SearchAgent = class {
    // --------------------------------------------------------------------------
    constructor(app, plugin2) {
      this.app = app;
      this.lastModelUsed = null;
      this.llm = this._llmWithSearchPreference;
      this.maxedOutKeywords = /* @__PURE__ */ new Set();
      this.maxRetries = ATTEMPT_STRATEGIES.length - 1;
      this.preferredAiModel = null;
      this.plugin = plugin2;
      this.progressCallback = null;
      this.ratedNoteUuids = /* @__PURE__ */ new Set();
      this.retryCount = 0;
      this.searchAttempt = ATTEMPT_FIRST_PASS;
    }
    // --------------------------------------------------------------------------
    // Main search entry point
    // @param {string} userQuery - The search query (50-5000 words)
    // @param {Object} options - Optional overrides for search criteria
    // @param {string[]} [options.primaryKeywords] - 3-5 primary keywords to search in note titles
    // @param {string[]} [options.secondaryKeywords] - 5-10 secondary keywords for content search
    // @param {string} [options.exactPhrase] - Exact phrase that must appear in note content
    // @param {Object} [options.criteria] - Hard requirements for notes
    // @param {boolean} [options.criteria.containsPDF] - Note must have PDF attachments
    // @param {boolean} [options.criteria.containsImage] - Note must have images
    // @param {boolean} [options.criteria.containsURL] - Note must have web links
    // @param {Object} [options.dateFilter] - Filter by creation or update date
    // @param {string} [options.dateFilter.type] - "created" or "updated"
    // @param {string} [options.dateFilter.after] - ISO date string (YYYY-MM-DD) for earliest date
    // @param {Object} [options.tagRequirement] - Tag filtering requirements
    // @param {string|Array<string>} [options.tagRequirement.mustHave] - Tag(s) that MUST be present
    // @param {string} [options.tagRequirement.preferred] - Tag that is PREFERRED but not required (normalized to lowercase with dashes)
    // @param {number} [options.resultCount=1] - Number of results to return (1 for single best match, N for top N)
    // @returns {Promise<SearchResult>} Search result with found notes, confidence scores, and summary note
    async search(userQuery, { criteria = {}, options = {} } = {}) {
      try {
        this.emitProgress("Starting search analysis...");
        const searchCriteria = Object.keys(criteria).length ? criteria : await phase1_analyzeQuery(this, userQuery, options);
        const candidates = await phase2_collectCandidates(this, searchCriteria);
        if (candidates.length === 0) {
          return this.handleNoResults(searchCriteria);
        }
        const { validCandidates, allAnalyzed } = await phase3_criteriaConfirm(this, candidates, searchCriteria);
        let rankedNotes;
        if (validCandidates.length === 0 && this.retryCount < this.maxRetries) {
          return this.nextSearchAttempt(userQuery, searchCriteria);
        } else if (validCandidates.length === 0 && allAnalyzed.length) {
          console.log("No perfect matches found, using partial matches");
          rankedNotes = await phase4_scoreAndRank(this, allAnalyzed, searchCriteria, userQuery);
        } else if (validCandidates.length) {
          rankedNotes = await phase4_scoreAndRank(this, validCandidates, searchCriteria, userQuery);
        } else {
          rankedNotes = [];
        }
        const finalResult = await phase5_sanityCheck(this, rankedNotes, searchCriteria, userQuery);
        this.emitProgress(`Creating search summary note for ${pluralize(finalResult.notes.length, "result")}...`);
        const summaryNote = await createSearchSummaryNote(this, finalResult, searchCriteria, userQuery);
        if (summaryNote) {
          finalResult.summaryNote = summaryNote;
          this.emitProgress(`Created search summary note: <a href="${summaryNote.url}">${summaryNote.name}</a>`);
        }
        return finalResult;
      } catch (error) {
        console.error("Caught error during search:", error);
        this.emitProgress(`Error attempting to retrieve AI search results: "${error}"`);
        return {
          found: false,
          error: error.message,
          suggestions: []
        };
      }
    }
    // --------------------------------------------------------------------------
    emitProgress(message) {
      if (this.progressCallback) {
        this.progressCallback(message);
      }
      this.app.openEmbed();
      this.app.context.updateEmbedArgs = { lastSearchAgentMessage: message };
      console.log(`[SearchAgent#emitProgress] ${message}`);
    }
    // --------------------------------------------------------------------------
    // Format the final search result object
    //
    // @param {boolean} found - Whether a conclusive match was found
    // @param {Array<SearchCandidateNote>} rankedNotes - Array of ranked SearchCandidateNote instances
    // @param {number} resultCount - Number of results requested
    // @returns {Object} Result object with confidence, found status, resultSummary, and notes array
    formatResult(found, rankedNotes, resultCount) {
      const bestMatch = rankedNotes[0];
      const noteResults = rankedNotes.slice(0, resultCount);
      if (bestMatch) {
        return {
          confidence: bestMatch.finalScore,
          found,
          maxResultCount: resultCount,
          notes: noteResults,
          resultSummary: `Found ${pluralize(rankedNotes.length, "note")}${found ? " matching" : ", none that quite match"} your criteria${rankedNotes.length > resultCount ? ` (showing top ${resultCount}, given your input criteria)` : ""}.`
        };
      } else {
        return {
          confidence: 0,
          found,
          maxResultCount: resultCount,
          notes: [],
          resultSummary: "Could not find any notes matching your criteria"
        };
      }
    }
    // --------------------------------------------------------------------------
    // Handle no results found
    handleNoResults(criteria) {
      return {
        criteria,
        found: false,
        maxResultCount: criteria.resultCount,
        notes: [],
        resultSummary: "No notes found matching your criteria",
        suggestion: "Try removing some filters or using broader search terms"
      };
    }
    // --------------------------------------------------------------------------
    // Helper: Query LLM with retry across different models until valid response
    async llmWithRetry(prompt, validateCallback, options = {}) {
      const models = this._modelsToTryFromPreference();
      const maxAttempts = Math.min(models.length, MAX_SEARCH_AGENT_LLM_QUERY_RETRIES);
      for (let i = 0; i < maxAttempts; i++) {
        const aiModel = models[i];
        console.log(`LLM attempt ${i + 1} with model ${aiModel}`);
        try {
          this.lastModelUsed = aiModel;
          if (this.plugin)
            this.plugin.lastModelUsed = aiModel;
          const result = await this.llm(prompt, { ...options, aiModel });
          if (validateCallback(result)) {
            console.log("LLM response successfully passes validation callback");
            return result;
          } else {
            this.emitProgress(`Response from "${aiModel}" failed validation, ${i + 1 < maxAttempts ? "retrying" : "no other available models to try"}...`);
          }
        } catch (error) {
          console.error(`LLM attempt ${i + 1} failed:`, error);
        }
      }
      throw new Error("Failed to get valid response from LLM after multiple attempts");
    }
    // --------------------------------------------------------------------------
    // Wrap llmPrompt to always respect SearchAgent's preferred model unless an explicit model is provided.
    // @param {object} app - Amplenote app object
    // @param {object} plugin - Plugin instance
    // @param {string} prompt - Prompt text
    // @param {object} [options] - Options passed to llmPrompt
    async _llmWithSearchPreference(prompt, options = {}) {
      const mergedOptions = { ...options };
      const aiModelExplicitlyProvided = Object.prototype.hasOwnProperty.call(mergedOptions, "aiModel");
      if ((!aiModelExplicitlyProvided || !mergedOptions.aiModel) && this.preferredAiModel) {
        mergedOptions.aiModel = this.preferredAiModel;
      }
      const result = await llmPrompt(this.app, this.plugin, prompt, mergedOptions);
      if (mergedOptions.aiModel) {
        this.lastModelUsed = mergedOptions.aiModel;
        if (this.plugin)
          this.plugin.lastModelUsed = mergedOptions.aiModel;
      }
      return result;
    }
    // --------------------------------------------------------------------------
    // @returns {string[]} Ordered LLM model names to try, based on user preference, with the model chosen for search placed in front if available
    _modelsToTryFromPreference() {
      const models = preferredModels(this.app) || [];
      if (!this.preferredAiModel)
        return models;
      const withoutPreferred = models.filter((model) => model !== this.preferredAiModel);
      return [this.preferredAiModel, ...withoutPreferred];
    }
    // --------------------------------------------------------------------------
    // Retry with broader search criteria
    async nextSearchAttempt(userQuery, criteria) {
      this.retryCount++;
      if (this.retryCount === 1) {
        this.searchAttempt = ATTEMPT_INDIVIDUAL;
        console.log("Retrying with individual keyword strategy...");
        this.emitProgress("Retrying with individual keywords...");
      }
      return this.search(userQuery, { criteria });
    }
    // --------------------------------------------------------------------------
    onProgress(callback) {
      this.progressCallback = callback;
    }
    // --------------------------------------------------------------------------
    // Helper: Parallel execution with concurrency limit
    async parallelLimit(tasks, limit) {
      const results = [];
      const executing = [];
      for (const task of tasks) {
        const promise = task().then((result) => {
          executing.splice(executing.indexOf(promise), 1);
          return result;
        });
        results.push(promise);
        executing.push(promise);
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
      return Promise.all(results);
    }
    // --------------------------------------------------------------------------
    // Persist the user's preferred model choice onto the SearchAgent instance so every phase uses it.
    // @param {string|null} aiModel - AI model name (e.g. "gpt-5.1") or null to clear
    setPreferredAiModel(aiModel) {
      this.preferredAiModel = aiModel;
    }
    // --------------------------------------------------------------------------
    // Record keywords that have hit the MAX_CANDIDATES_PER_KEYWORD limit.
    // These keywords will be excluded from future search attempts.
    //
    // @param {Array<string>} keywords - Keywords to add to the maxed-out set
    recordMaxedOutKeywords(keywords) {
      for (const keyword of keywords || []) {
        this.maxedOutKeywords.add(keyword.toLowerCase());
      }
    }
    // --------------------------------------------------------------------------
    // Record note UUIDs that have been rated by the LLM.
    // These UUIDs will be excluded from future rating requests.
    //
    // @param {Array<string>} uuids - Note UUIDs to add to the rated set
    recordRatedNoteUuids(uuids) {
      for (const uuid of uuids || []) {
        this.ratedNoteUuids.add(uuid);
      }
    }
    // --------------------------------------------------------------------------
    summaryNoteTag() {
      const userSpecifiedTag = this.app.settings[SEARCH_AGENT_RESULT_TAG_LABEL]?.length;
      if (userSpecifiedTag) {
        const normalizedTag = normalizedTagFromTagName(userSpecifiedTag);
        if (userSpecifiedTag !== normalizedTag) {
          this.emitProgress(`Adjusting search summary tag input from "${userSpecifiedTag}" to "${normalizedTag}"`);
          this.app.setSetting(SEARCH_AGENT_RESULT_TAG_LABEL, normalizedTag);
        }
        if (["no", "none", "null"].includes(normalizedTag)) {
          this.emitProgress(`User requested no tag on search summary note ("${normalizedTag}")`);
          return null;
        } else {
          return normalizedTag;
        }
      } else {
        return RESULT_TAG_DEFAULT;
      }
    }
  };

  // lib/functions/search-prompts.js
  async function userSearchCriteria(app) {
    const configuredProviderEms = configuredProvidersSorted(app.settings || {});
    const configuredProviderNames = configuredProviderEms.map((providerEm2) => providerNameFromProviderEm(providerEm2));
    const actions = actionsForConfiguredProviders(configuredProviderEms);
    const promptText = configuredProviderNames.length ? `Enter your search criteria

Configured LLM providers: ${configuredProviderNames.join(", ")}

Tip: use a button below to run the search with a specific provider.` : "Enter your search criteria";
    const promptOptions = {
      inputs: [
        { type: "text", label: "Describe any identifying details of the note(s) you wish to locate" },
        { type: "date", label: "Only notes created or changed since (optional)" },
        { type: "tags", label: "Only return notes with this tag (optional)" },
        { type: "string", label: "Max notes to return (optional)" }
      ]
    };
    if (actions.length) {
      promptOptions.actions = actions;
    }
    const result = await app.prompt(promptText, promptOptions);
    if (!result)
      return null;
    const [userQuery, changedSince, onlyTags, maxNotesCount, actionResult] = Array.isArray(result) ? result : [result];
    const providerEm = typeof actionResult === "string" ? actionResult : null;
    const preferredAiModel = providerEm ? modelForProvider(app.settings?.[AI_MODEL_LABEL], providerEm) : null;
    const maxNotesCountNumber = positiveIntegerFromValue(maxNotesCount);
    return [userQuery, changedSince, onlyTags, maxNotesCountNumber, preferredAiModel];
  }
  function actionsForConfiguredProviders(configuredProviderEms) {
    return configuredProviderEms.map((providerEm) => ({
      icon: "search",
      label: `Search with ${providerNameFromProviderEm(providerEm)}`,
      value: providerEm
    }));
  }
  function positiveIntegerFromValue(value) {
    if (value === void 0 || value === null)
      return null;
    const parsed = parseInt(String(value).trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  // lib/render-embed.js
  function renderPluginEmbed(app, plugin2, renderArguments) {
    return `
    <html lang="en">
      <head>
        <style>
          body {
            background-color: #fff;
            color: #333;
            padding: 10px;
          }
          
          .plugin-embed-container {
            font-family: "Roboto", sans-serif;
          }
        </style>
      </head>
      <body>
        <div class="plugin-embed-container" 
          data-args="${typeof renderArguments === "object" ? JSON.stringify(renderArguments) : renderArguments}" 
          data-rendered-at="${(/* @__PURE__ */ new Date()).toISOString()}"
        >
          ${plugin2.progressText}
        </div>
      </body>
    </html>
  `;
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
    progressText: "",
    // --------------------------------------------------------------------------
    appOption: {
      // --------------------------------------------------------------------------
      [ADD_PROVIDER_API_KEY_LABEL]: async function(app) {
        const preferredModels2 = await aiModelFromUserIntervention(this, app, { defaultProvider: null });
        if (preferredModels2?.length) {
          app.alert(`\u2705 Successfully added API key!${preferredModels2?.length > 1 ? `

Preferred models are now set to "${preferredModels2.join(`", "`)}".` : ""}`);
        }
      },
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
      [SEARCH_USING_AGENT_LABEL]: async function(app) {
        const searchAgent = new SearchAgent(app, this);
        const result = await userSearchCriteria(app);
        if (!result)
          return;
        const [userQuery, changedSince, onlyTags, maxNotesCount, preferredAiModel] = result;
        console.log(`Search criteria received: query="${userQuery}", changedSince=${changedSince}, onlyTags=${onlyTags}, maxNotesCount=${maxNotesCount || `(unspecified, so ${DEFAULT_SEARCH_NOTES_RETURNED})`}, preferredAiModel=${preferredAiModel}`);
        if (!userQuery?.length)
          return;
        this.progressText = "";
        searchAgent.onProgress((progressText) => {
          this.progressText += `${progressText}<br /><br />`;
        });
        if (preferredAiModel) {
          searchAgent.setPreferredAiModel(preferredAiModel);
        }
        searchAgent.emitProgress(`Starting search for user query: "${userQuery}" with ${preferredAiModel ? `preferred AI model "${preferredAiModel}"` : "no preferred AI model"}. ` + (changedSince ? `Filtering to notes changed since ${changedSince}. ` : "") + (onlyTags?.length ? `Filtering to notes with tags: ${onlyTags.join(", ")}. ` : "") + (maxNotesCount ? `Limiting to ${maxNotesCount} notes. ` : `Returning up to ${DEFAULT_SEARCH_NOTES_RETURNED} notes. `));
        await app.openEmbed();
        await searchAgent.search(userQuery, { options: {
          dateFilter: { after: changedSince },
          resultCount: maxNotesCount || DEFAULT_SEARCH_NOTES_RETURNED,
          tagRequirement: { mustHave: onlyTags }
        } });
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
        const [instruction, userPickedModel] = await app.prompt(QUESTION_ANSWER_PROMPT, {
          inputs: [
            { type: "text", label: "Question", placeholder: "What's the meaning of life in 500 characters or less?" },
            {
              type: "radio",
              label: `AI Model${this.lastModelUsed ? `. Defaults to last used` : ""}`,
              options,
              value: preferredModel(app, this.lastModelUsed)
            }
          ]
        });
        console.debug("Instruction", instruction, "preferredModel", userPickedModel);
        if (!instruction)
          return;
        if (userPickedModel)
          aiModels = [userPickedModel].concat(aiModels.filter((model) => model !== userPickedModel));
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
        await initiateChat(this, app);
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
        const apiKey = await apiKeyFromAppOrUser(app, "openai");
        if (apiKey) {
          await imageFromPreceding(this, app, apiKey);
        }
      },
      // --------------------------------------------------------------------------
      [IMAGE_FROM_PROMPT_LABEL]: async function(app) {
        const apiKey = await apiKeyFromAppOrUser(app, "openai");
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
    async renderEmbed(app, ...args) {
      return renderPluginEmbed(app, this, args);
    },
    // --------------------------------------------------------------------------
    // Private methods
    // --------------------------------------------------------------------------
    // --------------------------------------------------------------------------
    // Waypoint between the oft-visited notePromptResponse, and various actions that might want to insert the
    // AI response through a variety of paths
    // @param {object} promptKeyParams - Basic instructions from promptKey to help generate user messages
    async _noteOptionResultPrompt(app, noteUUID, promptKey, promptKeyParams, { preferredModels: preferredModels2 = null } = {}) {
      let aiResponse = await notePromptResponse(
        this,
        app,
        noteUUID,
        promptKey,
        promptKeyParams,
        { preferredModels: preferredModels2, confirmInsert: false }
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
            const aiModel = preferredModel(app, this.lastModelUsed);
            const promptParams = await contentfulPromptParams(app, noteUUID, promptKey, promptKeyParams, aiModel);
            const systemUserMessages = promptsFromPromptKey(promptKey, promptParams, [], aiModel);
            const messages = systemUserMessages.concat({ role: "assistant", content: trimmedResponse });
            return await initiateChat(this, app, preferredModels2?.length ? preferredModels2 : [aiModel], messages);
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
        const model = preferredModel(app, this.lastModelUsed);
        const providerEm = providerFromModel(model);
        const followUp = apiKeyFromApp(app, providerEm)?.length ? `Consider adding ${providerEm} API key to your plugin settings?` : "Try again?";
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
