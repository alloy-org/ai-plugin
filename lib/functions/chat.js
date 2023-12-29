import { responseFromPrompts } from "../model-picker"

// --------------------------------------------------------------------------
export async function initiateChat(plugin, app, aiModels, messageHistory = []) {
  let promptHistory;
  if (messageHistory.length) {
    promptHistory = messageHistory;
  } else {
    promptHistory = [{ content: "What's on your mind?", role: "assistant" }];
  }
  while(true) {
    const conversation = promptHistory.map(chat => `${ chat.role }: ${ chat.message }`).join("\n\n");
    const [ userMessage, modelToUse ] = await app.prompt(conversation, { inputs: [
        { type: "text", label: "Message to send" },
        {
          type: "radio",
          label: "Send to",
          options: aiModels.map(model => ({ label: model, value: model })),
          value: plugin.lastModelUsed,
        },
      ]
    }, { scrollToBottom: true });
    if (modelToUse) {
      promptHistory.push({ role: "user", content: userMessage });
      const response = await responseFromPrompts(plugin, app, modelToUse, "chat", promptHistory);
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
