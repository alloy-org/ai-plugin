import {
  KEYWORD_BODY_PRIMARY_WEIGHT,
  KEYWORD_BODY_SECONDARY_WEIGHT,
  KEYWORD_DENSITY_DIVISOR,
  KEYWORD_TAG_PRIMARY_WEIGHT,
  KEYWORD_TAG_SECONDARY_WEIGHT,
  KEYWORD_TITLE_PRIMARY_WEIGHT,
  KEYWORD_TITLE_SECONDARY_WEIGHT,
  MAX_CHARACTERS_TO_SEARCH_BODY,
  PRE_CONTENT_MAX_SCORE_PER_KEYWORD,
  PRE_CONTENT_MIN_PRIMARY_SCORE,
  PRE_CONTENT_MIN_SECONDARY_SCORE,
  PRE_CONTENT_SECONDARY_MULTIPLIER,
  PRE_CONTENT_TAG_WORD_PRIMARY_SCORE,
  PRE_CONTENT_TAG_WORD_SECONDARY_SCORE
} from "constants/search-settings"

const MAX_LENGTH_REDUCTION = 10;

// --------------------------------------------------------------------------
// SearchCandidateNote - Structured representation of a note candidate found during search
//
// Encapsulates all properties collected during the search process, including
// metadata, truncated content, match quality signals, and LLM scoring/reasoning.
//
// The preliminary heuristic used to decide which notes to grab content for is preContentMatchScore, which
// is an aggregation of individual keyword scores recorded in this.scorePerKeyword. After we've fetched note
// content for the top MAX_CANDIDATES_FOR_DENSITY_CALCULATION candidates, we calculate keywordDensityEstimate
// for each note, which becomes the primary non-LLM heuristic of which notes seem to be most closely aligned with
// the search criteria.
export default class SearchCandidateNote {
  // Private field for UUID to ensure url stays in sync
  #uuid;

  // --------------------------------------------------------------------------
  // @param {string} uuid - Note UUID
  // @param {string} name - Note title
  // @param {Array<string>} tags - Note tags
  // @param {string} created - ISO timestamp of note creation
  // @param {string} updated - ISO timestamp of last note update
  constructor(uuid, name, tags, created, updated, { bodyContent = null } = {}) {
    // Basic note metadata
    this.#uuid = uuid;
    this.created = created;
    this.name = name;
    this.tags = tags || [];
    this.updated = updated;

    // Store up to MAX_CHARACTERS_TO_SEARCH_BODY of the note content
    this.bodyContent = bodyContent?.slice(0, MAX_CHARACTERS_TO_SEARCH_BODY) || "";
    // Original length before truncation
    this.originalContentLength = bodyContent ? bodyContent.length : 0;

    // Search signals
    this.keywordDensityEstimate = 0;  // Final pre-LLM score of the note's relevance, based on how many of expected keywords are contained in body/title/tags
    this.keywordDensityIncludesTagBoost = false;
    this.preContentMatchScore = 0;    // Initial pre-LLM score of the note's relevance, based on name/tags before fetching body
    this.scorePerKeyword = {};        // { keyword: score } for pre-content-fetch scoring
    this.tagBoost = 0;

    // Evaluation results (populated in later phases)
    this.checks = {};          // Criteria checks (hasPDF, hasImage, etc)
    this.finalScore = 0;       // Final weighted score (0-10) from the LLM's evaluation in phase4_scoreAndRank
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
  // @returns {Promise<SearchCandidateNote>} New instance with fetched and truncated content
  static create(noteHandle) {
    return new SearchCandidateNote(noteHandle.uuid, noteHandle.name, noteHandle.tags,
      noteHandle.created, noteHandle.updated);
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
    this.keywordDensityIncludesTagBoost = Number.isFinite(this.tagBoost) && this.tagBoost > 0;
    this.keywordDensityEstimate = this.tagBoost + totalPoints - lengthReduction;
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
  // Ensure pre-content scores are calculated for the given keywords.
  // For each keyword, if a score doesn't already exist in scorePerKeyword,
  // calculates and stores the score based on matches in note name and tags.
  // Updates preContentMatchScore after processing all keywords.
  //
  // @param {boolean} isPrimary - Whether these are primary keywords (higher weight)
  // @param {Array<string>} keywords - Keywords to ensure scores for
  ensureKeywordPreContentScores(isPrimary, keywords) {
    const nameLower = (this.name || "").toLowerCase();

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();

      // Skip if we already have a score for this keyword
      if (this.scorePerKeyword[keywordLower] !== undefined) continue;

      // Calculate name match score
      const nameMatchScore = scoreFromNameMatch(keywordLower, nameLower, isPrimary);

      // Calculate tag match score
      const tagMatchScore = scoreFromTagMatches(keywordLower, this.tags, isPrimary);

      // Combine scores, capped at max
      const totalScore = Math.min(nameMatchScore + tagMatchScore, PRE_CONTENT_MAX_SCORE_PER_KEYWORD);

      // Store score for this keyword
      this.scorePerKeyword[keywordLower] = totalScore;
    }

    // Recalculate total preContentMatchScore
    this.preContentMatchScore = Object.values(this.scorePerKeyword).reduce((sum, s) => sum + s, 0);
  }

  // --------------------------------------------------------------------------
  // Set the tag boost multiplier
  setTagBoost(boost) {
    this.tagBoost = boost;

    if (Number.isFinite(boost) && boost > 0 && !this.keywordDensityIncludesTagBoost) {
      this.keywordDensityEstimate += boost;
      this.keywordDensityIncludesTagBoost = true;
    }
  }
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Calculate the match score for a keyword matching in the note name.
// Uses formula: matchLength * (0.02 * matchLength + 0.1)
// For secondary keywords, the result is multiplied by PRE_CONTENT_SECONDARY_MULTIPLIER.
//
// @param {string} keywordLower - Keyword (already lowercased)
// @param {string} nameLower - Note name (already lowercased)
// @param {boolean} isPrimary - Whether this is a primary keyword
// @returns {number} Score for name matches
function scoreFromNameMatch(keywordLower, nameLower, isPrimary) {
  if (!keywordLower || !nameLower) return 0;

  // Check if keyword appears in name
  const matchIndex = nameLower.indexOf(keywordLower);
  if (matchIndex === -1) return 0;

  const matchLength = keywordLower.length;
  // Formula: matchLength * (0.02 * matchLength + 0.1)
  // Yields: 5 chars = 1pt, 10 chars = 3pts, 15 chars = 6pts, 20 chars = 10pts
  let rawScore = matchLength * (0.02 * matchLength + 0.1);

  // Apply minimum and maximum
  const minScore = isPrimary ? PRE_CONTENT_MIN_PRIMARY_SCORE : PRE_CONTENT_MIN_SECONDARY_SCORE;
  rawScore = Math.max(rawScore, minScore);
  rawScore = Math.min(rawScore, PRE_CONTENT_MAX_SCORE_PER_KEYWORD);

  // Apply secondary multiplier if not primary
  if (!isPrimary) {
    rawScore = rawScore * PRE_CONTENT_SECONDARY_MULTIPLIER;
  }

  return rawScore;
}

// --------------------------------------------------------------------------
// Calculate the match score for a keyword matching in the note's tags.
// Tags are normalized: "/" and "-" are converted to spaces, then split into words.
// Scoring:
// - Full tag match (after normalization): uses same formula as name matching
// - Word-level match (keyword matches start of a tag word): fixed score per word
//
// @param {string} keywordLower - Keyword (already lowercased)
// @param {Array<string>} tags - Note tags
// @param {boolean} isPrimary - Whether this is a primary keyword
// @returns {number} Score for tag matches
function scoreFromTagMatches(keywordLower, tags, isPrimary) {
  if (!keywordLower || !tags || !tags.length) return 0;

  let totalScore = 0;
  const minMatchLengthForWordScore = 4;

  for (const hierarchicalTagString of tags) {
    // Normalize tag: convert "/" and "-" to spaces, lowercase
    const normalizedTag = hierarchicalTagString.replace(/[/\-]/g, " ");

    // Check for full keyword match in normalized tag
    if (normalizedTag.includes(keywordLower)) {
      const matchLength = keywordLower.length;
      let rawScore = matchLength * (0.02 * matchLength + 0.1);
      const minScore = isPrimary ? PRE_CONTENT_MIN_PRIMARY_SCORE : PRE_CONTENT_MIN_SECONDARY_SCORE;
      rawScore = Math.max(rawScore, minScore);
      rawScore = Math.min(rawScore, PRE_CONTENT_MAX_SCORE_PER_KEYWORD);
      if (!isPrimary) {
        rawScore = rawScore * PRE_CONTENT_SECONDARY_MULTIPLIER;
      }
      totalScore += rawScore;
      continue; // Don't double-count word matches for this tag
    }

    // Check for word-level matches (keyword matches start of a tag word)
    const tagHierarchyParts = hierarchicalTagString.split("/");
    for (const tagHierarchyPart of tagHierarchyParts) {
      if (tagHierarchyPart.startsWith(keywordLower)) {
        const wordScore = isPrimary ? PRE_CONTENT_TAG_WORD_PRIMARY_SCORE : PRE_CONTENT_TAG_WORD_SECONDARY_SCORE;
        totalScore += wordScore;
      }
    }
  }

  return totalScore;
}

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
