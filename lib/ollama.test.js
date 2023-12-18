import { jest } from "@jest/globals"
import { mockPlugin, mockAppWithContent } from "./test-helpers"
import { ollamaAvailableModels } from "./fetch-ollama"

const AWAIT_TIME = 10000;

// --------------------------------------------------------------------------------------
describe("Ollama", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  // --------------------------------------------------------------------------------------
  it("should recognize Ollama presence", async () => {
    const plugin = {};
    const ollamaModels = await ollamaAvailableModels(plugin, { alert: text => console.error(text) });
    expect(ollamaModels?.length || 0).toBeGreaterThan(0);
  })

  describe("When it comes to rhyming stew", () => {
    const expectedRhymes = [ "new", "glue", "shoe", "brew" ];

    // --------------------------------------------------------------------------------------
    it("exhibit Ollamas' propensity to bust deez hella dope rhymes", async () => {
      const content = "Roses are red,\nviolets are blue,\nOllama is a poet,\nand so are stew";
      const { app, note } = mockAppWithContent(content);

      app.notes.find.mockReturnValue(note);
      app.prompt = jest.fn();
      app.prompt.mockResolvedValue(1);
      await plugin.replaceText["Rhymes"].run(app, "stew");

      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      expect(plugin.ollamaModelsFound?.length).toBeGreaterThan(0);
      expect(answers.filter(a => expectedRhymes.includes(a)).length).toBeGreaterThan(0);
    }, AWAIT_TIME);

    it("should fall back to OpenAI if Ollama is not available", async () => {
      const { app, note } = mockAppWithContent("Roses are red,\nviolets are blue,\nOllama is a poet,\nand so are stew");

      plugin.ollamaModelsFound = [];
      app.notes.find.mockReturnValue(note);
      app.prompt = jest.fn();
      app.prompt.mockResolvedValue(1);
      await plugin.replaceText["Rhymes"].run(app, "stew");
      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      expect(answers.filter(a => expectedRhymes.includes(a)).length).toBeGreaterThan(0);
    }, AWAIT_TIME);
  });
});
