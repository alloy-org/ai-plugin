import { jest } from "@jest/globals"
import { mockPlugin, mockAppWithContent, mockAlertAccept } from "./test-helpers"
import { ollamaAvailableModels } from "./fetch-ollama"
import { groceryArrayFromContent } from "./functions/groceries"

const AWAIT_TIME = 20000;

// --------------------------------------------------------------------------------------
describe("Ollama", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.noFallbackModels = true;

  // --------------------------------------------------------------------------------------
  it("should recognize Ollama presence", async () => {
    const plugin = {};
    const ollamaModels = await ollamaAvailableModels(plugin, { alert: text => console.error(text) });
    expect(ollamaModels?.length || 0).toBeGreaterThan(0);
  });

  it("should prefer better models", async () => {
    const ollamaModels = await ollamaAvailableModels(plugin);
    const mistralIndex = ollamaModels.indexOf("mistral");
    const llamaIndex = ollamaModels.indexOf("llama2");
    const codeLlamaIndex = ollamaModels.indexOf("codellama");
    expect(mistralIndex).toBeLessThan(llamaIndex);
    expect(llamaIndex).toBeLessThan(codeLlamaIndex);
  });

  describe("When it comes to rhyming stew", () => {
    const expectedRhymes = [ "bees", "keys", "fleece", "fees", "leaves", "seas", "skis", "teas" ];

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
