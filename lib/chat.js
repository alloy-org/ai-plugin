import { responseFromPrompts } from "./model-picker.js";

// --------------------------------------------------------------------------
export async function initiateChat(plugin, app, aiModels) {
  let messageHistory = [];
  let promptHistory = [{ message: "What's on your mind?", role: "assistant" }];
  while(true) {
    const loopMessages = [];
    const conversation = promptHistory.map(chat => `${ chat.role }: ${ chat.message }`).join("\n\n");
    const [ message, modelToUse ] = await app.prompt(conversation, { inputs: [
        { type: "text", label: "Message to send" },
        { type: "radio", label: "Send to", options: aiModels.map(model => ({ label: model.split(":")[0], value: model })) }
      ] });
    if (modelToUse) {
      loopMessages.push({ role: "user", message });
      const response = responseFromPrompts(this, app, modelToUse, messageHistory);
      if (response) {
        loopMessages.push({ role: "assistant", message: `[${ modelToUse }] ${ response }` });
        const alertResponse = await app.alert(response, { preface: conversation, actions: [{ icon: "navigate_next", label: "Ask a follow up question" }] })
        if (alertResponse === 0) {
          promptHistory = promptHistory.concat(loopMessages)
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