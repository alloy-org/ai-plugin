import {
  KEYWORD_BODY_PRIMARY_WEIGHT,
  KEYWORD_BODY_SECONDARY_WEIGHT,
  KEYWORD_DENSITY_DIVISOR,
  KEYWORD_TAG_PRIMARY_WEIGHT,
  KEYWORD_TAG_SECONDARY_WEIGHT,
  KEYWORD_TITLE_PRIMARY_WEIGHT,
  KEYWORD_TITLE_SECONDARY_WEIGHT,
  MAX_CHARACTERS_TO_SEARCH_BODY
} from "constants/search-settings"

const MAX_LENGTH_REDUCTION = 10;

// SearchCandidateNote - Structured representation of a note candidate found during search
//
// Encapsulates all properties collected during the search process, including
// metadata, truncated content, match quality signals, and LLM scoring/reasoning.
export default class SearchCandidateNote {
  // Private field for UUID to ensure url stays in sync
  #uuid;

  // --------------------------------------------------------------------------
  // @param {string} uuid - Note UUID
  // @param {string} name - Note title
  // @param {Array<string>} tags - Note tags
  // @param {string} created - ISO timestamp of note creation
  // @param {string} updated - ISO timestamp of last note update
  // @param {string} bodyContent - Truncated note content (up to MAX_CHARACTERS_TO_SEARCH_BODY)
  // @param {number} originalContentLength - Original length of full note content before truncation
  // @param {number} matchCount - Number of search query permutations that matched this note
  constructor(uuid, name, tags, created, updated, bodyContent, originalContentLength, matchCount = 1) {
    // Basic note metadata
    this.#uuid = uuid;
    this.created = created;
    this.name = name;
    this.tags = tags || [];
    this.updated = updated;

    // Content
    // Store up to MAX_CHARACTERS_TO_SEARCH_BODY of the note content
    this.bodyContent = bodyContent;
    // Original length before truncation
    this.originalContentLength = originalContentLength;

    // Search signals
    this.keywordDensityEstimate = 0;  // Preliminary score based on keyword match density
    this.matchCount = matchCount;
    this.tagBoost = 0;

    // Evaluation results (populated in later phases)
    this.checks = {};          // Criteria checks (hasPDF, hasImage, etc)
    this.finalScore = 0;       // Final weighted score (0-10)
    this.reasoning = null;     // LLM reasoning for the score
    this.scoreBreakdown = {};  // Detailed score components from LLM
  }

  // --------------------------------------------------------------------------
  // UUID getter - returns the note's UUID
  get uuid() {
    return this.#uuid;
  }

  // --------------------------------------------------------------------------
  // URL getter - derives the Amplenote URL from the UUID
  // URL is always in sync with UUID since it's computed on access
  get url() {
    return `https://www.amplenote.com/notes/${ this.#uuid }`;
  }

  // --------------------------------------------------------------------------
  // Factory method to create a new instance by fetching note content from a noteHandle
  //
  // @param {Object} noteHandle - Note handle object from Amplenote Plugin API (app.filterNotes, app.searchNotes, app.notes.find, etc.)
  //   Expected properties:
  //   - uuid {string} - Note UUID
  //   - name {string} - Note title
  //   - tags {Array<string>} - Array of tag names applied to the note
  //   - created {string} - ISO timestamp of note creation
  //   - updated {string} - ISO timestamp of last note update
  //   Expected methods:
  //   - content() {Promise<string>} - Async method returning the note's markdown content
  // @param {number} matchCount - Initial match count (default 1)
  // @returns {Promise<SearchCandidateNote>} New instance with fetched and truncated content
  static create(noteHandle, fullContent, matchCount = 1) {
    const originalContentLength = fullContent ? fullContent.length : 0;
    const truncatedContent = fullContent ? fullContent.slice(0, MAX_CHARACTERS_TO_SEARCH_BODY) : "";

    return new SearchCandidateNote(noteHandle.uuid, noteHandle.name, noteHandle.tags,
      noteHandle.created, noteHandle.updated, truncatedContent, originalContentLength, matchCount);
  }

  // --------------------------------------------------------------------------
  // Calculate and set the keyword density estimate for this note
  // The estimate reflects the density of keyword matches relative to note length.
  // Higher values indicate more concentrated keyword matches in shorter content.
  //
  // Scoring:
  // - Primary keyword in title: KEYWORD_TITLE_PRIMARY_WEIGHT points per match
  // - Primary keyword in body: KEYWORD_BODY_PRIMARY_WEIGHT point per match
  // - Secondary keyword in title: KEYWORD_TITLE_SECONDARY_WEIGHT points per match
  // - Secondary keyword in body: KEYWORD_BODY_SECONDARY_WEIGHT points per match
  // - Primary keyword containing tag hierarchy part: KEYWORD_TAG_PRIMARY_WEIGHT point
  // - Secondary keyword containing tag hierarchy part: KEYWORD_TAG_SECONDARY_WEIGHT points
  //
  // Final score = totalPoints / (originalContentLength / KEYWORD_DENSITY_DIVISOR)
  //
  // @param {Array<string>} primaryKeywords - Primary search keywords
  // @param {Array<string>} secondaryKeywords - Secondary search keywords
  calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords) {
    let totalPoints = 0;
    const titleLower = (this.name || "").toLowerCase();
    const bodyLower = (this.bodyContent || "").toLowerCase();

    // Extract all tag hierarchy parts (e.g., "business/rigors" -> ["business", "rigors"])
    const tagParts = tagHierarchyPartsFromTags(this.tags);

    // Score primary keywords
    for (const keyword of primaryKeywords || []) {
      const keywordLower = keyword.toLowerCase();
      totalPoints += countMatches(titleLower, keywordLower) * KEYWORD_TITLE_PRIMARY_WEIGHT;
      totalPoints += countMatches(bodyLower, keywordLower) * KEYWORD_BODY_PRIMARY_WEIGHT;
      if (keywordContainsTagPart(keywordLower, tagParts)) {
        totalPoints += KEYWORD_TAG_PRIMARY_WEIGHT;
      }
    }

    // Score secondary keywords
    for (const keyword of secondaryKeywords || []) {
      const keywordLower = keyword.toLowerCase();
      totalPoints += countMatches(titleLower, keywordLower) * KEYWORD_TITLE_SECONDARY_WEIGHT;
      totalPoints += countMatches(bodyLower, keywordLower) * KEYWORD_BODY_SECONDARY_WEIGHT;
      if (keywordContainsTagPart(keywordLower, tagParts)) {
        totalPoints += KEYWORD_TAG_SECONDARY_WEIGHT;
      }
    }

    // Normalize by content length (use original full length, not truncated)
    // Minimum divisor of 1 to avoid division by zero or negative values
    const lengthReduction = Math.min(this.originalContentLength / KEYWORD_DENSITY_DIVISOR, MAX_LENGTH_REDUCTION);
    this.keywordDensityEstimate = totalPoints - lengthReduction;
  }

  // --------------------------------------------------------------------------
  // Increment the match count for this candidate
  incrementMatchCount(amount = 1) {
    this.matchCount += amount;
  }

  // --------------------------------------------------------------------------
  // Set the body content and original content length from the provided content string.
  // Truncates the content to MAX_CHARACTERS_TO_SEARCH_BODY and updates originalContentLength.
  //
  // @param {string} content - The full note content
  setBodyContent(content) {
    this.originalContentLength = content ? content.length : 0;
    this.bodyContent = content ? content.slice(0, MAX_CHARACTERS_TO_SEARCH_BODY) : "";
  }

  // --------------------------------------------------------------------------
  // Set the tag boost multiplier
  setTagBoost(boost) {
    this.tagBoost = boost;
  }
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Count how many times a keyword appears in text using word boundary matching
//
// @param {string} text - Text to search in (already lowercased)
// @param {string} keyword - Keyword to find (already lowercased)
// @returns {number} Number of matches found
function countMatches(text, keyword) {
  if (!text || !keyword) return 0;
  // Escape special regex characters in the keyword
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use word boundary or start/whitespace matching
  const pattern = new RegExp(`(?:^|\\b|\\s)${ escapedKeyword }`, "gi");
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

// --------------------------------------------------------------------------
// Check if a keyword contains any part of the tag hierarchy
//
// @param {string} keywordLower - Keyword (already lowercased)
// @param {Array<string>} tagParts - Array of tag hierarchy parts (already lowercased)
// @returns {boolean} True if keyword contains any tag part
function keywordContainsTagPart(keywordLower, tagParts) {
  for (const tagPart of tagParts) {
    if (keywordLower.includes(tagPart)) {
      return true;
    }
  }
  return false;
}

// --------------------------------------------------------------------------
// Extract all unique tag hierarchy parts from an array of tags
// E.g., ["business/rigors", "personal/finance"] -> ["business", "rigors", "personal", "finance"]
//
// @param {Array<string>} tags - Array of tag strings
// @returns {Array<string>} Array of unique lowercased tag hierarchy parts
function tagHierarchyPartsFromTags(tags) {
  const parts = new Set();
  for (const tag of tags || []) {
    const segments = tag.split("/");
    for (const segment of segments) {
      const trimmed = segment.trim().toLowerCase();
      if (trimmed) {
        parts.add(trimmed);
      }
    }
  }
  return Array.from(parts);
}
