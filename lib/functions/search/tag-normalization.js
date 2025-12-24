// Tag normalization helpers

// --------------------------------------------------------------------------
// Normalize a user-provided tag string into Amplenote-style tag format.
// Note: `note.tags` is already normalized by Amplenote; this is primarily for user input like "Some Tag".
//
// @param {string|null|undefined} tagName - Input tag string
// @returns {string|null} Normalized tag string (e.g., "some-tag"), or null when input is not a string
export function normalizedTagFromTagName(tagName) {
  if (!tagName) return null;
  if (typeof tagName !== "string") return null;

  return tagName.toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}


