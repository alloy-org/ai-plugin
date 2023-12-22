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
