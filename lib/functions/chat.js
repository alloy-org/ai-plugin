import { responseFromPrompts } from "../model-picker"

// --------------------------------------------------------------------------
export async function initiateChat(plugin, app, aiModels, messageHistory = []) {
  let promptHistory;
  if (messageHistory.length) {
    promptHistory = messageHistory;
  } else {
    promptHistory = [{ content: "What's on your mind?", role: "assistant" }];
  }
  const modelsQueried = []
  while(true) {
    const conversation = promptHistory.map(chat => `${ chat.role }: ${ chat.content }`).join("\n\n");
    console.debug("Prompting user for next message to send to", plugin.lastModelUsed || aiModels[0]);
    const [ userMessage, modelToUse ] = await app.prompt(conversation, { inputs: [
        { type: "text", label: "Message to send" },
        {
          type: "radio",
          label: "Send to",
          options: aiModels.map(model => ({ label: model, value: model })),
          value: plugin.lastModelUsed || aiModels[0],
        },
      ]
    }, { scrollToBottom: true });
    if (modelToUse) {
      promptHistory.push({ role: "user", content: userMessage });
      modelsQueried.push(modelToUse);
      const response = await responseFromPrompts(plugin, app, modelToUse, "chat", promptHistory, { modelsQueried });
      if (response) {
        promptHistory.push({ role: "assistant", content: `[${ modelToUse }] ${ response }` });
        const alertResponse = await app.alert(response, { preface: conversation, actions: [{ icon: "navigate_next", label: "Ask a follow up question" }] })
        if (alertResponse === 0) continue;
      }
    }
    break;
  }
  console.debug("Finished chat with history", promptHistory);
}
