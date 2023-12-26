// --------------------------------------------------------------------------
export function groceryArrayFromContent(content) {
  const lines = content.split("\n");
  const groceryLines = lines.filter(line => line.match(/^[-*\[]\s/));
  const groceryArray = groceryLines.map(line => line.replace(/^[-*\[\]\s]+/g, "").replace(/<!--.*-->/g, "").trim());
  return groceryArray;
}

// --------------------------------------------------------------------------
export function noteContentFromGroceryResponse(jsonGroceries) {
  let text = "";

  Object.fromEntries(jsonGroceries).forEach((key, groceries) => {
    text += `# ${ key }\n`;
    groceries.forEach(grocery => {
      text += `- [ ] ${ grocery }\n`;
    });
    text += "\n";
  });

  return text;
}

// --------------------------------------------------------------------------
export function noteContentFromGroceryTextResponse(text) {
  // Remove dividers
  text = text.replace(/^[\\-]{3,100}/g, "");

  // Replace bullets with tasks
  text = text.replace(/^([-\\*]|\[\s\])\s/g, "- [ ] ");

  return text;
}

// --------------------------------------------------------------------------
export function groceryCountConfirmation(originalCount, proposedJson) {
  if (!proposedJson || typeof(proposedJson) !== "object") return false;

  const newCount = Object.values(proposedJson).reduce((sum, array) => sum + array.length, 0);
  console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
  return newCount === originalCount;
}

// --------------------------------------------------------------------------
export function groceryCountTextConfirmation(originalCount, proposedText) {
  if (!proposedContent?.length) return false;

  const newCount = proposedContent.match(/^[-*\[]\s/gm)?.length || 0;
  console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
  return newCount === originalCount;
}
