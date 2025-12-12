import { PROVIDER_DEFAULT_MODEL_IN_TEST } from "constants/provider"
import { AI_MODEL_LABEL } from "constants/settings"
import { jest } from "@jest/globals"
import { contentFromFileName, mockAlertAccept, mockAppWithContent, mockPlugin, providersWithApiKey } from "./test-helpers"

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
      app.settings[AI_MODEL_LABEL] = "gpt-4o";
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
      app.settings[AI_MODEL_LABEL] = PROVIDER_DEFAULT_MODEL_IN_TEST["openai"];
      await plugin.replaceText["Thesaurus"].run(app, "manager");

      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      expect(answers).toEqual(["bizcocho"]);
    }, AWAIT_TIME);
  });

  // --------------------------------------------------------------------------------------
  describe("concatenated response content", () => {
    const fileData = contentFromFileName("multi-response.json");

    beforeEach(() => {
      fetchWas = global.fetch;
      global.fetch = mockFetchStream(fileData.split("\n"));
    });

    afterAll(() => {
      global.fetch = fetchWas;
    });

    it("should offer responses from both, embedded as tool_call", async () => {
      const { app, note } = mockAppWithContent("Some will question: Who ya daddy?");

      mockAlertAccept(app);
      app.settings[AI_MODEL_LABEL] = "gpt-4o";
      await plugin.replaceText["Thesaurus"].run(app, "question");

      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      // Array(2) [{"result": ["Inquery", "Interrogation", "Inquisiti…g ", "Probe ", "Examination ", "Investigation "]},
      //   {"result": ["Dilemma", "Enquiry", "Grill", "Cross-examine", "Raise"]}]
      expect(answers).toEqual(["inquery", "interrogation", "inquisition", "questioning", "probe", "examination",
        "investigation", "dilemma", "enquiry", "grill", "cross-examine", "raise" ]);
    }, AWAIT_TIME);
  });
})

// --------------------------------------------------------------------------------------
describe("OpenAI streaming", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  // --------------------------------------------------------------------------------------
  it("should provide applicable thesaurus options", async () => {
    const { app } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");
    app.setSetting(AI_MODEL_LABEL, PROVIDER_DEFAULT_MODEL_IN_TEST["openai"]);

    app.prompt = jest.fn();
    app.prompt.mockResolvedValue(1);
    mockAlertAccept(app);
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(["boss", "ceo", "leader", "executive"].find(word => answers.includes(word))).toBeTruthy();
  }, AWAIT_TIME);

  // --------------------------------------------------------------------------------------
  it("should stream a rhyming response", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born in a manger");

    mockAlertAccept(app);
    const aiProviderEms = providersWithApiKey();
    plugin.noFallbackModels = true;
    for (const providerEm of aiProviderEms) {
      app.settings[AI_MODEL_LABEL] = PROVIDER_DEFAULT_MODEL_IN_TEST[providerEm];
      await plugin.replaceText["Rhymes"].run(app, "manger");

      const tuple = app.prompt.mock.calls[0];
      const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

      expect(answers).toContain("danger");
      console.log(`Successfully received streamed answer "${ answers }" from "${ providerEm }"`);
    }
  }, AWAIT_TIME * Object.keys(PROVIDER_DEFAULT_MODEL_IN_TEST).length);

  // --------------------------------------------------------------------------------------
  it("should summarize with follow up", async () => {
    const aiProviderEms = providersWithApiKey();
    plugin.noFallbackModels = true;
    for (const providerEm of aiProviderEms) {
      const { app, note } = mockAppWithContent("When you wish upon a star\nMakes no difference who you are\nAnything your heart desires\n" +
        "Will come to you\nIf your heart is in your dream\nNo request is too extreme\nWhen you wish upon a star\n" +
        "As dreamers do\nFate is kind\nShe brings to those who love\nThe sweet fulfillment of\nTheir secret longing\n" +
        "Like a bolt out of the blue\nFate steps in and sees you through\nWhen you wish upon a star\nYour dreams come true.");

      app.setSetting(AI_MODEL_LABEL, PROVIDER_DEFAULT_MODEL_IN_TEST[providerEm]);
      console.log(`Testing streaming with "${ providerEm }"`)

      let summary;
      app.prompt.mockImplementation(async (title, options) => {
        summary = title;
        const firstInput = options.inputs[0];
        const followupOption = firstInput.options ? firstInput.options.find(option => option.value === "followup") : null;
        if (followupOption) {
          return followupOption.value;
        } else if (firstInput.label === "Message to send") {
          const selectableOption = options.inputs.find(input => input.options);
          return ["My question is: why did I ask?", selectableOption.options[0].value];
        } else {
          console.debug("Unhandled prompt for", title);
        }
      });

      let receivedFollowUpAnswer;
      app.alert.mockImplementation(async (text, options) => {
        if (!options) return null;
        if (options.actions?.at(0)?.label === "Generating response") {
          return -1;
        } else {
          receivedFollowUpAnswer = options.preface && /^system:/.test(options.preface) && options.actions && options.actions[0].label.includes("follow up question");
          return -1;
        }
      });
      await plugin.noteOption["Summarize"](app, note.uuid);
      expect(receivedFollowUpAnswer).toBeTruthy();
      console.log(`Successfully received streamed answer "${ receivedFollowUpAnswer }" from "${ providerEm }"`);
    }
  }, AWAIT_TIME * Object.keys(PROVIDER_DEFAULT_MODEL_IN_TEST).length);
});
