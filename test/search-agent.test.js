import { AI_MODEL_LABEL, SEARCH_USING_AGENT_LABEL } from "constants/settings"
import {
  defaultTestModel,
  mockAlertAccept,
  mockAppWithContent,
  mockPlugin,
  providersWithApiKey
} from "./test-helpers"

const AWAIT_TIME = 60000;

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  // --------------------------------------------------------------------------------------
  it("should use search-agent to parse notes", async () => {
    const {
      app,
      note
    } = mockAppWithContent(`To be, or not to be, that is the {${plugin.constants.pluginName}: Continue}`);

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = defaultTestModel("openai");
    const userQuery = "Please return all notes changed in the last month that contain images"

    // Since context.replaceSelection in our test-helper will just replace the entire string with the result, we can just check the note body.
    await plugin.appOption[SEARCH_USING_AGENT_LABEL](app);
  }, AWAIT_TIME);
});
