import { jest } from "@jest/globals"
import { IMAGE_FROM_PRECEDING_LABEL } from "../lib/constants/settings"
import { mockPlugin, mockAppWithContent } from "./test-helpers.js"

const AWAIT_TIME = 30000;

// --------------------------------------------------------------------------------------
describe("with a mocked app", () => {
  const plugin = mockPlugin();

  it("should suggest an image based on preceding contents of line", async () => {
    const content = `Weekly goals:
        [ ] Action hero saving a pug and french bulldog puppy from an exploding building {${ plugin.constants.pluginName }: ${ IMAGE_FROM_PRECEDING_LABEL }
        [ ] Adopt a pound puppy`;
    const { app, note } = mockAppWithContent(content);
    app.prompt.mockImplementation((title, options) => {
      const chosenValue = options.inputs[0].value || options.inputs[0].options[0].value;
      console.debug("Chosen value", chosenValue, "from", title);
      return chosenValue
    })
    const result = await plugin.insertText[IMAGE_FROM_PRECEDING_LABEL](app);
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

    expect(/!\[image]\(http/.test(result)).toBeTruthy();
  }, AWAIT_TIME);

  it("should allow image lookup", async () => {
    app.prompt.mockReturnValue("A red ball");
    const result = await plugin.insertText["Image via prompt"](app);
    expect(/!\[image]\(http/.test(result)).toBeTruthy()
  }, AWAIT_TIME);
});
