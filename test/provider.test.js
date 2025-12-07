import { ADD_PROVIDER_API_KEY_LABEL, PROVIDER_SETTING_KEY_LABELS } from "../lib/constants/settings"
import { MIN_API_KEY_CHARACTERS, REMOTE_AI_PROVIDER_EMS } from "../lib/constants/provider"
import { jest } from "@jest/globals"
import { mockApp, mockPlugin } from "./test-helpers"

// --------------------------------------------------------------------------------------
describe("Add Provider API key", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  // --------------------------------------------------------------------------------------
  // Test helper to create a mock API key of valid length for a provider
  function createMockApiKey(providerEm) {
    const minLength = MIN_API_KEY_CHARACTERS[providerEm];
    return "x".repeat(minLength);
  }

  // --------------------------------------------------------------------------------------
  it("should save API keys for all remote AI providers", async () => {
    for (const providerEm of REMOTE_AI_PROVIDER_EMS) {
      const app = mockApp();
      const mockApiKey = createMockApiKey(providerEm);

      app.prompt.mockImplementation(async (prompt, options) => {
        // First prompt: select provider
        if (options?.inputs?.[0]?.options) {
          return providerEm;
        }
        // Second prompt: enter API key
        return mockApiKey;
      });

      await plugin.appOption[ADD_PROVIDER_API_KEY_LABEL](app);

      expect(app.setSetting).toHaveBeenCalledWith(
        PROVIDER_SETTING_KEY_LABELS[providerEm],
        mockApiKey
      );
    }
  });

  // --------------------------------------------------------------------------------------
  it("should save multiple API keys when called multiple times", async () => {
    const app = mockApp();
    const providersToTest = ["openai", "anthropic", "gemini"];

    for (const providerEm of providersToTest) {
      const mockApiKey = createMockApiKey(providerEm);

      app.prompt.mockImplementation(async (prompt, options) => {
        if (options?.inputs?.[0]?.options) {
          return providerEm;
        }
        return mockApiKey;
      });

      await plugin.appOption[ADD_PROVIDER_API_KEY_LABEL](app);
    }

    // Verify all three providers were saved
    for (const providerEm of providersToTest) {
      const settingKey = PROVIDER_SETTING_KEY_LABELS[providerEm];
      expect(app.settings[settingKey]).toBeDefined();
      expect(app.settings[settingKey].length).toBeGreaterThanOrEqual(MIN_API_KEY_CHARACTERS[providerEm]);
    }

    // Verify setSetting was called the correct number of times
    expect(app.setSetting).toHaveBeenCalledTimes(providersToTest.length);
  });

  // --------------------------------------------------------------------------------------
  it("should show configured providers with checkmark indicator", async () => {
    const app = mockApp();

    // Clear all provider keys and manually configure only OpenAI
    for (const providerEm of REMOTE_AI_PROVIDER_EMS) {
      delete app.settings[PROVIDER_SETTING_KEY_LABELS[providerEm]];
    }
    const openaiKey = createMockApiKey("openai");
    app.settings[PROVIDER_SETTING_KEY_LABELS.openai] = openaiKey;

    let capturedOptions = null;

    app.prompt.mockImplementation(async (prompt, options) => {
      if (options?.inputs?.[0]?.options) {
        capturedOptions = options;
        return "deepseek"; // Choose a provider that isn't configured
      }
      return createMockApiKey("deepseek");
    });

    await plugin.appOption[ADD_PROVIDER_API_KEY_LABEL](app);

    // Verify OpenAI option has setup indicator (was pre-configured)
    const openaiOption = capturedOptions.inputs[0].options.find(opt => opt.value === "openai");
    expect(openaiOption.label).toContain("✅ Setup");

    // Verify DeepSeek option does not have setup indicator (wasn't configured when prompt was shown)
    const deepseekOption = capturedOptions.inputs[0].options.find(opt => opt.value === "deepseek");
    expect(deepseekOption.label).not.toContain("✅ Setup");
  });

  // --------------------------------------------------------------------------------------
  it("should allow retry when user provides invalid key", async () => {
    const app = mockApp();
    const shortApiKey = "sk-short"; // Too short
    const validApiKey = createMockApiKey("openai");
    let attemptCount = 0;

    app.prompt.mockImplementation(async (prompt, options) => {
      if (options?.inputs?.[0]?.options) {
        return "openai";
      }
      // API key entry
      attemptCount++;
      return attemptCount === 1 ? shortApiKey : validApiKey;
    });

    app.alert.mockImplementation(async (text, options) => {
      // When invalid key alert is shown, choose to retry
      if (options?.actions?.[0]?.label?.toLowerCase().includes("retry")) {
        return 0; // Click retry action
      }
      return null;
    });

    await plugin.appOption[ADD_PROVIDER_API_KEY_LABEL](app);

    // Should have been called twice - once with invalid, once with valid
    expect(attemptCount).toBe(2);
    expect(app.setSetting).toHaveBeenCalledWith(
      PROVIDER_SETTING_KEY_LABELS.openai,
      validApiKey
    );
  });

  // --------------------------------------------------------------------------------------
  it("should handle Ollama selection without saving API key", async () => {
    const app = mockApp();

    app.prompt.mockImplementation(async (prompt, options) => {
      if (options?.inputs?.[0]?.options) {
        return "ollama";
      }
    });

    await plugin.appOption[ADD_PROVIDER_API_KEY_LABEL](app);

    // Should show Ollama installation instructions
    expect(app.alert).toHaveBeenCalled();

    // Should not call setSetting for Ollama
    expect(app.setSetting).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------------------
  it("should use ADD_PROVIDER_API_KEY_LABEL constant", () => {
    // Verify the constant is defined and used correctly
    expect(ADD_PROVIDER_API_KEY_LABEL).toBe("Add Provider API key");
    expect(plugin.appOption[ADD_PROVIDER_API_KEY_LABEL]).toBeDefined();
    expect(typeof plugin.appOption[ADD_PROVIDER_API_KEY_LABEL]).toBe("function");
  });
});
