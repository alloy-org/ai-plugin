import { DEFAULT_OPENAI_TEST_MODEL } from "../lib/constants/provider"
import { AI_MODEL_LABEL } from "../lib/constants/settings"
import nock from "nock"
import path from "path"
import { jest } from "@jest/globals"
import { mockAlertAccept, mockAppWithContent, mockPlugin } from "./test-helpers"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  // --------------------------------------------------------------------------------------
  it("should make a call to OpenAI", async () => {
    const { app, note } = mockAppWithContent(`To be, or not to be, that is the {${plugin.constants.pluginName}: Continue}`);

    // Mock the OpenAI API call
    nock("https://api.openai.com")
      .post("/v1/chat/completions")
      .replyWithFile(200, path.join(__dirname, "fixtures/openai-stream.ndjson"), {
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
    });

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = DEFAULT_OPENAI_TEST_MODEL;
    const insertedText = await plugin.insertText["Continue"](app);

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    expect(insertedText).toContain("question");
  });
})
