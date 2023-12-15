import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote } from "./test-helpers.js"

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin._testEnvironment = true;

  it("should offer expression commands", () => {
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
    expect(note.body).toContain("question");
  });

  // --------------------------------------------------------------------------------------
  it("should allow selected text to be answered", async () => {
    const content = "How are babies made?";
    const note = mockNote(content, "Life's Big Questions", "abc123");
    const app = mockApp(note);

    expect(plugin.replaceText["Answer"].check(app, content)).toBe(true);
    expect(plugin.replaceText["Answer"].check(app, "This is not a question!")).toBe(false);

    app.alert = jest.fn();
    app.alert.mockResolvedValue(1);
    const result = await plugin.replaceText["Answer"].run(app, content);
    expect(note.body).toContain("egg");
  });

  // --------------------------------------------------------------------------------------
  it("should execute complete in context", async () => {
    const content = "Write an email to retailer asking to return an item";
    const note = mockNote(content, "Baby's plugin", "abc123");
    const app = mockApp(note);

    app.notes.find.mockReturnValue(note);
    const response = await plugin.replaceText["Complete"](app, content);

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(response.toLowerCase()).toContain("subject:");
    expect(response.toLowerCase()).toContain("return")
  });
});
