import { notePromptResponse } from "../model-picker"
import { arrayFromResponseString, optionWithoutPrefix } from "../util"

// --------------------------------------------------------------------------
export async function taskArrayFromSuggestions(plugin, app, contentIndexText) {
  const allowResponse = response => {
    const validJson = (typeof(response) === "object" && (response.result || response.response?.result ||
      response.input?.response?.result || response.input?.result));
    const validString = (typeof(response) === "string" && arrayFromResponseString(response)?.length);
    return validJson || validString;
  }
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
// Handle the variety of response formats WBH has observed being returned by Ollama & OpenAI (incl strings,
// and all sorts of weird variations on JSON)
function taskArrayFromResponse(response) {
  if (typeof(response) === "string") {
    return arrayFromResponseString(response);
  } else {
    let tasks = response.result || response.response?.result || response.input?.response?.result || response.input?.result;
    if (typeof (tasks) === "object" && !Array.isArray(tasks)) {
      tasks = Object.values(tasks);
      if (Array.isArray(tasks) && Array.isArray(tasks[0])) {
        tasks = tasks[0];
      }
    }

    if (!Array.isArray(tasks)) {
      console.error("Could not determine tasks from response", response);
      return [];
    }

    // Handles cases where LLM responds with [{ task: "blah" }, { task: "blah2" }]
    if (tasks.find(t => typeof(t) !== "string")) {
      tasks = tasks.map(task => {
        if (typeof(task) === "string") {
          return task;
        } else if (Array.isArray(task)) {
          return task[0];
        } else {
          const objectValues = Object.values(task);
          return objectValues[0];
        }
      })
    }

    if (tasks.length === 1 && tasks[0].includes("\n")) {
      tasks = tasks[0].split("\n");
    }

    const tasksWithoutPrefix = tasks.map(taskText => optionWithoutPrefix(taskText));
    console.debug("Received tasks", tasksWithoutPrefix);
    return tasksWithoutPrefix;
  }
}
