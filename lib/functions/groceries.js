// --------------------------------------------------------------------------
export function noteContentFromGroceryResponse(text) {
  // Remove preceding character from each line in "- [ ]" or "* [ ]" cases
  text = text.replace(/\n[-\\*][\s]+\[/gm, "\n[");

  // Remove dividers
  text = text.replace(/^[\\-]{3,100}/g, "");

  // Replace bullets with tasks
  text = text.replace(/^[-\\*]\s/g, "[ ] ");

  return text;
}

// --------------------------------------------------------------------------
export function groceryCountConfirmation(originalCount, proposedContent) {
  if (!proposedContent?.length) return false;

  const newCount = proposedContent.match(/^[-*\[]\s/g)?.length || 0;
  console.debug("Original list had", originalCount, "items, AI-proposed list appears to have", newCount, "items", newCount === originalCount ? "Accepting response" : "Rejecting response");
  return newCount === originalCount;
}
