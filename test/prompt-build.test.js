import { PROMPT_KEYS, promptsFromPromptKey } from "prompts"
import { PROVIDER_DEFAULT_MODEL_IN_TEST } from "constants/provider"
import { mockAppWithContent, mockPlugin } from "./test-helpers"

const AWAIT_TIME = 20000;

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  // --------------------------------------------------------------------------------------
  it("should not submit task uuids", () => {
    const noteContent = `- [ ] To be, or not to be, that is the {${ plugin.constants.pluginName }: Continue<!-- {\\"uuid\\":\\"afc94f1f-942b-4dd4-b960-d205f6e4bc4c\\"} -->
    - [ ] Or so you think<!-- {\"uuid\":\"afc94f1f-942b-4dd4-b960-d205f6e4bc4c\"} -->
    - [ ] We think<!-- {"uuid":"afc94f1f-942b-4dd4-b960-d205f6e4bc4c"} -->}`;

    const providerModel = PROVIDER_DEFAULT_MODEL_IN_TEST["openai"];
    for (const promptKey of ["summarize", "thesaurus", "complete"]) {
      console.debug("Expecting", promptKey, "submitted content not to contain the task UUID");
      const messages = promptsFromPromptKey(promptKey, { noteContent }, 0, [], providerModel);
      for (const message of messages) {
        expect(message.content).not.toContain("afc94f1f"); // Ensure the task UUID has been stripped before submitting to internets
      }
    }
  })

  // --------------------------------------------------------------------------------------
  it("should include rejected responses in subsequent submissions", () => {
    const providerModel = PROVIDER_DEFAULT_MODEL_IN_TEST["openai"];
    for (const promptKey of PROMPT_KEYS) {
      console.debug("Expecting", promptKey, "submitted content to contain the rejected message");
      const rejectedResponse = "Yo mamma"; // cool but rude
      const promptParams = {groceryArray: [], instruction: "Work gud", noteContent: "It goes like dis", text: "Blah"};
      const messages = promptsFromPromptKey(promptKey, promptParams, 0, [rejectedResponse], providerModel);
      expect(messages.find(m => m.content.includes(rejectedResponse))).toBeTruthy();
    }
  });

  // --------------------------------------------------------------------------------------
  it("should include rejected thesaurus options", async () => {
    const { app } = mockAppWithContent("Once upon a time there was a very special baby");

    let firstAnswer, secondAnswer;
    app.alert.mockImplementation(async (text, options) => {
      if (firstAnswer) {
        secondAnswer = text;
        return -1;
      } else {
        firstAnswer = text;
        return 0; // Retry the first option, our preferred model
      }
    });
    await plugin.replaceText["Thesaurus"].run(app, "baby");
    expect(firstAnswer).toContain("* infant\n");
    expect(firstAnswer).toContain("newborn");
    expect(secondAnswer).not.toContain("newborn");
    expect(secondAnswer).not.toContain("* infant\n");
  }, AWAIT_TIME);
});
