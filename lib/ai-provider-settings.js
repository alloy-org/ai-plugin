import { OPENAI_API_KEY_TEXT } from "./constants/prompt-strings"
import { AI_LEGACY_MODEL_LABEL, settingKeyLabel } from "./constants/settings"

// --------------------------------------------------------------------------
export async function apiKeyFromAppOrUser(plugin, app, providerEm) {
  const apiKey = apiKeyFromApp(plugin, app, providerEm) || await apiKeyFromUser(plugin, app, providerEm);
  if (!apiKey) {
    app.alert("Couldn't find a valid OpenAI API key. An OpenAI account is necessary to generate images.");
    return null;
  }
  return apiKey;
}

// --------------------------------------------------------------------------
export function apiKeyFromApp(plugin, app, providerEm) {
  const providerKeyLabel = settingKeyLabel(providerEm);
  if (app.settings[providerKeyLabel]) {
    return app.settings[providerKeyLabel].trim();
  } else if (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]) { // Legacy setting name
    const deprecatedKey = (app.settings["API Key"] || app.settings[AI_LEGACY_MODEL_LABEL]).trim();
    app.setSetting(settingKeyLabel("openai"), deprecatedKey);
    return deprecatedKey;
  } else {
    if (plugin.constants.isTestEnvironment) {
      throw new Error(`Couldnt find a ${ providerEm } key in ${ app.settings }`);
    } else {
      app.alert("Please configure your OpenAI key in plugin settings.");
    }
    return null;
  }
}

// --------------------------------------------------------------------------
export async function apiKeyFromUser(plugin, app, providerEm) {
  const apiKey = await app.prompt(OPENAI_API_KEY_TEXT);
  if (apiKey) {
    app.setSetting(settingKeyLabel(providerEm), apiKey);
  }
  return apiKey;
}
