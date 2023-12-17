import { jest } from "@jest/globals"
import { mockApp, mockPlugin, mockNote } from "./test-helpers"
import { callOllama, ollamaIsAvailable } from "./plugin-fetch"

// --------------------------------------------------------------------------------------
describe("Ollama", () => {
  const plugin = mockPlugin();
  plugin._testEnvironment = true;

  it("should recognize Ollama presence", async () => {
    expect(await ollamaIsAvailable()).toBe(true);
  })
});
