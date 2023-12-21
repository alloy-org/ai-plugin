import { AI_MODEL_LABEL, DEFAULT_OPENAI_MODEL, openAiTokenLimit } from "./constants"
import { jest } from "@jest/globals"
import { mockAppWithContent, mockPlugin } from "./test-helpers.js"

const AWAIT_TIME = 10000;

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  it("should offer expression commands", () => {
    expect(plugin.insertText["Complete"]).toBeDefined();
    expect(plugin.insertText["Continue"]).toBeDefined();
  })

  // --------------------------------------------------------------------------------------
  it("should make a call to OpenAI", async () => {
    const { app, note } = mockAppWithContent(`To be, or not to be, that is the {${ plugin.constants.pluginName }: Continue}`);

    app.notes.find.mockReturnValue(note);
    app.settings[AI_MODEL_LABEL] = DEFAULT_OPENAI_MODEL;
    await plugin.insertText["Continue"](app);

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(note.body).toContain("question");
  });

  // --------------------------------------------------------------------------------------
  it("should allow selected text to be answered", async () => {
    const content = "Briefly, how are babies made? Does sperm combine with something perhaps?"
    const { app, note } = mockAppWithContent(content);

    expect(plugin.replaceText["Answer"].check(app, content)).toBe(true);
    expect(plugin.replaceText["Answer"].check(app, "This is not a question!")).toBe(false);

    app.alert = jest.fn();
    app.alert.mockResolvedValue(1);
    const ollamaModel = "llama2"
    for (const aiModel of [ ollamaModel, DEFAULT_OPENAI_MODEL ]) {
      app.setSetting(AI_MODEL_LABEL, aiModel);
      console.log("What does", aiModel, "say about", content, "?");
      await plugin.replaceText["Answer"].run(app, content);
      expect(note.body).toContain("egg");
    }

    expect(plugin.callCountByModel[DEFAULT_OPENAI_MODEL]).toBe(1);
    expect(plugin.callCountByModel[ollamaModel]).toBe(1);
  }, AWAIT_TIME * 5);

  // --------------------------------------------------------------------------------------
  it("should execute complete in context", async () => {
    const content = "Write an email to retailer asking to return an item";
    const { app, note } = mockAppWithContent(content);

    app.notes.find.mockReturnValue(note);
    const response = await plugin.replaceText["Complete"](app, content);

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(response.toLowerCase()).toContain("subject:");
    expect(response.toLowerCase()).toContain("return")
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should provide applicable thesaurus options", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    app.notes.find.mockReturnValue(note);
    app.prompt = jest.fn();
    app.prompt.mockResolvedValue(1);

    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(["boss", "ceo", "leader", "executive"].find(word => answers.includes(word))).toBeTruthy();

    }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should truncate content when the note is too long for OpenAI", async () => {
    const words = [ "once", "upon", "a", "time", "the", "dark", "sheep", "gloat", "goat", "forever", "amen", "blessed", "action", ".", ",", "the", "and so", "for" ];
    const wordsLength = words.length;
    let content = "";
    const aiModel = "gpt-3.5-turbo"
    const limit = openAiTokenLimit(aiModel);
    for (let i = 0; i < limit; i++) {
      content += words[Math.floor(Math.random() * wordsLength)] + " ";
    }
    const { app, note } = mockAppWithContent(content);
    app.setSetting(AI_MODEL_LABEL, aiModel);
    await plugin.replaceText["Rhymes"].run(app, "sheep");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value);
    expect(answers.length).toBeGreaterThan(0);
  }, AWAIT_TIME);
});
