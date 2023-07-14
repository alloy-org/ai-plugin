import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote } from "./test-helpers.js"

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin._testEnvironment = true;

  it("should offer expression commands", () => {
    expect(plugin.insertText["Answer"]).toBeDefined();
    expect(plugin.insertText["Complete"]).toBeDefined();
    expect(plugin.insertText["Continue"]).toBeDefined();
  })

  // --------------------------------------------------------------------------------------
  it("should make a call to OpenAI", async () => {
    const content = `To be, or not to be, that is the {${ plugin.constants.pluginName }: Continue}`;
    const note = mockNote(content, "Baby's plugin", "abc123");
    const app = mockApp(note);

    app.notes.find.mockReturnValue(note);
    await plugin.insertText["Continue"](app);

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(note.body).toBe("question.");
  });
});
