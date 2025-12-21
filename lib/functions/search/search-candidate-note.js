import { MAX_CHARACTERS_TO_SEARCH_BODY } from "constants/search-settings"

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
    this.name = name;
    this.tags = tags || [];
    this.created = created;
    this.updated = updated;

    // Content
    // Store up to MAX_CHARACTERS_TO_SEARCH_BODY of the note content
    this.bodyContent = bodyContent;
    // Original length before truncation
    this.originalContentLength = originalContentLength;

    // Search signals
    this.matchCount = matchCount;
    this.tagBoost = 1.0;

    // Evaluation results (populated in later phases)
    this.checks = {};          // Criteria checks (hasPDF, hasImage, etc)
    this.finalScore = 0;       // Final weighted score (0-10)
    this.rank = 0;             // Rank position among search results (1 = best match)
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
  static async create(noteHandle, matchCount = 1) {
    let fullContent = "";
    try {
      if (typeof noteHandle.content === "function") {
        fullContent = await noteHandle.content();
      } else {
        console.warn(`Note ${ noteHandle.uuid } (${ noteHandle.name }) handle has no content() method`);
      }
    } catch (error) {
      console.error(`Failed to fetch content for note ${ noteHandle.uuid }: ${ error.message }`);
    }

    const originalContentLength = fullContent ? fullContent.length : 0;
    const truncatedContent = fullContent ? fullContent.slice(0, MAX_CHARACTERS_TO_SEARCH_BODY) : "";

    return new SearchCandidateNote(
      noteHandle.uuid,
      noteHandle.name,
      noteHandle.tags,
      noteHandle.created,
      noteHandle.updated,
      truncatedContent,
      originalContentLength,
      matchCount
    );
  }

  // --------------------------------------------------------------------------
  // Increment the match count for this candidate
  incrementMatchCount(amount = 1) {
    this.matchCount += amount;
  }

  // --------------------------------------------------------------------------
  // Set the tag boost multiplier
  setTagBoost(boost) {
    this.tagBoost = boost;
  }
}
