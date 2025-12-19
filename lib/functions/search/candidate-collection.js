// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

import {
  ATTEMPT_FIRST_PASS,
  ATTEMPT_INDIVIDUAL,
  ATTEMPT_KEYWORD_PAIRS,
  MAX_PARALLEL_SEARCHES,
  MAX_RESULTS_RETURNED,
  MIN_FILTER_NOTES_RESULTS,
  MIN_TARGET_RESULTS
} from "constants/search-settings"

// --------------------------------------------------------------------------
// Phase 2: Collect candidate notes using fast API calls
// Searches for notes using title/content searches based on keywords. Uses different search
// strategies (all keywords, pairs, individual) depending on retry attempt. Automatically
// broadens search with secondary keywords if results < MIN_TARGET_RESULTS. Applies date
// filters and tag boosting to candidates.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {UserCriteria} criteria - Search criteria with keywords, filters, and requirements
// @returns {Promise<Array<Object>>} Array of candidate note objects with metadata and tag boosting
export async function phase2_collectCandidates(searchAgent, criteria) {
  searchAgent.emitProgress("Phase 2: Filtering candidates...");

  const { primaryKeywords, secondaryKeywords, exactPhrase, dateFilter, tagRequirement } = criteria;

  // Step 2.1: Title-based filtering using current search strategy
  const titleCandidates = await searchTitlesByStrategy(searchAgent, primaryKeywords, secondaryKeywords, tagRequirement);

  // Step 2.2: Content search if needed
  let candidates = titleCandidates;

  const needsContentSearch =
    titleCandidates.length < 5 ||
    exactPhrase ||
    criteria.booleanRequirements.containsPDF ||
    criteria.booleanRequirements.containsImage;

  if (needsContentSearch) {
    const contentQuery = exactPhrase || [...primaryKeywords, ...secondaryKeywords.slice(0, 3)].join(" ");
    const contentCandidates = await searchAgent.app.searchNotes(contentQuery);

    console.log(`Content search for "${ contentQuery }": ${ contentCandidates.length } results`);

    // Merge, preferring title matches
    candidates = mergeCandidates(titleCandidates, contentCandidates);
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
    const tagFrequency = analyzeTagFrequency(candidates);

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

  searchAgent.emitProgress(`Found ${ candidates.length } candidate notes`);
  return candidates;
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Helper: Merge two candidate lists, removing duplicates
function mergeCandidates(list1, list2) {
  const uuidSet = new Set(list1.map(n => n.uuid));
  const unique = list2.filter(n => !uuidSet.has(n.uuid));
  return [...list1, ...unique];
}

// --------------------------------------------------------------------------
// Helper: Analyze tag frequency in candidates
function analyzeTagFrequency(candidates) {
  const frequency = {};

  candidates.forEach(note => {
    (note.tags || []).forEach(tag => {
      frequency[tag] = (frequency[tag] || 0) + 1;
    });
  });

  return frequency;
}

// --------------------------------------------------------------------------
// Search note titles using strategy based on current search attempt
async function searchTitlesByStrategy(searchAgent, primaryKeywords, secondaryKeywords, tagRequirement) {
  if (primaryKeywords.length === 0) return [];

  // First search with primary keywords
  let results = await executeSearchStrategy(searchAgent, primaryKeywords, tagRequirement);

  // If we have fewer than MIN_TARGET_RESULTS, broaden search with secondary keywords
  if (results.length < MIN_TARGET_RESULTS && secondaryKeywords && secondaryKeywords.length > 0) {
    console.log(`[${ searchAgent.searchAttempt }] Below minimum target (${ MIN_TARGET_RESULTS }), broadening with secondary keywords`);

    const secondaryKeywordsToUse = secondaryKeywords.slice(0, 5);
    const secondaryResults = await executeSearchStrategy(searchAgent, secondaryKeywordsToUse, tagRequirement);
    console.log(`[${ searchAgent.searchAttempt }] Secondary keyword search: ${ secondaryResults.length } results`);

    // Merge without duplicates
    results = mergeCandidates(results, secondaryResults);
    console.log(`[${ searchAgent.searchAttempt }] Total after merging: ${ results.length } results`);
  }

  return results;
}

// --------------------------------------------------------------------------
// Execute the actual search based on the current search strategy.
// Uses different numbers of keywords per query based on search attempt:
// - First pass: 3 keywords per query (consecutive triplets)
// - Second pass: 2 keywords per query (consecutive pairs)
// - Third pass: 1 keyword per query (individual keywords, top 10 each)
//
// Falls back to app.searchNotes when filterNotes returns fewer than MIN_FILTER_NOTES_RESULTS.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Array<string>} keywords - Keywords to search for (each keyword may contain multiple words)
// @param {Object} tagRequirement - Tag filtering requirements
// @param {string} [tagRequirement.mustHave] - Tag that must be present
// @returns {Promise<Array<Object>>} Array of note objects (max MAX_RESULTS_RETURNED)
async function executeSearchStrategy(searchAgent, keywords, tagRequirement) {
  if (keywords.length === 0) return [];

  const strategyName = searchAgent.searchAttempt;

  // Determine combination size per query based on search attempt
  let keywordsPerQuery;
  let limitPerQuery = null;

  if (searchAgent.searchAttempt === ATTEMPT_FIRST_PASS) {
    keywordsPerQuery = 3;
  } else if (searchAgent.searchAttempt === ATTEMPT_KEYWORD_PAIRS) {
    keywordsPerQuery = 2;
  } else if (searchAgent.searchAttempt === ATTEMPT_INDIVIDUAL) {
    keywordsPerQuery = 1;
    limitPerQuery = 10; // Top 10 for each individual keyword
  } else {
    return [];
  }

  // Generate query combinations based on keywords per query
  const queries = generateQueryCombinations(keywords, keywordsPerQuery);

  // Execute all filterNotes queries in parallel (respecting MAX_PARALLEL_SEARCHES limit)
  const filterResults = [];
  for (let i = 0; i < queries.length; i += MAX_PARALLEL_SEARCHES) {
    const batch = queries.slice(i, i + MAX_PARALLEL_SEARCHES);
    const batchResults = await Promise.all(
      batch.map(async query => {
        const results = await searchAgent.app.filterNotes({
          query: query.join(" "),
          tag: tagRequirement.mustHave || undefined
        });
        // Apply per-query limit if specified (for individual keyword searches)
        return limitPerQuery ? results.slice(0, limitPerQuery) : results;
      })
    );
    filterResults.push(...batchResults.flat());
  }

  // Deduplicate filterNotes results
  const seen = new Set();
  const uniqueFilterResults = filterResults.filter(note => {
    if (seen.has(note.uuid)) return false;
    seen.add(note.uuid);
    return true;
  });

  // If filterNotes returned fewer than minimum, supplement with app.searchNotes
  let finalResults = uniqueFilterResults;
  if (uniqueFilterResults.length < MIN_FILTER_NOTES_RESULTS) {
    console.log(`[${ strategyName }] Filter results (${ uniqueFilterResults.length }) below minimum, supplementing with app.searchNotes`);

    // Execute searchNotes for each keyword in parallel batches
    const searchResults = [];
    for (let i = 0; i < keywords.length; i += MAX_PARALLEL_SEARCHES) {
      const batch = keywords.slice(i, i + MAX_PARALLEL_SEARCHES);
      const batchResults = await Promise.all(
        batch.map(keyword => searchAgent.app.searchNotes(keyword))
      );
      searchResults.push(...batchResults.flat());
    }

    console.log(`[${ strategyName }] app.searchNotes returned ${ searchResults.length } total results`);

    // Merge searchNotes results with filterNotes results, avoiding duplicates
    const supplementalResults = searchResults.filter(note => !seen.has(note.uuid));
    finalResults = [...uniqueFilterResults, ...supplementalResults];
    console.log(`[${ strategyName }] Combined total: ${ finalResults.length } results`);
  } else {
    console.log(`[${ strategyName }] Searched ${ queries.length } queries: ${ uniqueFilterResults.length } unique results`);
  }

  return finalResults.slice(0, MAX_RESULTS_RETURNED);
}

// --------------------------------------------------------------------------
// Generate query combinations based on how many keywords to include per combination.
// - keywordsPerCombination >= keywords.length: Returns all keywords as single query
// - keywordsPerCombination = 1: Returns individual keywords
// - keywordsPerCombination = 2: Returns consecutive pairs (plus first/last pair if 3+ keywords)
// - keywordsPerCombination = 3: Returns consecutive triplets
//
// @param {Array<string>} keywords - Array of keywords to combine
// @param {number} keywordsPerCombination - Number of keywords to include in each query combination
// @returns {Array<Array<string>>} Array of query combinations, each an array of keywords
function generateQueryCombinations(keywords, keywordsPerCombination) {
  if (keywordsPerCombination >= keywords.length) {
    // Use all keywords as one query
    return [keywords];
  }

  if (keywordsPerCombination === 1) {
    // Individual keywords
    return keywords.map(k => [k]);
  }

  if (keywordsPerCombination === 2) {
    // Consecutive pairs
    const pairs = [];
    for (let i = 0; i < keywords.length - 1; i++) {
      pairs.push([keywords[i], keywords[i + 1]]);
    }
    // Also add first and last as a pair if we have 3+ keywords
    if (keywords.length >= 3) {
      pairs.push([keywords[0], keywords[keywords.length - 1]]);
    }
    return pairs;
  }

  if (keywordsPerCombination === 3) {
    // Consecutive triplets
    const triplets = [];
    for (let i = 0; i <= keywords.length - 3; i++) {
      triplets.push([keywords[i], keywords[i + 1], keywords[i + 2]]);
    }
    // If we have fewer than 3 keywords but more than 0, use what we have
    if (triplets.length === 0) {
      return [keywords];
    }
    return triplets;
  }

  // For other values, fall back to using all keywords
  return [keywords];
}
