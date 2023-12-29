import { responseFromPrompts } from "../model-picker"

// --------------------------------------------------------------------------
export async function initiateChat(plugin, app, aiModels, messageHistory = []) {
  let promptHistory = [{ message: "What's on your mind?", role: "assistant" }];
  while(true) {
    const loopMessages = [];
    const conversation = promptHistory.map(chat => `${ chat.role }: ${ chat.message }`).join("\n\n");
    const [ message, modelToUse ] = await app.prompt(conversation, { inputs: [
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
      loopMessages.push({ role: "user", message });
      const response = await responseFromPrompts(plugin, app, modelToUse, "chat", messageHistory);
      if (response) {
        loopMessages.push({ role: "assistant", message: `[${ modelToUse }] ${ response }` });
        const alertResponse = await app.alert(response, { preface: conversation, actions: [{ icon: "navigate_next", label: "Ask a follow up question" }] })
        if (alertResponse === 0) {
          promptHistory = promptHistory.concat(loopMessages);
          messageHistory = messageHistory.concat(loopMessages);
        } else {
          break;
        }
      } else {
        break;
      }
    } else {
      break;
    }
  }
}
