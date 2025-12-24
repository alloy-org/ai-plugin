// Tag requirement helpers

import { normalizedTagFromTagName } from "functions/search/tag-normalization"

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


