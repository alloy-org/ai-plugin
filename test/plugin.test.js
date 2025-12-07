import { defaultProviderModel, PROVIDER_DEFAULT_MODEL_IN_TEST, openAiTokenLimit } from "../lib/constants/provider"
import { APP_OPTION_VALUE_USE_PROMPT, QUESTION_ANSWER_PROMPT } from "../lib/constants/prompt-strings"
import { AI_MODEL_LABEL, SUGGEST_TASKS_LABEL } from "../lib/constants/settings"
import { ollamaAvailableModels } from "../lib/fetch-ollama"
import { jest } from "@jest/globals"
import { contentFromFileName, LOCAL_MODELS_RUNNING, mockAlertAccept, mockAppWithContent, mockPlugin, providersWithApiKey } from "./test-helpers"

const AWAIT_TIME = 20000;
// --------------------------------------------------------------------------------------
function defaultTestModel(providerEm) {
  return PROVIDER_DEFAULT_MODEL_IN_TEST[providerEm];
}

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
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = defaultTestModel("openai");
    const insertedText = await plugin.insertText["Continue"](app);

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(insertedText).toMatch(/question|dilemma/i);
  }, AWAIT_TIME * 3);

  // --------------------------------------------------------------------------------------
  it("should allow selected text to be answered", async () => {
    const content = "Briefly, how are babies made? Does sperm combine with something perhaps?"
    const { app, note } = mockAppWithContent(content);

    expect(plugin.replaceText["Answer"].check(app, content)).toBe(true);
    expect(plugin.replaceText["Answer"].check(app, "This is not a question!")).toBe(false);
    mockAlertAccept(app);
    const ollamaModel = LOCAL_MODELS_RUNNING ? "llama2" : null;
    for (const aiModel of [ ollamaModel, defaultTestModel("openai") ].filter(n => n)) {
      app.setSetting(AI_MODEL_LABEL, aiModel);
      console.log("What does", aiModel, "say about", content, "?");
      const replacedText = await plugin.replaceText["Answer"].run(app, content);
      expect(replacedText).toContain("egg");
    }

    expect(plugin.callCountByModel[defaultTestModel("openai")]).toBeGreaterThanOrEqual(1);
    if (LOCAL_MODELS_RUNNING) {
      expect(plugin.callCountByModel[ollamaModel]).toBe(1);
    }
  }, AWAIT_TIME * 5);

  // --------------------------------------------------------------------------------------
  it("should allow appOption freeform Q&A", async () => {
    const content = "[This page accidentally left blank]"
    const { app } = mockAppWithContent(content);

    mockAlertAccept(app);
    app.prompt.mockImplementation(async (prompt, actions) => {
      if (prompt.includes(APP_OPTION_VALUE_USE_PROMPT)) {
        return "replace";
      } else if (prompt === QUESTION_ANSWER_PROMPT) {
        return [ "How much does a killer whale weigh compared to a human?", defaultTestModel("openai") ];
      } else {
        return -1;
      }
    });
    const response = await plugin.appOption["Answer"](app);
    expect(/(heavier|ton|kg|kilograms|more than)/.test(response)).toBeTruthy();
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should allow user to continue a sentence", async () => {
    const question = "To be, or not to be, that is";
    const content = `${ question } {${ plugin.constants.pluginName }: Continue}`;
    const { app, note } = mockAppWithContent(content);
    mockAlertAccept(app);
    plugin.noFallbackModels = true;
    const ollamaModel = LOCAL_MODELS_RUNNING ? "llama2" : null;
    // Only test models for providers where we have an API key configured
    const providerModels = providersWithApiKey().map(providerEm => PROVIDER_DEFAULT_MODEL_IN_TEST[providerEm]);
    for (const aiModel of [ ollamaModel, ...providerModels ].filter(n => n)) {
      app.setSetting(AI_MODEL_LABEL, aiModel);
      console.log("What does", aiModel, "say about", content, "?");
      const insertedText = await plugin.insertText["Continue"](app, content);
      expect(insertedText.length).toBeGreaterThan(0);
      expect(question.includes(insertedText)).toBeFalsy();
      note.body = content;
      console.log("aiModel", plugin.lastModelUsed, "passes")
    }
  }, AWAIT_TIME * 2);

  // --------------------------------------------------------------------------------------
  it("should execute complete in context", async () => {
    const content = "Write an email to retailer asking to return an item. Ensure that the email begins with a suggested subject line, labeled 'Subject: '.";
    const { app, note } = mockAppWithContent(content);

    app.notes.find.mockReturnValue(note);
    const response = await plugin.replaceText["Complete"](app, content);
    mockAlertAccept(app);
    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(response.toLowerCase()).toContain("return")
    expect(response.toLowerCase()).toContain("subject:");
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should sort my groceries", async () => {
    const content = `Groceries for the fam:\n\n- [ ] Bananas<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Calf's milk<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Jungle berries<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Nuts!<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Frozen pizza<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Tortillas<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Sourdough<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Whip cream<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Toothpaste<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Mackerel<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->`;
    const { app, note } = mockAppWithContent(content);
    plugin.noFallbackModels = true;
    app.settings[AI_MODEL_LABEL] = defaultProviderModel("openai");

    const bodyWas = note.body;
    expect(await plugin.noteOption["Sort Grocery List"].check(app, note.uuid)).toBeTruthy();
    app.notes.find.mockReturnValue(note);

    // When user doesn't accept the suggestion, then nothing changes
    await plugin.noteOption["Sort Grocery List"].run(app, note.uuid);
    expect(bodyWas).toEqual(note.body);

    mockAlertAccept(app);
    await plugin.noteOption["Sort Grocery List"].run(app, note.uuid);
    const expectedWords = [ "bananas", "calf's milk", "frozen pizza", "produce", "dairy", "mackerel", "nuts!", "bakery", "toothpaste" ];
    const originalListItems = content.split("\n").filter(line => /^[-\[]/.test(line));
    const newListItems = note.body.split("\n").filter(line => /^[-\[]/.test(line));
    expect(newListItems.length).toEqual(originalListItems.length);
    expectedWords.forEach(word => {
      expect(note.body.toLowerCase()).toContain(word);
    });
  }, AWAIT_TIME * 4);

  // --------------------------------------------------------------------------------------
  it("should provide applicable thesaurus options", async () => {
    const { app } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    app.prompt = jest.fn();
    app.prompt.mockResolvedValue(1);
    mockAlertAccept(app);
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(["boss", "ceo", "Keeper", "guardian", "leader", "executive"].find(word => answers.includes(word))).toBeTruthy();
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should summarize a note", async () => {
    const fileContent = contentFromFileName("introduction_to_sally.txt");
    const { app, note } = mockAppWithContent(fileContent);
    let summary;
    app.prompt.mockImplementation(async (title, object) => {
      summary = title;
    });

    mockAlertAccept(app);
    await plugin.noteOption["Summarize"](app, note.uuid);
    expect(summary.toLowerCase()).toContain("mr. pinner");
    expect(summary.toLowerCase()).toContain("sally");
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should truncate content when the note is too long for OpenAI", async () => {
    const words = [ "once", "upon", "a", "time", "the", "dark", "sheep", "gloat", "goat", "forever", "amen", "blessed", "action", ".", ",", "the", "and so", "for" ];
    const wordsLength = words.length;
    let content = "";
    const aiModel = defaultTestModel("openai");
    const limit = openAiTokenLimit(aiModel);
    for (let i = 0; i < limit; i++) {
      content += words[Math.floor(Math.random() * wordsLength)] + " ";
    }

    const { app, note } = mockAppWithContent(content);
    plugin.noFallbackModels = true;
    mockAlertAccept(app)
    app.setSetting(AI_MODEL_LABEL, aiModel);
    await plugin.replaceText["Rhymes"].run(app, "sheep");
    const alertCall = app.alert.mock.calls[0];
    const [ promptText, alertObject ] = alertCall;

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value);
    expect(answers.length).toBeGreaterThan(0);
    for (const expectedWord of [ "beep", "keep", "deep", "creep" ]) {
      expect(promptText.includes(expectedWord)).toBeTruthy();
    }
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should suggest tasks", async () => {
    const content = `# Marketing for note taking app\n- [ ] Write SEO content for "productivity"\n- [ ] Investigate top keywords with Google\n{${ plugin.constants.pluginName }: ${ SUGGEST_TASKS_LABEL }}`;
    const { app, note } = mockAppWithContent(content);
    plugin.noFallbackModels = true;
    mockAlertAccept(app)
    const ollamaModels = (LOCAL_MODELS_RUNNING && await ollamaAvailableModels(plugin, { alert: text => console.error(text) })) || [];
    const openAiModels = [ defaultTestModel("openai") ];
    const testModels = [ ...ollamaModels, ...openAiModels ].filter(n => n);
    for (const aiModel of testModels) {
      let suggestedTasks = [];
      app.setSetting(AI_MODEL_LABEL, aiModel);
      app.prompt.mockImplementation((title, object) => {
        const firstRun = suggestedTasks.length === 0;
        const promptOptionValues = object.inputs[0].options.map(t => t.value);
        suggestedTasks = promptOptionValues;
        return firstRun ? promptOptionValues[0] : "done";
      });
      await plugin.insertText[SUGGEST_TASKS_LABEL](app);
      expect(suggestedTasks.length).toBeGreaterThan(0);
      console.log(aiModel, "successfully generated", suggestedTasks.length ,"tasks");
    }
  }, AWAIT_TIME * 5);

  // --------------------------------------------------------------------------------------
  it("should suggest more tasks", async () => {
    const content = `# Marketing for note taking app\n- [ ] Write SEO content for "productivity"\n- [ ] Investigate top keywords with Google\n{${ plugin.constants.pluginName }: ${ SUGGEST_TASKS_LABEL }}`;
    const { app } = mockAppWithContent(content);
    plugin.noFallbackModels = true;
    mockAlertAccept(app)
    let suggestedTasks = [];
    let promptCount = 0;
    app.setSetting(AI_MODEL_LABEL, defaultTestModel("openai"));
    app.prompt.mockImplementation((title, object) => {
      promptCount += 1;
      const promptOptionValues = object.inputs[0].options.map(t => t.value);
      suggestedTasks = promptOptionValues;
      if (promptCount === 1) {
        return promptOptionValues[0];
      } else if (promptCount === 2) {
        return "more";
      } else {
        return "done";
      }
    });
    await plugin.insertText[SUGGEST_TASKS_LABEL](app);
    expect(suggestedTasks.length).toBeGreaterThan(11);
    console.log("Successfully generated", suggestedTasks.length ,"tasks");

  }, AWAIT_TIME * 2);
});
