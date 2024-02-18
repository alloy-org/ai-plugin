import { DEFAULT_OPENAI_TEST_MODEL } from "../lib/constants/provider"
import { AI_MODEL_LABEL } from "../lib/constants/settings"
import { jest } from "@jest/globals"
import { contentFromFileName, mockAlertAccept, mockAppWithContent, mockPlugin } from "./test-helpers"

const AWAIT_TIME = 20000;

// --------------------------------------------------------------------------------------
function mockFetchStream(streamArray) {
  let readIndex = -1;
  return jest.fn(() =>
    Promise.resolve({
      body: {
        on: (eventName, handler) => {
          if (eventName === "readable") {
            handler();
          }
        },
        read: () => {
          // Return a chunk of data; simulate end of data by eventually returning null
          readIndex += 1;
          return streamArray[readIndex];
        }
      },
      ok: true,
    })
  );
}

// --------------------------------------------------------------------------------------
describe("Mocked streaming", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;
  const fileData = contentFromFileName("openai-thesaurus-stream.ndjson");
  let fetchWas;

  beforeEach(() => {
    fetchWas = global.fetch;
    global.fetch = mockFetchStream(fileData.split("\n"));
  });

  afterAll(() => {
    global.fetch = fetchWas;
  });

  // --------------------------------------------------------------------------------------
  it("should handle overspaced response", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = "gpt-4-1106-preview";
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(answers).toEqual(["jesus"]);
  }, AWAIT_TIME * 2);
})

// --------------------------------------------------------------------------------------
describe("OpenAI streaming", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  // --------------------------------------------------------------------------------------
  it("should provide applicable thesaurus options", async () => {
    const { app } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");
    app.setSetting(AI_MODEL_LABEL, DEFAULT_OPENAI_TEST_MODEL);

    app.prompt = jest.fn();
    app.prompt.mockResolvedValue(1);
    mockAlertAccept(app);
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(["boss", "ceo", "leader", "executive"].find(word => answers.includes(word))).toBeTruthy();
  }, AWAIT_TIME);
});
