import { PROMPT_KEYS } from "./prompts"

// --------------------------------------------------------------------------
// OpenAI "functions" are received via the `tools` key https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models
export function toolsValueFromPrompt(promptKey) {
  if (!PROMPT_KEYS.includes(promptKey)) throw (`Please add "${ promptKey }" to PROMPT_KEYS array`);

  let openaiFunction;
  switch(promptKey) {
    case "rhyming":
    case "thesaurus":
      const description = promptKey === "rhyming"
        ? "Array of 10 contextually relevant rhyming words"
        : "Array of 10 contextually relevant alternate words";
      openaiFunction = {
        "name": `calculate_${ promptKey }_array`,
        "description": `Return the best ${ promptKey } responses`,
        "parameters": {
          "type": "object",
          "properties": {
            "result": {
              "type": "array",
              "description": description,
            }
          },
          "required": ["result"]
        }
      }
  }

  if (openaiFunction) {
    return [ openaiFunction ];
  } else {
    return null;
  }
}