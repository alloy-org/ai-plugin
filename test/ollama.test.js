import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockAppWithContent, mockAlertAccept, LOCAL_MODELS_RUNNING } from "./test-helpers"
import { LOOK_UP_OLLAMA_MODEL_ACTION_LABEL } from "../lib/constants/provider"
import { APP_OPTION_VALUE_USE_PROMPT, QUESTION_ANSWER_PROMPT } from "../lib/constants/prompt-strings"
import { AI_MODEL_LABEL } from "../lib/constants/settings"
import { ollamaAvailableModels } from "../lib/fetch-ollama"
import { groceryArrayFromContent } from "../lib/functions/groceries"

const AWAIT_TIME = 20000;

// --------------------------------------------------------------------------------------
const describeOrSkip = LOCAL_MODELS_RUNNING ? describe : describe.skip;
describeOrSkip("Ollama", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.noFallbackModels = true;

  // --------------------------------------------------------------------------------------
  it("should recognize Ollama presence", async () => {
    const plugin = {};
    const ollamaModels = await ollamaAvailableModels(plugin, { alert: text => console.error(text) });
    expect(ollamaModels?.length || 0).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------------------
  it("should prefer better models", async () => {
    const ollamaModels = await ollamaAvailableModels(plugin);
    const mistralIndex = ollamaModels.indexOf("mistral");
    const llamaIndex = ollamaModels.indexOf("llama2");
    const codeLlamaIndex = ollamaModels.indexOf("codellama");
    expect(mistralIndex).toBeLessThan(llamaIndex);
    expect(llamaIndex).toBeLessThan(codeLlamaIndex);
  });

  // --------------------------------------------------------------------------------------
  it("should discover and sort returned Ollama models", async () => {
    const app = mockApp();
    expect(plugin.ollamaModelsFound?.length || 0).toEqual(0);
    await plugin.appOption[LOOK_UP_OLLAMA_MODEL_ACTION_LABEL](app);
    expect(plugin.ollamaModelsFound.length).toBeGreaterThan(0);
    expect(plugin.ollamaModelsFound[0]).toEqual("mistral");
  });

  describe("When it comes to rhyming stew", () => {
    const expectedRhymes = [ "bees", "breeze", "keys", "ease", "fleece", "fees", "leaves", "please", "seas", "skis", "teas" ];

    // --------------------------------------------------------------------------------------
    it("exhibit Ollamas' propensity to bust deez hella dope rhymes", async () => {
      const content = "Roses are red,\nviolets are cheese,\nOllama is a poet,\nand so are fleas";
      const { app, note } = mockAppWithContent(content);

      mockAlertAccept(app);
      for (const aiModel of [ "mistral", "llama2", "openhermes2.5-mistral" ]) {
        app.settings[plugin.constants.labelAiModel] = aiModel;
        app.notes.find.mockReturnValue(note);
        app.prompt = jest.fn();
        app.prompt.mockResolvedValue(1);
        await plugin.replaceText["Rhymes"].run(app, "fleas");

        const tuple = app.prompt.mock.calls[0]; // app.prompt.mock.calls.length - 1];
        expect(tuple).toBeTruthy();
        const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());
        const nonBlankRhymes = answers.filter(a => expectedRhymes.includes(a));
        expect(nonBlankRhymes.length).toBeGreaterThan(0);
      }
    }, AWAIT_TIME * 3);

    // --------------------------------------------------------------------------------------
    it("should fall back to OpenAI if Ollama is not available", async () => {
      const { app, note } = mockAppWithContent("Roses are red,\nviolets are cheese,\nOllama is a poet,\nand so are fleas");
      mockAlertAccept(app);
      plugin.noFallbackModels = false;
      plugin.ollamaModelsFound = [];
      app.notes.find.mockReturnValue(note);
      app.prompt = jest.fn();
      app.prompt.mockResolvedValue(1);
      await plugin.replaceText["Rhymes"].run(app, "fleas");
      const tuple = app.prompt.mock.calls[0];
      expect(tuple).toBeTruthy();
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());
      const nonBlankRhymes = answers.filter(a => expectedRhymes.includes(a));
      expect(nonBlankRhymes.length).toBeGreaterThan(0);
    }, AWAIT_TIME);
  });

  // --------------------------------------------------------------------------------------
  it("should do thesaurus", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    app.notes.find.mockReturnValue(note);
    plugin.noFallbackModels = true;
    app.settings[plugin.constants.labelAiModel] = "mistral";
    mockAlertAccept(app);
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(["boss", "ceo", "leader", "executive"].find(word => answers.includes(word))).toBeTruthy();

  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should allow appOption freeform Q&A", async () => {
    const content = "[This page accidentally left blank]"
    const { app } = mockAppWithContent(content);

    mockAlertAccept(app);
    app.prompt.mockImplementation(async (prompt, actions) => {
      if (prompt.includes(APP_OPTION_VALUE_USE_PROMPT)) {
        return "replace";
      } else if (prompt === QUESTION_ANSWER_PROMPT) {
        return [ "How much does a killer whale weigh compared to a human?", "mistral" ]
      } else {
        return -1;
      }
    });
    const response = await plugin.appOption["Answer"](app);
    expect(/(ton|kg|more than)/.test(response)).toBeTruthy();
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  describe("with verbose content", () => {
    const content = `- [ ] Create a plugin for Glimpse's JSON version to add completed tasks using a plugin. (CG improvements, todos, bugs)\n\n` +
      `- [ ] Utilize sop-gpu1 with a short timeline.\n\n- [ ] Enable \`@teammate\` in GC to generate notifications.\n\n` +
      `- [ ] Allow new enum member for standalone notifications.\n\n- [ ] Develop AI plugins: Proofreader, Image generation, Add relevant tasks to notes.\n\n` +
      `- [ ] Allow dragging in CAB.\n\n- [ ] Research GC implications of the Copilot era.\n\n10 inches in mm equals {${ plugin.constants.pluginName }: Continue}\n` +
      `At some point real soon this will make sense.\nIf not, then this line won't be omitted.\n`;

    // --------------------------------------------------------------------------------------
    it("should use limited lines to evaluate a continue prompt", async () => {
      const { app, note } = mockAppWithContent(content);
      mockAlertAccept(app);
      plugin.noFallbackModels = true;
      for (const aiModel of [ "mistral", "openhermes2.5-mistral" ]) {
        app.setSetting(AI_MODEL_LABEL, aiModel);
        const insertedText = await plugin.insertText["Continue"](app, content);
        expect(insertedText.length).toBeGreaterThan(0);
        expect(/(254|2[.45]+)\s?([mc]m|centimeter|millimeter)/.test(insertedText)).toBeTruthy();
        expect(insertedText.length).toBeLessThan(60);
        note.body = content;
        console.log("aiModel", plugin.lastModelUsed, "passes")
      }
    }, AWAIT_TIME);

    // --------------------------------------------------------------------------------------
    it("should limit lines passed to complete", async () => {
      const completeText = content.replace(`${ plugin.constants.pluginName }: Continue`, `${ plugin.constants.pluginName }: Complete`);
      const { app, note } = mockAppWithContent(completeText);
      mockAlertAccept(app);
      plugin.noFallbackModels = true;
      for (const aiModel of [ "mistral", "llama2" ]) {
        app.setSetting(AI_MODEL_LABEL, aiModel);
        const insertedText = await plugin.insertText["Complete"](app, content);
        expect(insertedText.length).toBeGreaterThan(0);
        expect(/(254|2[45](\.4)?)/.test(insertedText)).toBeTruthy();
        expect(insertedText.length).toBeLessThan(70);
        note.body = content;
        console.log("aiModel", plugin.lastModelUsed, "passes")
      }
    })
  })

  describe("Groceries", () => {
    // --------------------------------------------------------------------------------------
    it("should sort groceries", async () => {
      const content = `- [ ] Cherries<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Goat milk<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Hatch chiles<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Potatoes<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Pork loin<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Green beans<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Heavy cream<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Cough medicine<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->
- [ ] Earl gray tea<!-- {"uuid":"49d6740f-0d1b-4fea-9f81-aac35627f426"} -->`;
      const { app, note } = mockAppWithContent(content);
      plugin.noFallbackModels = true;

      for (const aiModel of [ "mistral", "llama2", "openhermes2.5-mistral" ]) {
        app.settings[plugin.constants.labelAiModel] = aiModel;
        app.notes.find.mockReturnValue(note);
        mockAlertAccept(app);
        await plugin.noteOption["Sort Grocery List"].run(app, note.uuid);

        expect(note.body).toContain("# Produce")
        const newListItems = note.body.split("\n").filter(line => /^[-\[]/.test(line));
        const groceryListWords = groceryArrayFromContent(note.body);
        groceryListWords.forEach(word => {
          expect(newListItems).toContain(word);
        });
      }
    }, AWAIT_TIME * 5);
  });
});
