import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote, mockAppWithContent } from "./test-helpers"
import { callOllama, ollamaAvailableModels } from "./fetch-ollama"

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

  // --------------------------------------------------------------------------------------
  it("exhibit Ollamas' propensity to bust deez hella dope rhymes", async () => {
    const content = "Roses are red,\nviolets are blue,\nOllama is a poet,\nand so are stew";
    const { app, note } = mockAppWithContent(content);

    app.notes.find.mockReturnValue(note);
    app.prompt = jest.fn();
    app.prompt.mockResolvedValue(1);
    await plugin.replaceText["Rhymes"].run(app, "stew");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value);

    expect(answers.indexOf("new")).not.toBe(-1);
    expect(plugin.ollamaModelsFound?.length).toBeGreaterThan(0);
  }, 25000);

  it("should fall back to OpenAI if Ollama is not available", async () => {
    const { app, note } = mockAppWithContent("Roses are red,\nviolets are blue,\nOllama is a poet,\nand so are stew");

    plugin.ollamaModelsFound = [];
    app.notes.find.mockReturnValue(note);
    app.prompt = jest.fn();
    app.prompt.mockResolvedValue(1);
    await plugin.replaceText["Rhymes"].run(app, "stew");
    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value);

    expect(answers.indexOf("new")).not.toBe(-1);
  });
});
