import { AI_MODEL_LABEL } from "./constants"
import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote } from "./test-helpers"
import { callOllama, ollamaIsAvailable } from "./plugin-fetch"

// --------------------------------------------------------------------------------------
describe("Ollama", () => {
  const plugin = mockPlugin();
  plugin._testEnvironment = true;

  // --------------------------------------------------------------------------------------
  it("should recognize Ollama presence", async () => {
    expect(await ollamaIsAvailable()).toBe(true);
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

    expect(answers.indexOf("you")).not.toBe(-1);
  });
});
