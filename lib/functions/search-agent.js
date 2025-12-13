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
  }

  // --------------------------------------------------------------------------
  // Main search entry point
  // @param {string} userQuery - The search query (50-5000 words)
  // @param {Object} options - Optional overrides
  // @returns {Promise<SearchResult>}
  async search(userQuery, options = {}) {
    try {
      this.emitProgress("Starting search analysis...");

      // Phase 1: Query Analysis
      const criteria = await this.phase1_analyzeQuery(userQuery, options);

      // Phase 2: Initial Filtering
      const candidates = await this.phase2_collectCandidates(criteria);

      if (candidates.length === 0) {
        return this.handleNoResults(criteria);
      }

      // Phase 3: Deep Analysis
      const { validCandidates, allAnalyzed } = await this.phase3_deepAnalysis(candidates, criteria);

      let rankedNotes;
      if (validCandidates.length === 0 && this.retryCount < this.maxRetries) {
        return this.retryWithBroaderCriteria(userQuery, criteria);
      } else if (validCandidates.length === 0 && allAnalyzed.length > 0) {
        // No perfect matches, but we have partial matches
        console.log("No perfect matches found, using partial matches");
        rankedNotes = await this.phase4_scoreAndRank(allAnalyzed, criteria, userQuery);
      } else if (validCandidates.length > 0) {
        // Phase 4: Scoring & Ranking
        rankedNotes = await this.phase4_scoreAndRank(validCandidates, criteria, userQuery);
      } else {
        rankedNotes = [];
      }

      // Phase 5: Sanity Check
      const finalResult = await this.phase5_sanityCheck(rankedNotes, criteria, userQuery);

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
    const { preferredModels } = await import("providers/ai-provider-settings");
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
  // Phase 1: Extract structured search criteria from natural language
  async phase1_analyzeQuery(userQuery, options) {
    this.emitProgress("Phase 1: Analyzing query...");

    const analysisPrompt = `
Analyze this note search query and extract structured search criteria.

User Query: "${ userQuery }"

Extract:
1. PRIMARY_KEYWORDS: 3-5 words most likely to appear in the note TITLE
2. SECONDARY_KEYWORDS: 5-10 additional words likely in note content
3. EXACT_PHRASE: If user wants exact text match, extract it (or null)
4. CRITERIA:
   - containsPDF: Does user want notes with PDF attachments?
   - containsImage: Does user want notes with images?
   - containsURL: Does user want notes with web links?
5. DATE_FILTER:
   - type: "created" or "updated" (or null if no date mentioned)
   - after: ISO date string (YYYY-MM-DD) for earliest date
6. TAG_REQUIREMENT:
   - mustHave: Tag that MUST be present (null if none required)
   - preferred: Tag that"s PREFERRED but not required (null if none)
7. RESULT_COUNT: 1 for single best match, or N for top N results

Return ONLY valid JSON:
{
  "primaryKeywords": ["word1", "word2"],
  "secondaryKeywords": ["word3", "word4", "word5"],
  "exactPhrase": null,
  "criteria": {
    "containsPDF": false,
    "containsImage": false,
    "containsURL": false
  },
  "dateFilter": null,
  "tagRequirement": {
    "mustHave": null,
    "preferred": null
  },
  "resultCount": 1
}
`;

    const validateCriteria = (result) => {
      return result?.primaryKeywords && Array.isArray(result.primaryKeywords) && result.primaryKeywords.length > 0;
    };

    const extracted = await this.llmWithRetry(analysisPrompt, validateCriteria, { jsonResponse: true });
    console.log("Extracted criteria:", extracted);

    // Ensure required fields exist with defaults
    if (!extracted.secondaryKeywords) extracted.secondaryKeywords = [];
    if (!extracted.criteria) extracted.criteria = { containsPDF: false, containsImage: false, containsURL: false };
    if (!extracted.tagRequirement) extracted.tagRequirement = { mustHave: null, preferred: null };

    // Normalize tag requirements
    const normalizeTag = (tag) => {
      if (!tag) return tag;
      return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    };

    const extractedTagReq = {
      mustHave: normalizeTag(extracted.tagRequirement?.mustHave),
      preferred: normalizeTag(extracted.tagRequirement?.preferred)
    };

    const optionsTagReq = {
      mustHave: normalizeTag(options.tagRequirement?.mustHave),
      preferred: normalizeTag(options.tagRequirement?.preferred)
    };

    // Apply any manual overrides from options (but don't override extracted values with undefined)
    const result = { ...extracted };
    if (options.criteria) {
      result.criteria = { ...extracted.criteria, ...options.criteria };
    }
    result.tagRequirement = { ...extractedTagReq, ...optionsTagReq };

    return result;
  }

  // --------------------------------------------------------------------------
  // Phase 2: Collect candidate notes using fast API calls
  async phase2_collectCandidates(criteria) {
    this.emitProgress("Phase 2: Filtering candidates...");

    const { primaryKeywords, secondaryKeywords, exactPhrase, dateFilter, tagRequirement } = criteria;

    // Step 2.1: Title-based filtering (fastest)
    let titleCandidates = [];

    if (primaryKeywords.length > 0) {
      const titleQuery = primaryKeywords.join(" ");
      titleCandidates = await this.app.filterNotes({
        query: titleQuery,
        tag: tagRequirement.mustHave || undefined
      });

      console.log(`Title search for "${ titleQuery }": ${ titleCandidates.length } results`);
    }

    // Step 2.2: Content search if needed
    let candidates = titleCandidates;

    const needsContentSearch =
      titleCandidates.length < 5 ||
      exactPhrase ||
      criteria.criteria.containsPDF ||
      criteria.criteria.containsImage;

    if (needsContentSearch) {
      const contentQuery = exactPhrase || [...primaryKeywords, ...secondaryKeywords.slice(0, 3)].join(" ");
      const contentCandidates = await this.app.searchNotes(contentQuery);

      console.log(`Content search for "${ contentQuery }": ${ contentCandidates.length } results`);

      // Merge, preferring title matches
      candidates = this.mergeCandidates(titleCandidates, contentCandidates);
    }

    // Step 2.3: Apply date filter (in memory)
    if (dateFilter) {
      const dateField = dateFilter.type === "created" ? "created" : "updated";
      const afterDate = new Date(dateFilter.after);

      candidates = candidates.filter(note => {
        const noteDate = new Date(note[dateField]);
        return noteDate >= afterDate;
      });

      console.log(`After date filter: ${ candidates.length } candidates`);
    }

    // Step 2.4: Tag analysis and boosting
    if (candidates.length > 0) {
      const tagFrequency = this.analyzeTagFrequency(candidates);

      candidates = candidates.map(note => {
        let tagBoost = 1.0;

        if (tagRequirement.preferred && note.tags) {
          const hasPreferredTag = note.tags.some(tag =>
            tag === tagRequirement.preferred ||
            tag.startsWith(tagRequirement.preferred + "/")
          );
          if (hasPreferredTag) tagBoost = 1.5;
        }

        return { ...note, _tagBoost: tagBoost };
      });
    }

    this.emitProgress(`Found ${ candidates.length } candidate notes`);
    return candidates;
  }

  // --------------------------------------------------------------------------
  // Phase 3: Deep analysis of top candidates only
  async phase3_deepAnalysis(candidates, criteria) {
    this.emitProgress("Phase 3: Analyzing top candidates...");

    // Preliminary ranking to identify top candidates
    const preliminaryRanked = this.rankPreliminary(candidates, criteria);
    const topN = Math.min(8, preliminaryRanked.length);
    const topCandidates = preliminaryRanked.slice(0, topN);

    console.log(`Deep analyzing top ${ topN } of ${ candidates.length } candidates`);

    // Fetch required metadata in parallel (but limit concurrency)
    const deepAnalysis = await this.parallelLimit(
      topCandidates.map(note => () => this.analyzeNoteDeep(note, criteria)),
      5 // Max 5 concurrent API calls
    );

    // Filter out candidates that fail hard requirements
    const validCandidates = deepAnalysis.filter(analysis => {
      const { checks } = analysis;

      if (criteria.criteria.containsPDF && !checks.hasPDF) return false;
      if (criteria.criteria.containsImage && !checks.hasImage) return false;
      if (criteria.exactPhrase && !checks.hasExactPhrase) return false;
      if (criteria.criteria.containsURL && !checks.hasURL) return false;

      return true;
    });

    console.log(`${ validCandidates.length } candidates passed criteria checks`);

    this.emitProgress(`${ validCandidates.length } notes match all criteria`);
    return { validCandidates, allAnalyzed: deepAnalysis };
  }

  // --------------------------------------------------------------------------
  // Deep analyze a single note
  async analyzeNoteDeep(note, criteria) {
    const checks = {};
    let content = null;

    // Determine what we need to fetch
    const needAttachments = criteria.criteria.containsPDF;
    const needImages = criteria.criteria.containsImage;
    const needContent = criteria.exactPhrase || criteria.criteria.containsURL;

    // Fetch in parallel
    const fetches = [];

    if (needAttachments) {
      fetches.push(
        this.app.notes.find(note.uuid).then(n => n.attachments())
          .then(attachments => {
            checks.hasPDF = attachments.some(a =>
              a.type === "application/pdf" || a.name.endsWith(".pdf")
            );
            checks.attachmentCount = attachments.length;
          })
      );
    }

    if (needImages) {
      fetches.push(
        this.app.notes.find(note.uuid).then(n => n.images())
          .then(images => {
            checks.hasImage = images.length > 0;
            checks.imageCount = images.length;
          })
      );
    }

    if (needContent) {
      fetches.push(
        this.app.notes.find(note.uuid).then(n => n.content())
          .then(noteContent => {
            content = noteContent;

            if (criteria.exactPhrase) {
              checks.hasExactPhrase = noteContent.includes(criteria.exactPhrase);
            }

            if (criteria.criteria.containsURL) {
              checks.hasURL = /https?:\/\/[^\s]+/.test(noteContent);
              // Extract URL count
              const urls = noteContent.match(/https?:\/\/[^\s]+/g);
              checks.urlCount = urls ? urls.length : 0;
            }
          })
      );
    }

    await Promise.all(fetches);
    console.log(`Deep analysis of ${ JSON.stringify(criteria) } finds needAttachments: ${ checks.hasPDF }, needImages: ${ checks.hasImage }, needContent: ${ content ? "fetched" : "not fetched" } for note "${ note.name }"`);

    return {
      note,
      content: needContent ? content : null,
      contentPreview: content ? content.substring(0, 500) : null,
      checks
    };
  }

  // --------------------------------------------------------------------------
  // Phase 4: Score and rank candidates using LLM
  async phase4_scoreAndRank(analyzedCandidates, criteria, userQuery) {
    this.emitProgress("Phase 4: Ranking results...");

    const scoringPrompt = `
You are scoring note search results. Original query: "${ userQuery }"

Extracted criteria:
${ JSON.stringify(criteria, null, 2) }

Score each candidate note 0-10 on these dimensions:
1. TITLE_RELEVANCE: How well does the note title match the search intent?
2. KEYWORD_DENSITY: How concentrated are the keywords in the content?
3. CRITERIA_MATCH: Does it meet all the hard requirements (PDF/image/URL/exact phrase)?
4. TAG_ALIGNMENT: Does it have relevant or preferred tags?
5. RECENCY: Is it recent enough (if recency matters)?

Candidates to score:
${ analyzedCandidates.map((candidate, index) => `
${ index }. "${ candidate.note.name }"
   UUID: ${ candidate.note.uuid }
   Tags: ${ candidate.note.tags?.join(", ") || "none" }
   Updated: ${ candidate.note.updated }
   ${ candidate.contentPreview ? `Content preview: ${ candidate.contentPreview }` : "No content fetched" }
   Checks: ${ JSON.stringify(candidate.checks) }
`).join("\n") }

Return ONLY valid JSON array:
[
  {
    "noteIndex": 0,
    "titleRelevance": 8,
    "keywordDensity": 7,
    "criteriaMatch": 10,
    "tagAlignment": 6,
    "recency": 5,
    "reasoning": "Brief explanation of why this note matches"
  }
]
`;

    const scores = await this.llm(scoringPrompt, { jsonResponse: true });
    console.log("Received scores from LLM:", scores, "Type:", typeof scores, "Is array:", Array.isArray(scores));

    // Ensure scores is an array
    const scoresArray = Array.isArray(scores) ? scores : [scores];

    // Calculate weighted final scores
    const weights = {
      titleRelevance: 0.30,
      keywordDensity: 0.25,
      criteriaMatch: 0.20,
      tagAlignment: 0.15,
      recency: 0.10
    };

    const rankedNotes = scoresArray.map(score => {
      const finalScore =
        score.titleRelevance * weights.titleRelevance +
        score.keywordDensity * weights.keywordDensity +
        score.criteriaMatch * weights.criteriaMatch +
        score.tagAlignment * weights.tagAlignment +
        score.recency * weights.recency;

      return {
        note: analyzedCandidates[score.noteIndex].note,
        finalScore: Math.round(finalScore * 10) / 10, // Round to 1 decimal
        scoreBreakdown: score,
        checks: analyzedCandidates[score.noteIndex].checks
      };
    }).sort((a, b) => b.finalScore - a.finalScore);

    return rankedNotes;
  }

  // --------------------------------------------------------------------------
  // Phase 5: Sanity check and potential retry
  async phase5_sanityCheck(rankedNotes, criteria, userQuery) {
    this.emitProgress("Phase 5: Verifying results...");

    if (rankedNotes.length === 0) {
      return this.handleNoResults(criteria);
    }

    const topResult = rankedNotes[0];

    // Auto-accept if score is very high
    if (topResult.finalScore >= 9.5) {
      this.emitProgress("Found excellent match!");
      return this.formatResult(rankedNotes, criteria.resultCount);
    }

    // Sanity check for lower scores
    const sanityPrompt = `
Original query: "${ userQuery }"

Top recommended note:
- Title: "${ topResult.note.name }"
- Score: ${ topResult.finalScore }/10
- Tags: ${ topResult.note.tags?.join(", ") || "none" }
- Reasoning: ${ topResult.scoreBreakdown.reasoning }

Does this genuinely seem like what the user is looking for?

Consider:
1. Does the title make sense given the query?
2. Is the score reasonable (>6.0 suggests good match)?
3. Are there obvious mismatches?

Return ONLY valid JSON:
{
  "confident": true,
  "concerns": null,
  "suggestAction": "accept"
}

Or if not confident:
{
  "confident": false,
  "concerns": "Explanation of concern",
  "suggestAction": "retry_broader" | "retry_narrower" | "insufficient_data"
}
`;

    const sanityCheck = await this.llm(sanityPrompt, { jsonResponse: true });

    if (sanityCheck.confident || this.retryCount >= this.maxRetries) {
      this.emitProgress("Search complete!");
      return this.formatResult(rankedNotes, criteria.resultCount);
    }

    // Handle retry
    console.log(`Sanity check failed: ${ sanityCheck.concerns }`);
    this.retryCount++;

    if (sanityCheck.suggestAction === "retry_broader") {
      return this.retryWithBroaderCriteria(userQuery, criteria);
    } else if (sanityCheck.suggestAction === "insufficient_data") {
      return {
        found: false,
        message: "No notes found matching your criteria",
        suggestions: rankedNotes.slice(0, 3).map(r => ({
          note: r.note,
          score: r.finalScore,
          reason: "Close match but doesn't fully meet criteria"
        }))
      };
    }

    // Default: return what we have
    return this.formatResult(rankedNotes, criteria.resultCount);
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
      // Generate note title
      const titlePrompt = `Create a brief, descriptive title (max 60 chars) for a search results note.
Search query: "${ userQuery }"
Found: ${ searchResult.found ? "Yes" : "No" }
Return ONLY the title text, nothing else.`;

      const noteTitle = await this.llm(titlePrompt, { jsonResponse: false });

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
      const summaryNoteHandle = await this.app.createNote(noteTitle.trim(), ["search-results"]);
      await this.app.replaceNoteContent(summaryNoteHandle, noteContent);

      return {
        uuid: summaryNoteHandle.uuid,
        name: noteTitle.trim(),
        url: `amplenote://note/${ summaryNoteHandle.uuid }`
      };
    } catch (error) {
      console.error("Failed to create search summary note:", error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Helper: Preliminary ranking without LLM
  rankPreliminary(candidates, criteria) {
    return candidates.map(note => {
      let score = 0;

      // Title keyword matches (highest weight)
      const titleLower = (note.name || "").toLowerCase();
      criteria.primaryKeywords.forEach(kw => {
        if (titleLower.includes(kw.toLowerCase())) {
          score += 10;
        }
      });

      // Secondary keyword bonus
      criteria.secondaryKeywords.slice(0, 3).forEach(kw => {
        if (titleLower.includes(kw.toLowerCase())) {
          score += 3;
        }
      });

      // Tag boost
      score += (note._tagBoost || 1.0) * 5;

      // Recency bonus
      if (criteria.dateFilter) {
        const daysSinceUpdate = (Date.now() - new Date(note.updated)) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 5 - daysSinceUpdate / 30); // Decays over ~150 days
      }

      return { note, preliminaryScore: score };
    }).sort((a, b) => b.preliminaryScore - a.preliminaryScore)
      .map(item => item.note);
  }

  // --------------------------------------------------------------------------
  mergeCandidates(list1, list2) {
    const uuidSet = new Set(list1.map(n => n.uuid));
    const unique = list2.filter(n => !uuidSet.has(n.uuid));
    return [...list1, ...unique];
  }


  // --------------------------------------------------------------------------
  // Helper: Analyze tag frequency in candidates
  analyzeTagFrequency(candidates) {
    const frequency = {};

    candidates.forEach(note => {
      (note.tags || []).forEach(tag => {
        frequency[tag] = (frequency[tag] || 0) + 1;
      });
    });

    return frequency;
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
    console.log("Retrying with broader criteria...");
    this.emitProgress("Broadening search criteria...");

    const broaderCriteria = {
      ...originalCriteria,
      primaryKeywords: [
        ...originalCriteria.primaryKeywords,
        ...originalCriteria.secondaryKeywords.slice(0, 2)
      ],
      tagRequirement: {
        mustHave: null, // Remove hard tag requirement
        preferred: originalCriteria.tagRequirement.mustHave ||
          originalCriteria.tagRequirement.preferred
      }
    };

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
        criteria: criteria.criteria
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

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

// --------------------------------------------------------------------------
// Example: How to use the search agent in an Amplenote plugin
async function exampleUsage(app) {
  // Define your LLM provider (Claude, GPT, etc.)
  const llmProvider = async (prompt) => {
    // Call your LLM API here and return parsed JSON
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": app.settings["API Key"],
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    const data = await response.json();
    const text = data.content[0].text;

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) ||
      text.match(/\{[\s\S]*\}/);

    return JSON.parse(jsonMatch ? jsonMatch[1] || jsonMatch[0] : text);
  };

  // Create search agent
  const searchAgent = new AmplenoteSearchAgent(app, llmProvider);

  // Set up progress tracking
  searchAgent.onProgress((message) => {
    console.log(`Progress: ${ message }`);
    // Could update a status bar in UI
  });

  // Example 1: Find a single note
  const result1 = await searchAgent.search(
    "Find my note about the GitClear plugin API that has documentation about how to use filterNotes and searchNotes"
  );

  if (result1.found) {
    await app.alert(`Found: ${ result1.note.name }\nConfidence: ${ result1.confidence }/10`);
    await app.navigate(result1.note.url);
  }

  // Example 2: Find top 5 recent notes with images about vacation
  const result2 = await searchAgent.search(
    "Show me my recent notes about vacation that have photos in them",
    {
      resultCount: 5,
      criteria: { containsImage: true }
    }
  );

  if (result2.found) {
    const noteList = result2.notes
      .map(n => `${ n.rank }. ${ n.note.name } (score: ${ n.score })`)
      .join("\n");
    await app.alert(`Found ${ result2.count } notes:\n${ noteList }`);
  }

  // Example 3: Find note with exact phrase
  const result3 = await searchAgent.search(
    `Find the note where I wrote "the meeting is scheduled for next Thursday"`
  );

  return result1; // Or result2, result3 depending on use case
}
