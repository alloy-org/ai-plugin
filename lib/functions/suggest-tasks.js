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

  const chosenTasks = [];
  const response = await notePromptResponse(plugin, app, app.context.noteUUID, "suggestTasks", {},
    {
      allowResponse, contentIndexText });
  if (response) {
    let unchosenTasks = taskArrayFromResponse(response);

    while(true) {
      const promptOptions = unchosenTasks.map(t => ({ label: t, value: t }));
      if (!promptOptions.length) break;
      promptOptions.push({ label: "Done picking tasks", value: "done" });
      promptOptions.push({ label: "Add more tasks", value: "more" });
      const promptString = `Which tasks would you like to add to your note?` +
        (chosenTasks.length ? `\nAdded ${ chosenTasks.length } task${ chosenTasks.length === 1 ? "" : "s" } so far` : "");

      const insertTask = await app.prompt(promptString, {
        inputs: [
          {
            label: "Choose tasks",
            options: promptOptions,
            type: "radio",
            value: promptOptions[0].value,
          }
        ]
      });

      if (insertTask) {
        if (insertTask === "done") {
          break;
        } else if (insertTask === "more") {
          await addMoreTasks(plugin, app, allowResponse, contentIndexText, chosenTasks, unchosenTasks);
        } else {
          chosenTasks.push(insertTask)
          unchosenTasks = unchosenTasks.filter(task => !chosenTasks.includes(task));
        }
      } else {
        break;
      }
    }
  } else {
    app.alert("Could not determine any tasks to suggest from the existing note content");
    return null;
  }

  if (chosenTasks.length) {
    const taskArray = chosenTasks.map(task => `- [ ] ${ task }\n`);
    console.debug("Replacing with tasks", taskArray);
    await app.context.replaceSelection(`\n${ taskArray.join("\n") }`);
  }
  return null;
}

// --------------------------------------------------------------------------
// Private
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
async function addMoreTasks(plugin, app, allowResponse, contentIndexText, chosenTasks, unchosenTasks) {
  const rejectedResponses = unchosenTasks;
  const moreTaskResponse = await notePromptResponse(plugin, app, app.context.noteUUID, "suggestTasks", { chosenTasks },
    { allowResponse, contentIndexText, rejectedResponses });
  const newTasks = moreTaskResponse && taskArrayFromResponse(moreTaskResponse);
  if (newTasks) {
    newTasks.forEach(t => (!unchosenTasks.includes(t) && !chosenTasks.includes(t) ? unchosenTasks.push(t) : null))
  }
}

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
