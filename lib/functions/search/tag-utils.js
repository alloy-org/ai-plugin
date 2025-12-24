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

// --------------------------------------------------------------------------
// Normalize required tags into an array
// @param {Object|null} tagRequirement - Tag requirement object
// @returns {Array<string>} Required tags (empty when none)
export function requiredTagsFromTagRequirement(tagRequirement) {
  if (!tagRequirement) return [];

  const mustHave = tagRequirement.mustHave;
  if (!mustHave) return [];

  if (Array.isArray(mustHave)) {
    return mustHave.map(t => normalizedTagFromTagName(t)).filter(Boolean);
  }

  const normalizedTag = normalizedTagFromTagName(mustHave);
  return normalizedTag ? [normalizedTag] : [];
}
