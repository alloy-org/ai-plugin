import { CORS_PROXY } from "../constants/settings"

// --------------------------------------------------------------------------------------
export async function imageFromPreceding(plugin, app, apiKey) {
  const note = await app.notes.find(app.context.noteUUID);
  const noteContent = await note.content();
  const promptIndex = noteContent.indexOf(`{${ this.constants.pluginName }: from preceding}`);
  const precedingContent = noteContent.substring(0, promptIndex).trim();
  const prompt = precedingContent.split("\n").pop();
  console.log("Deduced prompt", prompt);
  if (prompt?.trim()) {
    const markdown = await imageMarkdownFromPrompt(app, prompt.trim(), { note });
    if (markdown) {
      app.context.replaceSelection(markdown);
    }
  } else {
    app.alert("Could not determine preceding text to use as a prompt");
  }
}

// --------------------------------------------------------------------------------------
export async function imageFromPrompt(plugin, app, apiKey) {
  const instruction = await app.prompt("What would you like to generate images of?");
  if (!instruction) return;
  const markdown = await imageMarkdownFromPrompt(app, instruction);
  if (markdown) {
    app.context.replaceSelection(markdown);
  }
}

// --------------------------------------------------------------------------------------
// Private
// --------------------------------------------------------------------------------------

// --------------------------------------------------------------------------------------
async function imageMarkdownFromPrompt(app, prompt, { note = null } = {}) {
  // Aka "It's not *us* making this slow, fine developer friend"
  console.log("C'mon OpenAI you can do it... request sent at", new Date())
  // https://platform.openai.com/docs/guides/images/usage
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ app.settings["API Key"].trim() }`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      n: this.constants.generatedImageCount(app),
      size: `${ this.constants.imageSize(app) }x${ this.constants.imageSize(app) }`,
    })
  });
  const result = await response.json();
  const { data } = result;
  if (data?.length) {
    const urls = data.map(d => d.url);
    console.log("Received options", urls, "at", new Date());
    const radioOptions = urls.map(url => ({ image: url, value: url }));
    radioOptions.push({ label: "More options", value: "more" });
    const chosenImageURL = await app.prompt(`Received ${ urls.length } options`, {
      inputs: [{
        label: "Choose an image",
        options: radioOptions,
        type: "radio"
      }]
    });
    if (chosenImageURL === "more") {
      return this._imageMarkdownFromPrompt(app, prompt, { note });
    } else if (chosenImageURL) {
      console.log("Fetching and uploading chosen URL", chosenImageURL)
      const imageData = await this._fetchImageAsDataURL(chosenImageURL);
      if (!note) note = await app.notes.find(app.context.noteUUID);
      const ampleImageUrl = await note.attachMedia(imageData);
      return `![image](${ ampleImageUrl })`;
    }
    return null;
  } else {
    return null;
  }
}

// --------------------------------------------------------------------------------------
async function fetchImageAsDataURL(url) {
  const response = await fetch(`${ this.constants.corsProxy }/${ url }`);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = event => {
      resolve(event.target.result);
    };

    reader.onerror = function (event) {
      reader.abort();
      reject(event.target.error);
    };

    reader.readAsDataURL(blob);
  });
}
