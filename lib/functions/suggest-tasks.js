import { notePromptResponse } from "../model-picker"

// --------------------------------------------------------------------------
export async function taskArrayFromSuggestions(plugin, app, contentIndexText) {
  const allowResponse = response => (typeof(response) === "object" && (response.result || response.response?.result));
  const response = await notePromptResponse(plugin, app, app.context.noteUUID, "suggestTasks", {},
    {
      allowResponse, contentIndexText });
  if (response) {
    const chosenTasks = [];
    let unchosenTasks = taskArrayFromResponse(response);

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
        const taskArray = chosenTasks.map(task => `- [ ] ${ task }\n`);
        await app.context.replaceSelection(`\n${ taskArray.join("\n") }`);
      } else {
        break;
      }
    }
  } else {
    app.alert("Could not determine any tasks to suggest from the existing note content");
    return null;
  }
}

// --------------------------------------------------------------------------
// Private
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function taskArrayFromResponse(response) {
  let tasks = response.result || response.response?.result;
  if (tasks.length === 1 && tasks[0].includes("\n")) {
    tasks = tasks[0].split("\n");
  }
  const tasksWithoutPrefix = tasks.map(t => {
    const task = t.trim().replace(/^[*\-\d.]+\s*/, "");
    return task.replace(/^-?\s*\[\s*]\s+/, "");
  })
  console.debug("Received tasks", tasksWithoutPrefix);
  return tasksWithoutPrefix;
}
