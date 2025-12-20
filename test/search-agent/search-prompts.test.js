import { AI_MODEL_LABEL, PROVIDER_SETTING_KEY_LABELS } from "constants/settings.js"
import { MIN_API_KEY_CHARACTERS } from "constants/provider.js"
import { userSearchCriteria } from "functions/search-prompts.js"
import { configuredProvidersSorted, modelForProvider } from "providers/ai-provider-settings"
import { mockApp } from "../test-helpers.js"

// --------------------------------------------------------------------------------------
describe("userSearchCriteria", () => {
  // --------------------------------------------------------------------------------------
  it("should offer action buttons for configured providers and return preferred model when pressed", async () => {
    const app = mockApp(null);
    app.settings[AI_MODEL_LABEL] = "claude-sonnet-4-5";

    const configuredProviders = configuredProvidersSorted(app.settings || {});
    let chosenProvider = configuredProviders[configuredProviders.length - 1];

    app.prompt.mockImplementation(async (_text, options) => {
      expect(options.actions.length).toBe(configuredProviders.length);
      return [ "find my note", null, null, "3", chosenProvider ];
    });

    const [ userQuery, changedSince, onlyTags, maxNotesCount, preferredAiModel ] = await userSearchCriteria(app);
    expect(userQuery).toBe("find my note");
    expect(changedSince).toBeNull();
    expect(onlyTags).toBeNull();
    expect(maxNotesCount).toBe(3);
    expect(preferredAiModel).toBe(modelForProvider(app.settings?.[AI_MODEL_LABEL], chosenProvider));
  });

  // --------------------------------------------------------------------------------------
  it("should return null preferred model when user submits (no action pressed)", async () => {
    const app = mockApp(null);
    const openAiKeyLabel = PROVIDER_SETTING_KEY_LABELS.openai;
    const openAiKey = "x".repeat(MIN_API_KEY_CHARACTERS.openai + 1);
    app.settings[openAiKeyLabel] = openAiKey;

    app.prompt.mockResolvedValue([ "find my note", null, null, null, -1 ]);

    const [ _userQuery, _changedSince, _onlyTags, _maxNotesCount, preferredAiModel ] = await userSearchCriteria(app);
    expect(preferredAiModel).toBeNull();
  });
});
