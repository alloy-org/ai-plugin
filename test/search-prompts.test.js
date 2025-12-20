import { AI_MODEL_LABEL, PROVIDER_SETTING_KEY_LABELS } from "constants/settings"
import { PROVIDER_DEFAULT_MODEL, MIN_API_KEY_CHARACTERS } from "constants/provider"
import { userSearchCriteria } from "functions/search-prompts"
import { mockApp } from "./test-helpers"

// --------------------------------------------------------------------------------------
describe("userSearchCriteria", () => {
  // --------------------------------------------------------------------------------------
  it("should offer action buttons for configured providers and return preferred model when pressed", async () => {
    const app = mockApp(null);
    app.settings[AI_MODEL_LABEL] = "claude-sonnet-4-5";

    const openAiKeyLabel = PROVIDER_SETTING_KEY_LABELS.openai;
    const openAiKey = "x".repeat(MIN_API_KEY_CHARACTERS.openai + 1);
    app.settings[openAiKeyLabel] = openAiKey;

    app.prompt.mockImplementation(async (_text, options) => {
      expect(options.actions.length).toBe(1);
      expect(options.actions[0].value).toBe("openai");
      return [ "find my note", null, null, "3", "openai" ];
    });

    const [ userQuery, changedSince, onlyTags, maxNotesCount, preferredAiModel ] = await userSearchCriteria(app);
    expect(userQuery).toBe("find my note");
    expect(changedSince).toBeNull();
    expect(onlyTags).toBeNull();
    expect(maxNotesCount).toBe(3);
    expect(preferredAiModel).toBe(PROVIDER_DEFAULT_MODEL.openai);
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


