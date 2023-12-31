import { notePromptResponse, recommendedAiModels } from "../model-picker"
import { optionWithoutPrefix } from "../util"

// --------------------------------------------------------------------------
export function groceryArrayFromContent(content) {
  const lines = content.split("\n");
  const groceryLines = lines.filter(line => line.match(/^[-*\[]\s/));
  const groceryArray = groceryLines.map(line => optionWithoutPrefix(line).replace(/<!--.*-->/g, "").trim());
  return groceryArray;
}

// --------------------------------------------------------------------------
export async function groceryContentFromJsonOrText(plugin, app, noteUUID, groceryArray) {
  const jsonModels = await recommendedAiModels(plugin, app, "sortGroceriesJson");
  if (jsonModels.length) {
    const confirmation = groceryCountJsonConfirmation.bind(null, groceryArray.length);
    const jsonGroceries = await notePromptResponse(plugin, app, noteUUID, "sortGroceriesJson", { groceryArray },
      { allowResponse: confirmation });
    if (typeof(jsonGroceries) === "object") {
      return noteContentFromGroceryJsonResponse(jsonGroceries)
    }
  } else {
    const sortedListContent = await notePromptResponse(plugin, app, noteUUID, "sortGroceriesText", { groceryArray },
      { allowResponse: groceryCountTextConfirmation.bind(null, groceryArray.length) });
    if (sortedListContent?.length) {
      return noteContentFromGroceryTextResponse(sortedListContent)
    }
  }
}

// --------------------------------------------------------------------------
// Private
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
function noteContentFromGroceryJsonResponse(jsonGroceries) {
  let text = "";

  for (const aisle of Object.keys(jsonGroceries)) {
    const groceries = jsonGroceries[aisle];

    text += `# ${ aisle }\n`;
    groceries.forEach(grocery => {
      text += `- [ ] ${ grocery }\n`;
    });
    text += "\n";
  }

  return text;
}

// --------------------------------------------------------------------------
function noteContentFromGroceryTextResponse(text) {
  // Remove dividers
  text = text.replace(/^[\\-]{3,100}/g, "");

  // Replace bullets with tasks
  text = text.replace(/^([-\\*]|\[\s\])\s/g, "- [ ] ");

  // Remove possible markdown designation
  text = text.replace(/^[\s]*```.*/g, "");

  return text.trim();
}

// --------------------------------------------------------------------------
function groceryCountJsonConfirmation(originalCount, proposedJson) {
  if (!proposedJson || typeof(proposedJson) !== "object") return false;

  const newCount = Object.values(proposedJson).reduce((sum, array) => sum + array.length, 0);
  console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
  return newCount === originalCount;
}

// --------------------------------------------------------------------------
function groceryCountTextConfirmation(originalCount, proposedContent) {
  if (!proposedContent?.length) return false;

  const newCount = proposedContent.match(/^[-*\s]*\[[\s\]]+[\w]/gm)?.length || 0;
  console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
  return newCount === originalCount;
}
