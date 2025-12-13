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
  // Search attempt strategies
  static ATTEMPT_FIRST_PASS = "first_pass";        // Search all keywords together
  static ATTEMPT_KEYWORD_PAIRS = "keyword_pairs";  // Search keywords in pairs
  static ATTEMPT_INDIVIDUAL = "individual";        // Search each keyword individually

  // --------------------------------------------------------------------------
  constructor(app, plugin) {
    this.app = app;
    this.llm = llmPrompt.bind(null, app, plugin); // Function that takes prompt, returns parsed JSON
    this.plugin = plugin;
    this.retryCount = 0;
    this.maxRetries = 2;
    this.progressCallback = null;
    this.searchAttempt = SearchAgent.ATTEMPT_FIRST_PASS;
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

      // Phase 1: Query Analysis
      const criteria = await phase1_analyzeQuery(this, userQuery, options);

      // Phase 2: Initial Filtering
      const candidates = await phase2_collectCandidates(this, criteria);

      if (candidates.length === 0) {
        return this.handleNoResults(criteria);
      }

      // Phase 3: Deep Analysis
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

      // Phase 5: Sanity Check
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
  formatResult(rankedNotes, resultCount) {
    if (resultCount === 1) {
      // Single best match
      const best = rankedNotes[0];
      return {
        found: true,
        note: {
          uuid: best.note.uuid,
          name: best.note.name,
          url: `amplenote://note/${ best.note.uuid }`,
          tags: best.note.tags || [],
          updated: best.note.updated,
          created: best.note.created
        },
        confidence: best.finalScore,
        matchDetails: {
          titleRelevance: best.scoreBreakdown.titleRelevance,
          reasoning: best.scoreBreakdown.reasoning,
          checks: best.checks
        },
        scoreBreakdown: best.scoreBreakdown
      };
    } else {
      // Top N results
      return {
        found: true,
        count: Math.min(resultCount, rankedNotes.length),
        notes: rankedNotes.slice(0, resultCount).map((r, i) => ({
          rank: i + 1,
          score: r.finalScore,
          note: {
            uuid: r.note.uuid,
            name: r.note.name,
            url: `amplenote://note/${ r.note.uuid }`,
            tags: r.note.tags || [],
            updated: r.note.updated
          },
          reasoning: r.scoreBreakdown.reasoning,
          checks: r.checks
        }))
      };
    }
  }

  // --------------------------------------------------------------------------
  // Create a summary note with search results
  async createSearchSummaryNote(userQuery, searchResult, rankedNotes) {
    try {
      // Get the AI model used for the search
      const modelUsed = preferredModel(this.app, this.plugin.lastModelUsed) || "unknown model";

      // Generate note title
      const titlePrompt = `Create a brief, descriptive title (max 40 chars) for a search results note.
Search query: "${ userQuery }"
Found: ${ searchResult.found ? "Yes" : "No" }
Return ONLY the title text, nothing else.`;

      const titleBase = await this.llm(titlePrompt, { jsonResponse: false });
      const now = new Date();
      const noteTitle = `${ modelUsed } result: ${ titleBase.trim() } (queried ${ now.toLocaleDateString() })`;

      // Build note content
      let noteContent = `# Search Results\n\n**Query:** ${ userQuery }\n\n`;

      if (rankedNotes && rankedNotes.length > 0) {
        noteContent += `## Matched Notes (${ rankedNotes.length })\n\n`;

        rankedNotes.forEach((ranked, index) => {
          const note = ranked.note;
          noteContent += `${ index + 1 }. `;
          noteContent += `[[${ note.name }|note=${ note.uuid }]]`;
          noteContent += ` (Score: ${ ranked.finalScore.toFixed(1) }/10)\n`;

          if (ranked.scoreBreakdown?.reasoning) {
            noteContent += `   - ${ ranked.scoreBreakdown.reasoning }\n`;
          }

          if (note.tags && note.tags.length > 0) {
            noteContent += `   - Tags: ${ note.tags.join(", ") }\n`;
          }

          noteContent += `\n`;
        });
      } else {
        noteContent += `## No Results Found\n\nNo notes matched the search criteria.\n\n`;
      }

      // Create the note
      const summaryNoteHandle = await this.app.createNote(noteTitle.trim(), ["plugins/ample-ai"]);
      await this.app.replaceNoteContent(summaryNoteHandle, noteContent);

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
      this.searchAttempt = SearchAgent.ATTEMPT_KEYWORD_PAIRS;
      console.log("Retrying with keyword pairs strategy...");
      this.emitProgress("Retrying with keyword pairs...");
    } else if (this.retryCount >= 2) {
      this.searchAttempt = SearchAgent.ATTEMPT_INDIVIDUAL;
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
      attemptedKeywords: criteria.primaryKeywords,
      attemptedFilters: {
        dateFilter: criteria.dateFilter,
        tagRequirement: criteria.tagRequirement,
        booleanRequirements: criteria.booleanRequirements
      },
      suggestion: "Try removing some filters or using broader search terms"
    };
  }

  // --------------------------------------------------------------------------
  emitProgress(message) {
    console.log(`[SearchAgent] ${ message }`);
    if (this.progressCallback) {
      this.progressCallback(message);
    }
  }

  // --------------------------------------------------------------------------
  onProgress(callback) {
    this.progressCallback = callback;
  }
}
