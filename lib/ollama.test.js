import { AI_MODEL_LABEL } from "./constants"
import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote } from "./test-helpers"
import { callOllama, ollamaAvailableModels } from "./fetch-ollama"

// --------------------------------------------------------------------------------------
describe("Ollama", () => {
  const plugin = mockPlugin();
  plugin._testEnvironment = true;

  // --------------------------------------------------------------------------------------
  it("should recognize Ollama presence", async () => {
    const plugin = {};
    const ollamaModels = await ollamaAvailableModels(plugin, { alert: text => console.error(text) });
    expect(ollamaModels.length).toBeGreaterThan(0);
  })

  // --------------------------------------------------------------------------------------
  it("exhibit Ollamas' propensity to bust hella dope rhymes", async () => {
    const content = "Roses are red,\nviolets are blue,\nOllama is a poet,\nand so are stew";
    const note = mockNote(content, "Baby's first plugin", "abc123");
    const app = mockApp(note);

    app.notes.find.mockReturnValue(note);
    app.prompt = jest.fn();
    app.settings[AI_MODEL_LABEL] = "mistral";
    app.prompt.mockResolvedValue(1);
    await plugin.replaceText["Rhymes"].run(app, "stew");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value);

    expect(answers.indexOf("new")).not.toBe(-1);
  });
});
