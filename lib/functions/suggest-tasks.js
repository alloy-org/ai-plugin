import { notePromptResponse } from "../model-picker"

// --------------------------------------------------------------------------
export async function taskArrayFromSuggestions(plugin, app, contentIndexText) {
  const allowResponse = response => (typeof(response) === "object" && response.result);
  const possibleTasks = await notePromptResponse(plugin, app, app.context.noteUUID, "suggestTasks", {},
    {
      allowResponse, contentIndexText });
  if (possibleTasks) {
    while(true) {
      const insertTaskIndex = await app.prompt("Choose tasks to add", {

      });

      if (Number.isInteger(insertTaskIndex)) {

      } else {
        break;
      }
    }
  } else {
    app.alert("Could not determine any tasks to suggest from the existing note content");
    return null;
  }
}
