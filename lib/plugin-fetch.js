import fetch from "isomorphic-fetch"

// --------------------------------------------------------------------------
export async function requestWithRetry(app, model, messages, apiKey, { retries = 3, timeoutSeconds = 30 } = {}) {
  let error, response;

  for (let i = 0; i < retries; i++) {
    try {
      response = await Promise.race([
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ apiKey }`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model, messages })
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeoutSeconds * 1000)
        )
      ]);
    } catch (e) {
      error = e;
      console.log(`Attempt ${ i + 1 } failed with`, e, `at ${ new Date() }. Retrying...`);
    }
  }

  if (!response) {
    app.alert("Failed to call OpenAI: " + error);
    return null;
  } else if (response.ok) {
    const result = await response.json();

    const { choices: [ { message: { content } } ] } = result;
    return content;
  } else if (response.status === 401) {
    app.alert("Invalid OpenAI key. Please configure your OpenAI key in plugin settings.");
    return null;
  } else {
    const result = await response.json();
    if (result && result.error) {
      app.alert("Failed to call OpenAI: " + result.error.message);
      return null;
    }
  }
}

// --------------------------------------------------------------------------
// `promptParams` is an object consisting of `noteContent` key and an optional `instructions` key
export async function callOpenAI(app, messages, model, apiKey, timeoutSeconds) {
  try {
    const model = model?.trim()?.length ? model : "gpt-3.5-turbo";
    return await requestWithRetry(app, model, messages, apiKey, { timeoutSeconds });
  } catch (error) {
    app.alert("Failed to call OpenAI: " + error);
    return null;
  }
}
