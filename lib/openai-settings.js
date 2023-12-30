import { OPENAI_API_KEY_TEXT } from "./constants/prompt-strings"

// --------------------------------------------------------------------------
export async function apiKeyFromAppOrUser(plugin, app) {
  const apiKey = apiKeyFromApp(plugin, app) || await apiKeyFromUser(plugin, app);
  if (!apiKey) {
    app.alert("Couldn't find a valid OpenAI API key. An OpenAI account is necessary to generate images.");
    return null;
  }
  return apiKey;
}

// --------------------------------------------------------------------------
export function apiKeyFromApp(plugin, app) {
  if (app.settings[plugin.constants.labelApiKey]) {
    return app.settings[plugin.constants.labelApiKey].trim();
  } else if (app.settings["API Key"]) { // Legacy setting name
    const deprecatedKey = app.settings["API Key"].trim();
    app.setSetting(plugin.constants.labelApiKey, deprecatedKey)
    return deprecatedKey;
  } else {
    if (plugin.constants.isTestEnvironment) {
      throw new Error(`Couldnt find an OpenAI key in ${ plugin.constants.labelApiKey }`);
    } else {
      app.alert("Please configure your OpenAI key in plugin settings.");
    }
    return null;
  }
}

// --------------------------------------------------------------------------
export async function apiKeyFromUser(plugin, app) {
  const apiKey = await app.prompt(OPENAI_API_KEY_TEXT);
  if (apiKey) {
    app.setSetting(plugin.constants.labelApiKey, apiKey);
  }
  return apiKey;
}
