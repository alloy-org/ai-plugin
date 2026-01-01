import { contentfulPromptParams, PROMPT_KEYS, promptsFromPromptKey } from "prompts"
import { defaultTestModel, mockApp, mockAppWithContent, mockNote, mockPlugin, providersWithApiKey } from "./test-helpers"

const AWAIT_TIME = 20000;

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  // Randomly select a provider from those with API keys configured
  const availableProviders = providersWithApiKey();
  const providerName = availableProviders[Math.floor(Math.random() * availableProviders.length)];
  const testModel = defaultTestModel(providerName);
  console.log(`Running prompt-build tests with model: ${ testModel } (provider: ${ providerName })`);

  // --------------------------------------------------------------------------------------
  // Tests that task UUIDs are stripped before sending to AI. In production, sendQuery calls
  // contentfulPromptParams (which strips UUIDs) then promptsFromPromptKey (which builds messages).
  // We test these two functions directly to avoid making actual API calls.
  it("should not submit task uuids", async () => {
    const noteContent = `- [ ] To be, or not to be, that is the {${ plugin.constants.pluginName }: Continue<!-- {\\"uuid\\":\\"afc94f1f-942b-4dd4-b960-d205f6e4bc4c\\"} -->
    - [ ] Or so you think<!-- {\"uuid\":\"afc94f1f-942b-4dd4-b960-d205f6e4bc4c\"} -->
    - [ ] We think<!-- {"uuid":"afc94f1f-942b-4dd4-b960-d205f6e4bc4c"} -->}`;

    const note = mockNote("Test note", noteContent, "test-uuid-123");
    const app = mockApp(note);

    for (const promptKey of ["summarize", "thesaurus", "complete"]) {
      console.debug("Expecting", promptKey, "submitted content not to contain the task UUID");
      const promptParams = await contentfulPromptParams(app, note.uuid, promptKey, {}, testModel);
      const messages = promptsFromPromptKey(promptKey, promptParams, [], testModel);
      for (const message of messages) {
        expect(message.content).not.toContain("afc94f1f");
      }
    }
  })

  // --------------------------------------------------------------------------------------
  it("should include rejected responses in subsequent submissions", () => {
    for (const promptKey of PROMPT_KEYS) {
      console.debug("Expecting", promptKey, "submitted content to contain the rejected message");
      const rejectedResponse = "Yo mamma"; // cool but rude
      const promptParams = {groceryArray: [], instruction: "Work gud", noteContent: "It goes like dis", text: "Blah"};
      const messages = promptsFromPromptKey(promptKey, promptParams, [rejectedResponse], testModel);
      expect(messages.find(m => m.content.includes(rejectedResponse))).toBeTruthy();
    }
  });

  // --------------------------------------------------------------------------------------
  // Tests that rejected thesaurus options are included in subsequent prompts to the LLM
  it("should include rejected thesaurus options in subsequent prompts", () => {
    const noteContent = "Once upon a time there was a very special baby";
    const rejectedFirstResponse = "Results:\n* infant\n* newborn\n* child";

    // Build messages for a retry with the rejected response
    const promptParams = { noteContent, text: "baby" };
    const messages = promptsFromPromptKey("thesaurus", promptParams, [rejectedFirstResponse], testModel);

    // Verify the rejected response is included in the messages sent to LLM
    const rejectionMessage = messages.find(m => m.content.includes("infant"));
    expect(rejectionMessage).toBeTruthy();
    expect(rejectionMessage.content).toContain("newborn");
    expect(rejectionMessage.content).toContain("WRONG RESPONSE");
  });

  // --------------------------------------------------------------------------------------
  describe("Continue action prompts", () => {

    // --------------------------------------------------------------------------------------
    it("should include full document context in continue prompts", () => {
      const noteContent = `January 2025\n\nFebruary 2025\n\n{${ plugin.constants.pluginName }: Continue}`;
      const messages = promptsFromPromptKey("continue", { noteContent }, [], testModel);

      // Find the message containing the document content (starts with ~~~)
      const contentMessage = messages.find(message => message.content.startsWith("~~~"));
      expect(contentMessage).toBeTruthy();
      expect(contentMessage.content).toContain("January 2025");
      expect(contentMessage.content).toContain("February 2025");
    });

    // --------------------------------------------------------------------------------------
    it("should replace plugin token with <replaceToken> in continue prompts", () => {
      const noteContent = `January 2025\n\nFebruary 2025\n\n{${ plugin.constants.pluginName }: Continue}`;
      const messages = promptsFromPromptKey("continue", { noteContent }, [], testModel);

      // Find the message containing the document content (starts with ~~~)
      const contentMessage = messages.find(message => message.content.startsWith("~~~"));
      expect(contentMessage).toBeTruthy();
      expect(contentMessage.content).toContain("<replaceToken>");
      expect(contentMessage.content).not.toContain(`{${ plugin.constants.pluginName }: Continue}`);
    });

    // --------------------------------------------------------------------------------------
    it("should handle whitespace variations in plugin token", () => {
      // Test with extra whitespace around the plugin name and action
      const noteContent = `January 2025\n\nFebruary 2025\n\n{ ${ plugin.constants.pluginName } : Continue }`;
      const messages = promptsFromPromptKey("continue", { noteContent }, [], testModel);

      const contentMessage = messages.find(message => message.content.startsWith("~~~"));
      expect(contentMessage).toBeTruthy();
      expect(contentMessage.content).toContain("<replaceToken>");
      expect(contentMessage.content).not.toContain(plugin.constants.pluginName);
    });

    // --------------------------------------------------------------------------------------
    it("should include months-of-year example in continue prompts", () => {
      const noteContent = `January 2025\n\nFebruary 2025\n\n{${ plugin.constants.pluginName }: Continue}`;
      const messages = promptsFromPromptKey("continue", { noteContent }, [], testModel);

      // Find the example message (JSON containing "example" key with months)
      const exampleMessage = messages.find(message =>
        message.content.includes('"example"') && message.content.includes("March 2025")
      );
      expect(exampleMessage).toBeTruthy();
      expect(exampleMessage.content).toContain("January 2025");
      expect(exampleMessage.content).toContain("December 2025");
    });

    // --------------------------------------------------------------------------------------
    it("should suppress example when suppressExample is true", () => {
      const noteContent = `January 2025\n\nFebruary 2025\n\n{${ plugin.constants.pluginName }: Continue}`;
      const messages = promptsFromPromptKey("continue", { noteContent, suppressExample: true }, [], testModel);

      // Should not contain the months example
      const exampleMessage = messages.find(message =>
        message.content.includes("March 2025") && message.content.includes("December 2025")
      );
      expect(exampleMessage).toBeFalsy();
    });
  });
});
