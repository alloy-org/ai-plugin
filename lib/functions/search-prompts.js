
// --------------------------------------------------------------------------
import { AI_MODEL_LABEL } from "constants/settings"
import { configuredProvidersSorted, modelForProvider, providerNameFromProviderEm } from "providers/ai-provider-settings"

// --------------------------------------------------------------------------
// Prompt the user for search criteria, and optionally let them invoke search using a specific LLM
// provider via bottom-of-dialog action buttons.
//
// Uses Amplenote `app.prompt` "actions" buttons (see downloaded docs in `tmp/amplenote-plugin-api.md`).
//
// @param {object} app - Amplenote app instance
// @returns {Promise<[string, (number|null), (string|null), (number|null), (string|null)]|null>}
//   Tuple: [userQuery, changedSinceUnixSeconds, onlyTags, maxNotesCount, preferredAiModel]
export async function userSearchCriteria(app) {
  const configuredProviderEms = configuredProvidersSorted(app.settings || {});
  const configuredProviderNames = configuredProviderEms.map(providerEm => providerNameFromProviderEm(providerEm));
  const actions = actionsForConfiguredProviders(configuredProviderEms);

  const promptText = configuredProviderNames.length
    ? `Enter your search criteria\n\nConfigured LLM providers: ${ configuredProviderNames.join(", ") }\n\n` +
      `Tip: use a button below to run the search with a specific provider.`
    : "Enter your search criteria";

  const promptOptions = {
    inputs: [
      { type: "text", label: "Describe any identifying details of the note(s) you wish to locate" },
      { type: "date", label: "Only notes created or changed since (optional)" },
      { type: "tags", label: "Only return notes with this tag (optional)" },
      { type: "string", label: "Max notes to return (optional)" },
    ],
  };
  if (actions.length) {
    promptOptions.actions = actions;
  }

  const result = await app.prompt(promptText, promptOptions);
  if (!result) return null;

  const [ userQuery, changedSince, onlyTags, maxNotesCount, actionResult ] = Array.isArray(result) ? result : [ result ];
  const providerEm = (typeof actionResult === "string") ? actionResult : null;
  const preferredAiModel = providerEm ? modelForProvider(app.settings?.[AI_MODEL_LABEL], providerEm) : null;
  const maxNotesCountNumber = positiveIntegerFromValue(maxNotesCount);

  return [ userQuery, changedSince, onlyTags, maxNotesCountNumber, preferredAiModel ];
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// @param {string[]} configuredProviderEms - Provider identifiers with configured API keys
// @returns {Array<{icon?: string, label: string, value: string}>} actions for app.prompt
function actionsForConfiguredProviders(configuredProviderEms) {
  return configuredProviderEms.map(providerEm => ({
    icon: "search",
    label: `Search with ${ providerNameFromProviderEm(providerEm) }`,
    value: providerEm,
  }));
}

// --------------------------------------------------------------------------
// @param {unknown} value - Any value the user might enter for a max count
// @returns {number|null} A positive integer or null if not parseable
function positiveIntegerFromValue(value) {
  if (value === undefined || value === null) return null;
  const parsed = parseInt(String(value).trim(), 10);
  return (Number.isInteger(parsed) && parsed > 0) ? parsed : null;
}
