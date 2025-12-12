import { jest } from "@jest/globals"
import { IMAGE_GENERATION_PROMPT } from "constants/prompt-strings"
import { IMAGE_FROM_PRECEDING_LABEL, IMAGE_FROM_PROMPT_LABEL } from "constants/settings"
import { DALL_E_DEFAULT, DALL_E_TEST_DEFAULT } from "constants/provider"
import { mockPlugin, mockApp, mockAppWithContent } from "./test-helpers.js"

const AWAIT_TIME = 30000;

// --------------------------------------------------------------------------------------
describe("with a mocked app", () => {
  const plugin = mockPlugin();

  it("should suggest an image based on preceding contents of line", async () => {
    const content = `Weekly goals:
        [ ] Action hero saving a pug and french bulldog puppy from an exploding building {${ plugin.constants.pluginName }: ${ IMAGE_FROM_PRECEDING_LABEL }
        [ ] Adopt a pound puppy`;
    const { app } = mockAppWithContent(content);
    app.prompt.mockImplementation((title, options) => {
      const chosenValue = options.inputs[0].value || options.inputs[0].options[0].value;
      console.debug("Chosen value", chosenValue, "from", title);
      return [ chosenValue === DALL_E_DEFAULT ? DALL_E_TEST_DEFAULT : chosenValue, null ];
    });
    const result = await plugin.insertText[IMAGE_FROM_PRECEDING_LABEL](app);

    const tuple = app.prompt.mock.calls[app.prompt.mock.calls.length - 1];
    const answers = tuple[1].inputs[0].options;
    expect(answers.length).toBeGreaterThanOrEqual(1);
    expect(answers[0].image).toContain("https://");
    expect(/!\[image]\(http/.test(result)).toBeTruthy();
  }, AWAIT_TIME);

  it("should allow image lookup", async () => {
    const app = mockApp();
    app.prompt.mockImplementation((title, options) => {
      if (title === IMAGE_GENERATION_PROMPT) {
        return "A red ball";
      } else {
        const defaultValue = options.inputs[0].value || options.inputs[0].options[0].value;
        if (defaultValue === DALL_E_DEFAULT) {
          return [ DALL_E_DEFAULT, "natural" ];
        } else {
          return defaultValue;
        }
      }
    });
    const result = await plugin.insertText[IMAGE_FROM_PROMPT_LABEL](app);
    expect(/!\[image]\(http/.test(result)).toBeTruthy()
  }, AWAIT_TIME);
});
