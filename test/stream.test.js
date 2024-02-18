import fs from "fs"
import { STREAM_MOCK_MODEL } from "../lib/constants/provider"
import { AI_MODEL_LABEL } from "../lib/constants/settings"
import { jest } from "@jest/globals"
import path from "path"
import { mockAlertAccept, mockAppWithContent, mockPlugin } from "./test-helpers"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AWAIT_TIME = 20000;
const fileData = fs.readFileSync(path.join(__dirname, "fixtures/openai-thesaurus-stream.ndjson"), "utf8");

function mockFetch(data) {
  let readIndex = -1;
  return jest.fn(() =>
    Promise.resolve({
      body: {
        on: (event, handler) => {
          if (event === 'readable') {
            handler();
          }
        },
        read: () => {
          // Return a chunk of data; simulate end of data by eventually returning null
          readIndex += 1;
          return fileData.split("\n")[readIndex];
        }
      },
      ok: true,
    })
  );
}

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  beforeEach(() => {
    global.fetch = mockFetch(null);
  });

  afterAll(() => {
    // fetch.resetMocks();
  });

  // --------------------------------------------------------------------------------------
  it("should handle overspaced response", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    // app.settings[AI_MODEL_LABEL] = "gpt-4-1106-preview";
    app.settings[AI_MODEL_LABEL] = STREAM_MOCK_MODEL;
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(answers).toEqual(["Jesus"]);
  }, AWAIT_TIME * 2);
})
