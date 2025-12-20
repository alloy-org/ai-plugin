import { noteUrlFromUUID, pluralize } from "app-util"
import { ATTEMPT_FIRST_PASS, ATTEMPT_INDIVIDUAL, ATTEMPT_KEYWORD_PAIRS } from "constants/search-settings"
import { phase2_collectCandidates } from "functions/search/candidate-collection"
import { phase3_deepAnalysis, phase4_scoreAndRank, phase5_sanityCheck } from "functions/search/candidate-evaluation"
import { phase1_analyzeQuery } from "functions/search/query-breakdown"
import { preferredModel, preferredModels } from "providers/ai-provider-settings"
import { llmPrompt } from "providers/fetch-ai-provider"

// Amplenote Smart Search Agent
//
// A multi-phase search system that intelligently finds notes matching complex criteria.
// Designed to complete in <60 seconds with ≤10 LLM queries.

export default class SearchAgent {
  // --------------------------------------------------------------------------
  constructor(app, plugin) {
    this.app = app;
    this.llm = llmPrompt.bind(null, app, plugin); // Function that takes prompt, returns parsed JSON
    this.plugin = plugin;
    this.retryCount = 0;
    this.maxRetries = 2;
    this.progressCallback = null;
    this.searchAttempt = ATTEMPT_FIRST_PASS;
  }

  // --------------------------------------------------------------------------
  // Main search entry point
  // @param {string} userQuery - The search query (50-5000 words)
  // @param {Object} options - Optional overrides for search criteria
  // @param {string[]} [options.primaryKeywords] - 3-5 primary keywords to search in note titles
  // @param {string[]} [options.secondaryKeywords] - 5-10 secondary keywords for content search
  // @param {string} [options.exactPhrase] - Exact phrase that must appear in note content
  // @param {Object} [options.criteria] - Hard requirements for notes
  // @param {boolean} [options.criteria.containsPDF] - Note must have PDF attachments
  // @param {boolean} [options.criteria.containsImage] - Note must have images
  // @param {boolean} [options.criteria.containsURL] - Note must have web links
  // @param {Object} [options.dateFilter] - Filter by creation or update date
  // @param {string} [options.dateFilter.type] - "created" or "updated"
  // @param {string} [options.dateFilter.after] - ISO date string (YYYY-MM-DD) for earliest date
  // @param {Object} [options.tagRequirement] - Tag filtering requirements
  // @param {string} [options.tagRequirement.mustHave] - Tag that MUST be present (normalized to lowercase with dashes)
  // @param {string} [options.tagRequirement.preferred] - Tag that is PREFERRED but not required (normalized to lowercase with dashes)
  // @param {number} [options.resultCount=1] - Number of results to return (1 for single best match, N for top N)
  // @returns {Promise<SearchResult>} Search result with found notes, confidence scores, and summary note
  async search(userQuery, options = {}) {
    try {
      this.emitProgress("Starting search analysis...");

      const criteria = await phase1_analyzeQuery(this, userQuery, options);
      const candidates = await phase2_collectCandidates(this, criteria);

      if (candidates.length === 0) {
        return this.handleNoResults(criteria);
      }

      const { validCandidates, allAnalyzed } = await phase3_deepAnalysis(this, candidates, criteria);

      let rankedNotes;
      if (validCandidates.length === 0 && this.retryCount < this.maxRetries) {
        return this.retryWithBroaderCriteria(userQuery, criteria);
      } else if (validCandidates.length === 0 && allAnalyzed.length > 0) {
        // No perfect matches, but we have partial matches
        console.log("No perfect matches found, using partial matches");
        rankedNotes = await phase4_scoreAndRank(this, allAnalyzed, criteria, userQuery);
      } else if (validCandidates.length > 0) {
        // Phase 4: Scoring & Ranking
        rankedNotes = await phase4_scoreAndRank(this, validCandidates, criteria, userQuery);
      } else {
        rankedNotes = [];
      }

      const finalResult = await phase5_sanityCheck(this, rankedNotes, criteria, userQuery);

      // Create summary note with results
      const summaryNote = await this.createSearchSummaryNote(userQuery, finalResult, rankedNotes);
      finalResult.summaryNote = summaryNote;

      return finalResult;

    } catch (error) {
      console.error("Search agent error:", error);
      return {
        found: false,
        error: error.message,
        suggestions: []
      };
    }
  }

  // --------------------------------------------------------------------------
  // Helper: Query LLM with retry across different models until valid response
  async llmWithRetry(prompt, validateFn, options = {}) {
    const models = preferredModels(this.app);
    const maxAttempts = Math.min(models.length, 3);

    for (let i = 0; i < maxAttempts; i++) {
      const aiModel = i === 0 ? null : models[i];
      console.log(`LLM attempt ${ i + 1 }${ aiModel ? ` with model ${ aiModel }` : " with default model" }`);

      try {
        const result = await this.llm(prompt, { ...options, aiModel });
        console.log("LLM response:", result);

        if (validateFn(result)) {
          console.log("LLM response validated successfully");
          return result;
        } else {
          console.log("LLM response failed validation, retrying...");
        }
      } catch (error) {
        console.error(`LLM attempt ${ i + 1 } failed:`, error);
      }
    }

    throw new Error("Failed to get valid response from LLM after multiple attempts");
  }

  // --------------------------------------------------------------------------
  formatResult(found, rankedNotes, resultCount) {
    const bestMatch = rankedNotes[0];

    if (bestMatch) {
      return {
        confidence: bestMatch.finalScore,
        found,
        message: `Found ${pluralize(resultCount, "note")}${found ? " matching" : ", none that quite match"} your criteria`,
        notes: rankedNotes.slice(0, resultCount).map((r, i) => ({
          checks: r.checks,
          note: {
            name: r.note.name,
            tags: r.note.tags || [],
            updated: r.note.updated,
            url: noteUrlFromUUID(r.note.uuid),
            uuid: r.note.uuid,
          },
          rank: i + 1,
          reasoning: r.scoreBreakdown.reasoning,
          score: r.finalScore,
        }))
      };
    } else {
      return {
        confidence: 0,
        found,
        message: "Could not find any notes matching your criteria",
      }
    }
  }

  // --------------------------------------------------------------------------
  // Create a summary note with search results
  async createSearchSummaryNote(userQuery, searchResult, rankedNotes) {
    this.emitProgress(`Creating search summary note for ${ rankedNotes.length } result${ rankedNotes.length === 1 ? "" : "s" }...`);
    try {
      // Get the AI model used for the search
      const modelUsed = preferredModel(this.app, this.plugin.lastModelUsed) || "unknown model";

      // Generate note title
      const titlePrompt = `Create a brief, descriptive title (max 40 chars) for a search results note.
Search query: "${ userQuery }"
Found: ${ searchResult.found ? "Yes" : "No" }
Return ONLY the title text, nothing else.`;

      const titleBase = await this.llm(titlePrompt);
      const now = new Date();
      const noteTitle = `${ modelUsed } result: ${ titleBase.trim() } (queried ${ now.toLocaleDateString() })`;

      // Build note content
      let noteContent = `# Search Results\n\n**Query:**\n ${ userQuery }\n\n`;

      if (rankedNotes && rankedNotes.length > 0) {
        noteContent += `## Matched Notes (${ rankedNotes.length })\n\n`;

        noteContent += `| ***Note*** | ***Score (1-10)*** | ***Reasoning*** | ***Tags*** |\n`;
        noteContent += `| --- | --- | --- | --- |\n`;
        rankedNotes.forEach((ranked, index) => {
          const note = ranked.note;
          noteContent += `| [${ note.name }](${ noteUrlFromUUID(note.uuid) }) |` +
            ` ${ note.score.toFixed(1) } |` +
            ` ${ note.reasoning || "N/A" } |` +
            ` ${ note.tags && note.tags.length > 0 ? note.tags.join(", ") : "Not found" } |\n`;
        });
      } else {
        noteContent += `## No Results Found\n\nNo notes matched the search criteria.\n\n`;
      }

      // Create the note
      const summaryNoteHandle = await this.app.createNote(noteTitle.trim(), ["plugins/ample-ai"]);
      await this.app.replaceNoteContent(summaryNoteHandle, noteContent);
      this.emitProgress(`Created search summary note: <a href="${ noteUrlFromUUID(summaryNoteHandle.uuid) }">${ noteTitle }</a>`);

      return {
        uuid: summaryNoteHandle.uuid,
        name: noteTitle.trim(),
        url: await summaryNoteHandle.url()
      };
    } catch (error) {
      console.error("Failed to create search summary note:", error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Helper: Parallel execution with concurrency limit
  async parallelLimit(tasks, limit) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });

      results.push(promise);
      executing.push(promise);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }

  // --------------------------------------------------------------------------
  // Retry with broader search criteria
  async retryWithBroaderCriteria(userQuery, originalCriteria) {
    this.retryCount++;

    // Update search attempt strategy based on retry count
    if (this.retryCount === 1) {
      this.searchAttempt = ATTEMPT_KEYWORD_PAIRS;
      console.log("Retrying with keyword pairs strategy...");
      this.emitProgress("Retrying with keyword pairs...");
    } else if (this.retryCount >= 2) {
      this.searchAttempt = ATTEMPT_INDIVIDUAL;
      console.log("Retrying with individual keyword strategy...");
      this.emitProgress("Retrying with individual keywords...");
    }

    const broaderCriteria = originalCriteria.withOverrides({
      primaryKeywords: [
        ...originalCriteria.primaryKeywords,
        ...originalCriteria.secondaryKeywords.slice(0, 2)
      ],
      tagRequirement: {
        mustHave: null, // Remove hard tag requirement
        preferred: originalCriteria.tagRequirement.mustHave ||
          originalCriteria.tagRequirement.preferred
      }
    });

    return this.search(userQuery, broaderCriteria);
  }

  // --------------------------------------------------------------------------
  // Handle no results found
  handleNoResults(criteria) {
    return {
      found: false,
      message: "No notes found matching your criteria",
      criteria,
      suggestion: "Try removing some filters or using broader search terms"
    };
  }

  // --------------------------------------------------------------------------
  emitProgress(message) {
    console.log(`[SearchAgent#emitProgress] ${ message }`);
    if (this.progressCallback) {
      this.progressCallback(message);
    }
  }

  // --------------------------------------------------------------------------
  onProgress(callback) {
    this.progressCallback = callback;
  }
}
