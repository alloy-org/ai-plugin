import { STREAM_MOCK_MODEL } from "../lib/constants/provider"
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
  it("should handle overspaced response", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    // Mock the OpenAI API call
    nock("https://api.openai.com")
      .persist()
      .post("/v1/chat/completions")
      .replyWithFile(200, path.join(__dirname, "fixtures/openai-thesaurus-stream.ndjson"), {
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      }
    );

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = STREAM_MOCK_MODEL;
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(answers).toEqual(["Jesus"]);
  });
})
