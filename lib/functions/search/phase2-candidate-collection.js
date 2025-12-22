// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

import {
  ATTEMPT_FIRST_PASS,
  ATTEMPT_INDIVIDUAL,
  ATTEMPT_KEYWORD_PAIRS,
  MAX_CHARACTERS_TO_SEARCH_BODY,
  MAX_PARALLEL_SEARCHES,
  MAX_RESULTS_RETURNED,
  MAX_SECONDARY_KEYWORDS_TO_QUERY,
  MIN_FILTER_NOTES_RESULTS,
  MIN_TARGET_RESULTS
} from "constants/search-settings"
import SearchCandidateNote from "functions/search/search-candidate-note"

// --------------------------------------------------------------------------
// Phase 2: Collect candidate notes using fast API calls
// Searches for notes using title/content searches based on keywords. Uses different search
// strategies (all keywords, pairs, individual) depending on retry attempt. Automatically
// broadens search with secondary keywords if results < MIN_TARGET_RESULTS. Applies date
// filters and tag boosting to candidates.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {UserCriteria} criteria - Search criteria with keywords, filters, and requirements
// @returns {Promise<Array<SearchCandidateNote>>} Array of candidate note objects with metadata and tag boosting
export async function phase2_collectCandidates(searchAgent, criteria) {
  searchAgent.emitProgress("Phase 2: Filtering candidates...");

  const { dateFilter, primaryKeywords, resultCount, secondaryKeywords, tagRequirement } = criteria;

  // Step 2.1: Title-based filtering using current search strategy
  let candidates = await searchNotesByStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement);

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
    candidates.forEach(note => {
      let tagBoost = 1.0;

      if (tagRequirement.preferred && note.tags) {
        const hasPreferredTag = note.tags.some(tag =>
          tag === tagRequirement.preferred ||
          tag.startsWith(tagRequirement.preferred + "/")
        );
        if (hasPreferredTag) tagBoost = 1.5;
      }

      note.setTagBoost(tagBoost);
    });
  }

  searchAgent.emitProgress(`Found ${ candidates.length } candidate notes`);
  return candidates;
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Search note titles using strategy based on current search attempt
async function searchNotesByStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement) {
  if (primaryKeywords.length === 0) return [];

  const secondaryKeywordsToUse = (secondaryKeywords || []).slice(0, MAX_SECONDARY_KEYWORDS_TO_QUERY);
  return await executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywordsToUse, tagRequirement);
}

// --------------------------------------------------------------------------
// Execute the actual search based on the current search strategy.
// Uses different numbers of keywords per query based on search attempt:
// - First pass: 3 keywords per query (consecutive triplets)
// - Second pass: 2 keywords per query (consecutive pairs)
// - Third pass: 1 keyword per query (individual keywords, top 10 each)
//
// Computes `matchCount` for each candidate note based on how many query permutations matched it.
// Only falls back to app.searchNotes if the combined filterNotes candidates are fewer than
// MIN_FILTER_NOTES_RESULTS. When falling back, searchNotes results also increment matchCount.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Array<string>} primaryKeywords - Primary keywords to search for (each keyword may contain multiple words)
// @param {Array<string>} secondaryKeywords - Secondary keywords to broaden search with (optional)
// @param {number} resultCount - Number of results requested by user (used to scale thresholds/caps)
// @param {Object} tagRequirement - Tag filtering requirements
// @param {string} [tagRequirement.mustHave] - Tag that must be present
// @returns {Promise<Array<SearchCandidateNote>>} Array of note objects (max MAX_RESULTS_RETURNED)
async function executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement) {
  if (!primaryKeywords?.length) return [];

  const strategyName = searchAgent.searchAttempt;
  const effectiveResultCount = resultCount || 1;
  const minTargetResults = Math.max(MIN_TARGET_RESULTS, effectiveResultCount);
  const minFilterNotesResults = Math.max(MIN_FILTER_NOTES_RESULTS, effectiveResultCount);
  const maxResultsReturned = Math.max(MAX_RESULTS_RETURNED, effectiveResultCount);

  // Determine combination size per query based on search attempt
  const { keywordsPerQuery, maxResultsPerQuery } = strategyParamsForAttempt(searchAgent.searchAttempt);

  // Generate query combinations based on keywords per query
  const primaryQueries = generateQueryCombinations(primaryKeywords, keywordsPerQuery);
  const secondaryQueries = (secondaryKeywords?.length)
    ? generateQueryCombinations(secondaryKeywords, keywordsPerQuery)
    : [];

  // Accumulate candidates and matchCount across query permutations
  const candidatesByUuid = new Map(); // uuid -> SearchCandidateNote

  // 1) filterNotes primary permutations
  await addMatchesFromFilterNotes(searchAgent, candidatesByUuid, primaryQueries, tagRequirement, maxResultsPerQuery);

  // 2) filterNotes secondary permutations (only if we need to broaden)
  if (candidatesByUuid.size < minTargetResults && secondaryQueries.length) {
    console.log(`[${ strategyName }] Below minimum target (${ minTargetResults }), broadening filterNotes with secondary keywords`);
    await addMatchesFromFilterNotes(searchAgent, candidatesByUuid, secondaryQueries, tagRequirement, maxResultsPerQuery);
  }

  // 3/4) searchNotes primary then secondary ONLY if filterNotes produced too few candidates
  if (candidatesByUuid.size < minFilterNotesResults) {
    console.log(`[${ strategyName }] Too few candidates (${ candidatesByUuid.size }) below minimum (${ minFilterNotesResults }), supplementing with app.searchNotes`);
    await addMatchesFromSearchNotes(searchAgent, candidatesByUuid, primaryQueries, maxResultsPerQuery);

    if (candidatesByUuid.size < minFilterNotesResults && secondaryQueries.length) {
      console.log(`[${ strategyName }] Searching ${ secondaryQueries.length } secondary queries with app.searchNotes since we only located ${ candidatesByUuid.size } candidates so far`);
      await addMatchesFromSearchNotes(searchAgent, candidatesByUuid, secondaryQueries, maxResultsPerQuery);
    }
  } else {
    console.log(`[${ strategyName }] Searched ${ primaryQueries.length } primary filterNotes queries: ${ candidatesByUuid.size } unique candidates`);
  }

  const finalResults = Array.from(candidatesByUuid.values())
    .sort((a, b) => {
      const mc = (b.matchCount || 0) - (a.matchCount || 0);
      if (mc !== 0) return mc;
      // Tiebreaker: more recently updated first (if available)
      const bu = b.updated ? new Date(b.updated).getTime() : 0;
      const au = a.updated ? new Date(a.updated).getTime() : 0;
      return bu - au;
    });

  return finalResults.slice(0, maxResultsReturned);
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

// --------------------------------------------------------------------------
// Local helpers (search execution + matchCount accumulation)
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Derive query strategy parameters from current search attempt.
// Throws if searchAttempt is unknown (keywordsPerQuery should never be null).
//
// @param {string} searchAttempt - The current search attempt enum value
// @returns {{keywordsPerQuery: number, maxResultsPerQuery: (number|null)}} Strategy params.
//   maxResultsPerQuery caps how many results we consider from each query permutation (e.g. top 10 per query).
function strategyParamsForAttempt(searchAttempt) {
  if (searchAttempt === ATTEMPT_FIRST_PASS) return { keywordsPerQuery: 3, maxResultsPerQuery: null };
  if (searchAttempt === ATTEMPT_KEYWORD_PAIRS) return { keywordsPerQuery: 2, maxResultsPerQuery: null };
  if (searchAttempt === ATTEMPT_INDIVIDUAL) return { keywordsPerQuery: 1, maxResultsPerQuery: 10 }; // Top 10 per query
  throw new Error(`Unknown searchAttempt "${ searchAttempt }" (expected one of: ${ ATTEMPT_FIRST_PASS }, ${ ATTEMPT_KEYWORD_PAIRS }, ${ ATTEMPT_INDIVIDUAL })`);
}

// --------------------------------------------------------------------------
// Convert a keyword combination array into a single query string.
//
// @param {Array<string>} query - A query combination, e.g. ["foo", "bar"]
// @returns {string} Query string, e.g. "foo bar"
function queryStringFromCombination(query) {
  return (query || []).join(" ").trim();
}

// --------------------------------------------------------------------------
// Deduplicate note candidates by UUID within a single query's returned list.
// Prevents a single query response from incrementing matchCount multiple times
// for the same note.
//
// @param {Array<Object>} notes - Array of notes from app.filterNotes/app.searchNotes
// @returns {Array<Object>} Unique UUID note candidates derived from notes
function uniqueUuidNoteCandidatesFromNotes(notes) {
  const seen = new Set();
  const unique = [];
  for (const note of notes || []) {
    if (!note?.uuid) continue;
    if (seen.has(note.uuid)) continue;
    seen.add(note.uuid);
    unique.push(note);
  }
  return unique;
}

// --------------------------------------------------------------------------
// Upsert a candidate note into the map, incrementing matchCount.
//
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Map of uuid -> candidate note
// @param {Object} noteHandle - Note handle from Amplenote API (app.filterNotes, app.searchNotes, etc.)
// @param {number} increment - Amount to add to matchCount (default 1)
async function upsertCandidate(candidatesByUuid, noteHandle, increment = 1) {
  if (!noteHandle?.uuid) return;
  const existing = candidatesByUuid.get(noteHandle.uuid);
  if (existing) {
    existing.incrementMatchCount(increment);
    return;
  }
  const candidate = await SearchCandidateNote.create(noteHandle, increment);
  candidatesByUuid.set(noteHandle.uuid, candidate);
}

// --------------------------------------------------------------------------
// Execute app.filterNotes for each query permutation and increment matchCount
// for candidates returned per permutation.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Candidate accumulator
// @param {Array<Array<string>>} queries - Query permutations to execute
// @param {Object} tagRequirement - Tag filtering requirements (mustHave)
// @param {number|null} maxResultsPerQuery - Optional per-query result cap
async function addMatchesFromFilterNotes(searchAgent, candidatesByUuid, queries, tagRequirement, maxResultsPerQuery) {
  let notesFound = [];
  for (let i = 0; i < queries.length; i += MAX_PARALLEL_SEARCHES) {
    const batch = queries.slice(i, i + MAX_PARALLEL_SEARCHES);
    const batchResults = await Promise.all(
      batch.map(async (queryCombo) => {
        const query = queryStringFromCombination(queryCombo);
        const results = await searchAgent.app.filterNotes({ query,  tag: tagRequirement?.mustHave || null });
        if (results.length) notesFound = notesFound.concat(results);
        const limited = maxResultsPerQuery ? results.slice(0, maxResultsPerQuery) : results;
        return uniqueUuidNoteCandidatesFromNotes(limited);
      })
    );

    for (const perQueryNotes of batchResults) {
      for (const noteHandle of perQueryNotes) {
        await upsertCandidate(candidatesByUuid, noteHandle, 1);
      }
    }
  }
  const foundNoteNames = notesFound.map(n => n.name);
  const uniqueNotes = foundNoteNames.filter((n, i) => foundNoteNames.indexOf(n) === i);
  console.log(`[filterNotes] Adding (up to ${ maxResultsPerQuery || "however many" } results) from queries`, queries.map(q => q.join(" ")), `found ${ uniqueNotes.length } unique note(s)`, uniqueNotes);
}

// --------------------------------------------------------------------------
// Execute app.searchNotes for each query permutation and increment matchCount
// for candidates returned per permutation.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Candidate accumulator
// @param {Array<Array<string>>} queries - Query permutations to execute
// @param {number|null} maxResultsPerQuery - Optional per-query result cap
async function addMatchesFromSearchNotes(searchAgent, candidatesByUuid, queries, maxResultsPerQuery) {
  let notesFound = [];
  for (let i = 0; i < queries.length; i += MAX_PARALLEL_SEARCHES) {
    const batch = queries.slice(i, i + MAX_PARALLEL_SEARCHES);
    const batchResults = await Promise.all(
      batch.map(async (queryCombo) => {
        const query = queryStringFromCombination(queryCombo);
        let results = await searchAgent.app.searchNotes(query);
        if (!results.length) return [];
        results = await filterNotesWithBody(queryCombo, results);
        const limited = maxResultsPerQuery ? results.slice(0, maxResultsPerQuery) : results;
        if (results.length) notesFound = notesFound.concat(results);
        return uniqueUuidNoteCandidatesFromNotes(limited);
      })
    );

    for (const perQueryNotes of batchResults) {
      for (const noteHandle of perQueryNotes) {
        await upsertCandidate(candidatesByUuid, noteHandle, 1);
      }
    }
  }
  const foundNoteNames = notesFound.map(n => n.name);
  const uniqueNotes = foundNoteNames.filter((n, i) => foundNoteNames.indexOf(n) === i);
  console.log(`[searchNotes] Seeking (up to ${ maxResultsPerQuery || "however many" } results) from queries`, queries.map(q => q.join(" ")), `found ${ uniqueNotes.length } unique note(s)`, uniqueNotes);
}

// --------------------------------------------------------------------------
// Return only resultNotes where we can find all the queryArray terms in either the note title or body
async function filterNotesWithBody(queryArray, resultNotes) {
  const eligibleNotes = await resultNotes.filter(async note => {
    return queryArray.every(async keyword => {
      const pattern = new RegExp(`(?:^|\\b|\\s)${ keyword }`);
      if (pattern.test(note.name, "i")) return true;
      return pattern.test(note.bodyContent);
    });
  });
  console.log(`Enforcing presence of ${ queryArray } keywords yields ${ eligibleNotes.length } eligible notes from ${ resultNotes.length } input notes`);
  return eligibleNotes;
}
