import { DALL_E_DEFAULT } from "../constants/provider"
import { CORS_PROXY } from "../constants/settings"
import { IMAGE_FROM_PRECEDING_LABEL } from "../constants/settings"

// --------------------------------------------------------------------------------------
export async function imageFromPreceding(plugin, app, apiKey) {
  const note = await app.notes.find(app.context.noteUUID);
  const noteContent = await note.content();
  const promptIndex = noteContent.indexOf(`{${ plugin.constants.pluginName }: ${ IMAGE_FROM_PRECEDING_LABEL }`);
  const precedingContent = noteContent.substring(0, promptIndex).trim();
  const prompt = precedingContent.split("\n").pop();
  console.debug("Deduced prompt", prompt);
  if (prompt?.trim()) {
    try {
      const markdown = await imageMarkdownFromPrompt(plugin, app, prompt.trim(), apiKey, { note });
      if (markdown) {
        app.context.replaceSelection(markdown);
      }
    } catch(e) {
      console.error("Error generating images from preceding text", e);
      app.alert("There was an error generating images from preceding text:" + e);
    }
  } else {
    app.alert("Could not determine preceding text to use as a prompt");
  }
}

// --------------------------------------------------------------------------------------
export async function imageFromPrompt(plugin, app, apiKey) {
  const instruction = await app.prompt("Describe the image you would like to generate");
  if (!instruction) return;
  const markdown = await imageMarkdownFromPrompt(plugin, app, instruction, apiKey);
  if (markdown) {
    app.context.replaceSelection(markdown);
  }
}

// --------------------------------------------------------------------------------------
// Private
// --------------------------------------------------------------------------------------

// --------------------------------------------------------------------------------------
async function sizeModelFromUser(plugin, app, prompt) {
  const sizeModel = await app.prompt(`Generating image for "${ prompt }"`, {
    inputs: [{
      label: "Model & Size",
      options: [
        { label: "Dall-e-2 3x 512x512", value: "512x512~dall-e-2" },
        { label: "Dall-e-2 3x 1024x1024", value: "1024x1024~dall-e-2" },
        { label: "Dall-e-3 1x 1024x1024", value: "1024x1024~dall-e-3" },
        { label: "Dall-e-3 1x 1792x1024", value: "1792x1024~dall-e-3" },
        { label: "Dall-e-3 1x 1024x1792", value: "1024x1792~dall-e-3" },
      ],
      type: "radio",
      value: plugin.lastImageModel || DALL_E_DEFAULT,
    }]
  });
  plugin.lastImageModel = sizeModel;
  return sizeModel.split("~");
}

// --------------------------------------------------------------------------------------
async function imageMarkdownFromPrompt(plugin, app, prompt, apiKey, { note = null } = {}) {
  app.alert("Generating images...")
  const [ size, model ] = await sizeModelFromUser(plugin, app, prompt)

  // https://platform.openai.com/docs/guides/images/usage
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${ apiKey }`, "Content-Type": "application/json" },
    // As of Dec 2023, v3 can only generate one image per run
    body: JSON.stringify({ prompt, model, n: model === "dall-e-2" ? 3 : 1, size, })
  });
  const result = await response.json();
  const { data } = result;
  if (data?.length) {
    const urls = data.map(d => d.url);
    console.debug("Received options", urls, "at", new Date());
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
      return imageMarkdownFromPrompt(plugin, app, prompt, { note });
    } else if (chosenImageURL) {
      console.debug("Fetching and uploading chosen URL", chosenImageURL)
      const imageData = await fetchImageAsDataURL(chosenImageURL);
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
  const response = await fetch(`${ CORS_PROXY }/${ url }`);
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
