import { notePromptResponse } from "../model-picker"

// --------------------------------------------------------------------------
export async function taskArrayFromSuggestions(plugin, app, contentIndexText) {
  const allowResponse = response => (typeof(response) === "object" && response.result);
  const possibleTasks = await notePromptResponse(plugin, app, app.context.noteUUID, "suggestTasks", {},
    {
      allowResponse, contentIndexText });
  if (possibleTasks) {
    const chosenTasks = [];
    let unchosenTasks = possibleTasks.result;
    while(true) {
      const promptOptions = unchosenTasks.map(t => ({ label: t, value: t }));
      if (!promptOptions.length) break;
      promptOptions.push({ label: "Done picking tasks", value: "done" });
      const insertTask = await app.prompt("Choose tasks to add", {
        inputs: [
          {
            label: "Choose a task to insert",
            options: promptOptions,
            type: "radio",
          }
        ]
      });

      if (insertTask && insertTask !== "done") {
        chosenTasks.push(insertTask)
        unchosenTasks = unchosenTasks.filter(task => !chosenTasks.includes(task));
        const taskContent = chosenTasks.map(task => `- [ ] ${ task }\n`);
        await app.context.replaceSelection(`\n${ taskContent }`);
      } else {
        break;
      }
    }
  } else {
    app.alert("Could not determine any tasks to suggest from the existing note content");
    return null;
  }
}
