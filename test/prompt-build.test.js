import { promptsFromPromptKey } from "../lib/prompts"
import { DEFAULT_OPENAI_TEST_MODEL } from "../lib/constants/provider"
import { mockPlugin } from "./test-helpers"

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  it("should not submit task uuids", () => {
    const noteContent = `- [ ] To be, or not to be, that is the {${ plugin.constants.pluginName }: Continue<!-- {\\"uuid\\":\\"afc94f1f-942b-4dd4-b960-d205f6e4bc4c\\"} -->
    - [ ] Or so you think<!-- {\"uuid\":\"afc94f1f-942b-4dd4-b960-d205f6e4bc4c\"} -->
    - [ ] We think<!-- {"uuid":"afc94f1f-942b-4dd4-b960-d205f6e4bc4c"} -->}`;

    for (const promptKey of ["summarize", "thesaurus", "complete"]) {
      console.debug("Expecting", promptKey, "submitted content not to contain the task UUID");
      const messages = promptsFromPromptKey(promptKey, { noteContent }, 0, [], DEFAULT_OPENAI_TEST_MODEL);
      for (const message of messages) {
        expect(message.content).not.toContain("afc94f1f"); // Ensure the task UUID has been stripped before submitting to internets
      }
    }
  })
});
