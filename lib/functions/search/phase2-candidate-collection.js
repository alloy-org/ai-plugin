// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

import { debugData } from "app-util"
import {
  ATTEMPT_INDIVIDUAL,
  MAX_RESULTS_RETURNED,
  MAX_SEARCH_CONCURRENCY,
  MAX_SECONDARY_KEYWORDS_TO_QUERY,
  MIN_FILTER_NOTES_RESULTS,
  MIN_TARGET_RESULTS
} from "constants/search-settings"
import SearchCandidateNote from "functions/search/search-candidate-note"
import { requiredTagsFromTagRequirement } from "functions/search/tag-utils"

// --------------------------------------------------------------------------
// Phase 2: Collect candidate notes using fast API calls
// Searches for notes using title/content searches based on keywords. Uses different search
// strategies (all keywords, pairs, individual) depending on retry attempt. Automatically
// broadens search with secondary keywords if results < MIN_TARGET_RESULTS. Applies date
// filters, tag boosting, and keyword density scoring to candidates.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {UserCriteria} criteria - Search criteria with keywords, filters, and requirements
// @returns {Promise<Array<SearchCandidateNote>>} Array of candidate note objects sorted by keyword density
export async function phase2_collectCandidates(searchAgent, criteria) {
  searchAgent.emitProgress("Phase 2: Filtering candidates...");

  const { dateFilter, primaryKeywords, resultCount, secondaryKeywords, tagRequirement } = criteria;

  // Step 2.1: Title-based filtering using current search strategy
  // Note: Keyword density is calculated inside executeSearchStrategy using full keyword lists
  let candidates = await searchNotesByStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement);

  // Step 2.2: Apply date filter (in memory)
  if (dateFilter) {
    const dateField = dateFilter.type === "created" ? "created" : "updated";
    const afterDate = new Date(dateFilter.after);

    candidates = candidates.filter(note => {
      const noteDate = new Date(note[dateField]);
      return noteDate >= afterDate;
    });

    console.log(`After date filter: ${ candidates.length } candidates`);
  }

  // Step 2.3: Tag analysis and boosting
  if (candidates.length) {
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

  // Note: Candidates are already sorted by keywordDensityEstimate from executeSearchStrategy

  searchAgent.emitProgress(`Found ${ candidates.length } candidate notes`);
  return candidates;
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Execute app.filterNotes for each query permutation and increment matchCount
// for candidates returned per permutation.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Candidate accumulator
// @param {Array<Array<string>>} queries - Query permutations to execute
// @param {Object} tagRequirement - Tag filtering requirements (mustHave)
// @param {number|null} maxResultsPerQuery - Optional per-query result cap
async function addMatchesFromFilterNotes(searchAgent, candidatesByUuid, queries, tagRequirement) {
  let notesFound = [];
  for (let i = 0; i < queries.length; i += MAX_SEARCH_CONCURRENCY) {
    const batch = queries.slice(i, i + MAX_SEARCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (queryCombo) => {
        const query = queryStringFromCombination(queryCombo);
        const requiredTags = requiredTagsFromTagRequirement(tagRequirement);
        const tagFilter = requiredTags.length === 1 ? requiredTags[0] : null;
        const results = await searchAgent.app.filterNotes({ query, tag: tagFilter });
        if (results.length) notesFound = notesFound.concat(results);
        return uniqueUuidNoteCandidatesFromNotes(results);
      })
    );

    for (const perQueryNotes of batchResults) {
      for (const noteHandle of perQueryNotes) {
        upsertCandidate(candidatesByUuid, noteHandle, searchAgent, 1);
      }
    }
  }

  const uniqueNotes = notesFound.filter((n, i) => notesFound.indexOf(n) === i);
  console.log(`[filterNotes] Filtering note titles from`, queries.map(q => q.join(" ")), `found ${ uniqueNotes.length } unique note(s)`, uniqueNotes.map(n => debugData(n)));
}

// --------------------------------------------------------------------------
// Execute app.searchNotes for each query permutation and increment matchCount
// for candidates returned per permutation.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Candidate accumulator
// @param {Array<Array<string>>} queries - Query permutations to execute
async function addMatchesFromSearchNotes(searchAgent, candidatesByUuid, queries) {
  let notesFound = [];
  for (let i = 0; i < queries.length; i += MAX_SEARCH_CONCURRENCY) {
    const batch = queries.slice(i, i + MAX_SEARCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (queryCombo) => {
        const query = queryStringFromCombination(queryCombo);
        let results = await searchAgent.app.searchNotes(query);
        if (!results.length) return [];
        results = await filterNotesWithBody(queryCombo, results);
        if (results.length) notesFound = notesFound.concat(results);
        return uniqueUuidNoteCandidatesFromNotes(results);
      })
    );

    for (const perQueryNotes of batchResults) {
      for (const noteHandle of perQueryNotes) {
        upsertCandidate(candidatesByUuid, noteHandle, searchAgent, 1);
      }
    }
  }
  const uniqueNotes = notesFound.filter((n, i) => notesFound.indexOf(n) === i);
  console.log(`[searchNotes] Searching note bodies with`, queries.map(q => q.join(" ")), `found ${ uniqueNotes.length } unique note(s)`, uniqueNotes.map(n => debugData(n)));
}

// --------------------------------------------------------------------------
// Execute the actual search based on the current search strategy.
// Uses different search approaches based on search attempt:
// - First pass: Search each keyword individually and combine results
// - Second pass (ATTEMPT_INDIVIDUAL): Split multi-word keywords into individual words and search each
//
// Computes `matchCount` for each candidate note based on how many query permutations matched it.
// Only falls back to app.searchNotes if the combined filterNotes candidates are fewer than
// MIN_FILTER_NOTES_RESULTS. When falling back, searchNotes results also increment matchCount.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Array<string>} primaryKeywords - Primary keywords to search for (each keyword may contain multiple words)
// @param {Array<string>} secondaryKeywords - Secondary keywords (full list for density, sliced for querying)
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
  const maxResultsReturned = Math.max(MAX_RESULTS_RETURNED, effectiveResultCount * 2);

  // Generate queries based on search attempt strategy
  let primaryQueries;
  let secondaryQueries;

  // Slice secondary keywords for query execution (full list used later for density calculation)
  const secondaryKeywordsForQuerying = (secondaryKeywords || []).slice(0, MAX_SECONDARY_KEYWORDS_TO_QUERY);

  if (searchAgent.searchAttempt === ATTEMPT_INDIVIDUAL) {
    // Second pass: Split multi-word keywords into individual words and search each word
    const splitPrimaryWords = wordsFromMultiWordKeywords(primaryKeywords);
    primaryQueries = splitPrimaryWords.map(word => [word]);
    const splitSecondaryWords = wordsFromMultiWordKeywords(secondaryKeywordsForQuerying);
    secondaryQueries = splitSecondaryWords.map(word => [word]);
  } else {
    // First pass: Search each keyword individually
    primaryQueries = primaryKeywords.map(keyword => [keyword]);
    secondaryQueries = secondaryKeywordsForQuerying.map(keyword => [keyword]);
  }

  // Accumulate candidates and matchCount across query permutations
  const candidatesByUuid = new Map(); // uuid -> SearchCandidateNote

  // 1) filterNotes primary permutations
  await addMatchesFromFilterNotes(searchAgent, candidatesByUuid, primaryQueries, tagRequirement);

  // 2) filterNotes secondary permutations (only if we need to broaden)
  if (candidatesByUuid.size < minTargetResults && secondaryQueries.length) {
    console.log(`[${ strategyName }] Below minimum target (${ minTargetResults }), broadening filterNotes with secondary keywords`);
    await addMatchesFromFilterNotes(searchAgent, candidatesByUuid, secondaryQueries, tagRequirement);
  }

  // 3/4) searchNotes primary then secondary ONLY if filterNotes produced too few candidates
  if (candidatesByUuid.size < minFilterNotesResults) {
    console.log(`[${ strategyName }] Too few candidates (${ candidatesByUuid.size }) below minimum (${ minFilterNotesResults }), supplementing with app.searchNotes`);
    await addMatchesFromSearchNotes(searchAgent, candidatesByUuid, primaryQueries);

    if (candidatesByUuid.size < minFilterNotesResults && secondaryQueries.length) {
      console.log(`[${ strategyName }] Searching ${ secondaryQueries.length } secondary queries with app.searchNotes since we only located ${ candidatesByUuid.size } candidates so far`);
      await addMatchesFromSearchNotes(searchAgent, candidatesByUuid, secondaryQueries);
    }
  } else {
    console.log(`[${ strategyName }] Searched ${ primaryQueries.length } primary filterNotes queries: ${ candidatesByUuid.size } unique candidates`);
  }

  // Calculate keyword density estimate for each candidate before sorting
  const candidates = Array.from(candidatesByUuid.values());
  for (const candidate of candidates) {
    candidate.calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords);
  }

  const finalResults = candidates
    .sort((a, b) => {
      // Primary sort: higher keyword density estimate first
      const densityDiff = (b.keywordDensityEstimate || 0) - (a.keywordDensityEstimate || 0);
      if (densityDiff !== 0) return densityDiff;
      // Tiebreaker: more recently updated first (if available)
      const bUpdated = b.updated ? new Date(b.updated).getTime() : 0;
      const aUpdated = a.updated ? new Date(a.updated).getTime() : 0;
      return bUpdated - aUpdated;
    });

  return finalResults.slice(0, maxResultsReturned);
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
  if (eligibleNotes.length !== resultNotes.length) {
    console.log(`Enforcing presence of ${ queryArray } keywords yields ${ eligibleNotes.length } eligible notes from ${ resultNotes.length } input notes`);
  }
  return eligibleNotes;
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
// Search note titles using strategy based on current search attempt
async function searchNotesByStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement) {
  if (primaryKeywords.length === 0) return [];

  return await executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement);
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
async function upsertCandidate(candidatesByUuid, noteHandle, searchAgent, increment = 1) {
  const existing = candidatesByUuid.get(noteHandle.uuid);
  if (existing) {
    existing.incrementMatchCount(increment);
    return;
  }
  const startAt = new Date();
  const noteContent = await searchAgent.app.getNoteContent(noteHandle.uuid);
  const candidate = SearchCandidateNote.create(noteHandle, noteContent, increment);
  console.log(`Created searchCandidate with ${ noteContent.length }-length content in ${ new Date() - startAt }ms ending ${ new Date() } from`, debugData(candidate), "and typeof content", typeof noteHandle.content);
  candidatesByUuid.set(noteHandle.uuid, candidate);
}

// --------------------------------------------------------------------------
// Split multi-word keywords into individual words, deduplicating the result.
// Used during ATTEMPT_INDIVIDUAL to broaden the search by splitting phrases like
// "machine learning" into ["machine", "learning"].
//
// @param {Array<string>} keywords - Array of keywords (some may be multi-word)
// @returns {Array<string>} Array of unique individual words from all keywords
function wordsFromMultiWordKeywords(keywords) {
  const allWords = [];
  for (const keyword of keywords) {
    const words = keyword.split(/\s+/).filter(word => word.length > 0);
    for (const word of words) {
      if (!allWords.includes(word)) {
        allWords.push(word);
      }
    }
  }
  return allWords;
}
