import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote } from "./test-helpers.js"

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin._testEnvironment = true;
  const app = mockApp();

  it("should offer expression commands", () => {
    expect(plugin.insertText["Answer"]).toBeDefined();
    expect(plugin.insertText["Complete"]).toBeDefined();
    expect(plugin.insertText["Continue"]).toBeDefined();

  })

  // --------------------------------------------------------------------------------------
  it("should make a call to OpenAI", async () => {
    app.notes.find.mockReturnValue({
      content: () => `To be, or not to be, that is the {${ plugin.constants.pluginName }: Continue}.`
    });
    const result = await plugin.insertText["Continue"](app);
    expect(result).toBe("question.");
  });
});
