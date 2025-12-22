// UserCriteria - Structured representation of note search requirements
//
// Translates freeform user input into a structured object describing
// the note(s) the user desires the AI search agent to find.

import { DEFAULT_SEARCH_NOTES_RETURNED } from "constants/search-settings"

export default class UserCriteria {
  // --------------------------------------------------------------------------
  constructor(options = {}) {
    // 3-5 words most likely to appear in the note TITLE
    this.primaryKeywords = options.primaryKeywords || [];

    // 5-10 additional words likely in note content
    this.secondaryKeywords = options.secondaryKeywords || [];

    // Exact phrase that must appear in note content (or null)
    this.exactPhrase = options.exactPhrase || null;

    // Hard boolean requirements for notes (renamed from "criteria" to avoid name collision)
    this.booleanRequirements = {
      containsPDF: options.criteria?.containsPDF || false,
      containsImage: options.criteria?.containsImage || false,
      containsURL: options.criteria?.containsURL || false
    };

    // Filter by creation or update date
    this.dateFilter = options.dateFilter || null;
    // dateFilter structure: { type: "created" | "updated", after: "YYYY-MM-DD" }

    // Tag filtering requirements
    this.tagRequirement = {
      mustHave: options.tagRequirement?.mustHave || null,
      preferred: options.tagRequirement?.preferred || null
    };

    // Number of results to return (1 for single best match, N for top N)
    this.resultCount = options.resultCount || 1;
  }

  // --------------------------------------------------------------------------
  // Legacy compatibility: Allow accessing as .criteria for backward compatibility
  // This getter returns the booleanRequirements object when accessing .criteria
  get criteria() {
    return this.booleanRequirements;
  }

  // --------------------------------------------------------------------------
  // Legacy compatibility: Allow setting .criteria
  set criteria(value) {
    this.booleanRequirements = value;
  }

  // --------------------------------------------------------------------------
  // Create a new UserCriteria instance with some fields overridden
  // Useful for retry logic where we want to broaden/narrow search
  withOverrides(overrides = {}) {
    return new UserCriteria({
      primaryKeywords: overrides.primaryKeywords || this.primaryKeywords,
      secondaryKeywords: overrides.secondaryKeywords || this.secondaryKeywords,
      exactPhrase: overrides.exactPhrase !== undefined ? overrides.exactPhrase : this.exactPhrase,
      criteria: overrides.criteria || this.booleanRequirements,
      dateFilter: overrides.dateFilter !== undefined ? overrides.dateFilter : this.dateFilter,
      tagRequirement: overrides.tagRequirement || this.tagRequirement,
      resultCount: overrides.resultCount || this.resultCount
    });
  }

  // --------------------------------------------------------------------------
  // Normalize a tag (lowercase with dashes)
  static normalizeTag(tag) {
    if (!tag) return tag;
    return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  // --------------------------------------------------------------------------
  // Create UserCriteria from extracted LLM response with manual overrides
  static fromExtracted(extracted, options = {}) {
    // Normalize tag requirements from both sources
    const extractedTagReq = {
      mustHave: UserCriteria.normalizeTag(extracted.tagRequirement?.mustHave),
      preferred: UserCriteria.normalizeTag(extracted.tagRequirement?.preferred)
    };

    const optionsTagReq = {
      mustHave: UserCriteria.normalizeTag(options.tagRequirement?.mustHave),
      preferred: UserCriteria.normalizeTag(options.tagRequirement?.preferred)
    };

    // Merge extracted values with manual overrides
    return new UserCriteria({
      primaryKeywords: options.primaryKeywords || extracted.primaryKeywords || [],
      secondaryKeywords: options.secondaryKeywords || extracted.secondaryKeywords || [],
      exactPhrase: options.exactPhrase !== undefined ? options.exactPhrase : extracted.exactPhrase,
      criteria: options.criteria ?
        { ...extracted.criteria, ...options.criteria } :
        extracted.criteria,
      dateFilter: options.dateFilter !== undefined ? options.dateFilter : extracted.dateFilter,
      tagRequirement: { ...extractedTagReq, ...optionsTagReq },
      resultCount: options.resultCount || extracted.resultCount || DEFAULT_SEARCH_NOTES_RETURNED,
    });
  }

  // --------------------------------------------------------------------------
  // Convert to JSON for logging/debugging
  toJSON() {
    return {
      primaryKeywords: this.primaryKeywords,
      secondaryKeywords: this.secondaryKeywords,
      exactPhrase: this.exactPhrase,
      booleanRequirements: this.booleanRequirements,
      dateFilter: this.dateFilter,
      tagRequirement: this.tagRequirement,
      resultCount: this.resultCount
    };
  }
}
