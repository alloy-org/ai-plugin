import { jest } from "@jest/globals"
import { mockPlugin, mockAppWithContent } from "./test-helpers.js"

const AWAIT_TIME = 30000;

// --------------------------------------------------------------------------------------
describe("with a mocked app", () => {
  const plugin = mockPlugin();

  it("should suggest an image based on preceding contents of line", async () => {
    const content = `Weekly goals:
        [ ] Action hero saving a pug and french bulldog puppy from an exploding building {${ plugin.constants.pluginName }: image from preceding}
        [ ] Adopt a pound puppy`;
    const { app, note } = mockAppWithContent(content);

    app.prompt = (title, options) => {
      const inputs = options.inputs;
      expect(inputs).toBeInstanceOf(Array);
      expect(inputs).toHaveLength(1);
      const selectInput = inputs[0];
      const selectedInputOptions = selectInput.options;
      expect(selectedInputOptions).toHaveLength(3);
      const selectedOption = selectedInputOptions[0];
      return selectedOption.value;
    }
    const result = await plugin.insertText["Image from preceding"](app);
    expect(/!\[image]\(http/.test(result)).toBeTruthy();
  }, AWAIT_TIME);

  it("should allow image lookup", async () => {
    app.prompt.mockReturnValue("A red ball");
    const result = await plugin.insertText["Image via prompt"](app);
    expect(/!\[image]\(http/.test(result)).toBeTruthy()
  }, AWAIT_TIME);
});
