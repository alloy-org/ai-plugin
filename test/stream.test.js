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
            setTimeout(handler(), 0);
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
  let fetchWas;
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  // --------------------------------------------------------------------------------------
  describe("faux-thesaurus", () => {
    const fileData = contentFromFileName("openai-thesaurus-stream.ndjson");

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

      mockAlertAccept(app);
      app.settings[AI_MODEL_LABEL] = "gpt-4-1106-preview";
      await plugin.replaceText["Thesaurus"].run(app, "manager");

      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      expect(answers).toEqual(["jesus"]);
    }, AWAIT_TIME);
  });

  // --------------------------------------------------------------------------------------
  describe("multi-message content", () => {
    const fileData = contentFromFileName("multi-message.json");

    beforeEach(() => {
      fetchWas = global.fetch;
      global.fetch = mockFetchStream(fileData.split("\n"));
    });

    afterAll(() => {
      global.fetch = fetchWas;
    });

    // --------------------------------------------------------------------------------------
    it("should handle broken-messages", async () => {
      const { app, note } = mockAppWithContent("Once upon a time");

      mockAlertAccept(app);
      app.settings[AI_MODEL_LABEL] = DEFAULT_OPENAI_TEST_MODEL;
      await plugin.replaceText["Thesaurus"].run(app, "manager");

      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      expect(answers).toEqual(["bizcocho"]);
    }, AWAIT_TIME);
  })
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

  // --------------------------------------------------------------------------------------
  it("should summarize with follow up", async () => {
    const { app, note } = mockAppWithContent("When you wish upon a star\nMakes no difference who you are\nAnything your heart desires\n" +
      "Will come to you\nIf your heart is in your dream\nNo request is too extreme\nWhen you wish upon a star\n" +
      "As dreamers do\nFate is kind\nShe brings to those who love\nThe sweet fulfillment of\nTheir secret longing\n" +
      "Like a bolt out of the blue\nFate steps in and sees you through\nWhen you wish upon a star\nYour dreams come true.");
    app.setSetting(AI_MODEL_LABEL, DEFAULT_OPENAI_TEST_MODEL);

    let summary;
    app.prompt.mockImplementation(async (title, options) => {
      summary = title;
      const firstInput = options.inputs[0];
      const followupOption = firstInput.options ? firstInput.options.find(option => option.value === "followup") : null;
      if (followupOption) {
        return followupOption.value;
      } else if (firstInput.label === "Message to send") {
        const selectableOption = options.inputs.find(input => input.options);
        return [ "My question is: why did I ask?", selectableOption.options[0].value ];
      } else {
        console.debug("Unhandled prompt for", title);
      }
    });

    app.alert.mockImplementation(async (text, options) => {
      if (!options) return null;
      if (options.actions?.at(0)?.label === "Generating response") {
        return -1;
      } else {
        return -1;
      }
    });
    await plugin.noteOption["Summarize"](app, note.uuid);
    expect(true).toBeTruthy();
  }, AWAIT_TIME);
});
