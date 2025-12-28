// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

import { debugData, pluralize } from "app-util"
import {
  ATTEMPT_FIRST_PASS,
  DEFAULT_SEARCH_NOTES_RETURNED,
  MAX_CANDIDATES_FOR_DENSITY_CALCULATION,
  MAX_CANDIDATES_PER_KEYWORD,
  MAX_NOTES_PER_QUERY,
  MAX_SEARCH_CONCURRENCY,
  MAX_SECONDARY_KEYWORDS_TO_QUERY,
  MIN_PHASE2_TARGET_CANDIDATES,
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
  const startAt = new Date();
  const { dateFilter, primaryKeywords, resultCount, secondaryKeywords, tagRequirement } = criteria;

  searchAgent.emitProgress(`Phase 2: Now gathering result candidates from ${ pluralize(primaryKeywords?.length || 0, "primary keyword") } and ${ pluralize(secondaryKeywords.length || 0, "secondary keyword") }...`);

  // Step 2.1: Title-based filtering using current search strategy
  // Note: Keyword density is calculated inside executeSearchStrategy using full keyword lists
  let candidates;
  if (primaryKeywords.length) {
    candidates = await executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement);
  } else { // Todo: We could still retrieve notes by tag/date without keywords
    return [];
  }

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
  searchAgent.emitProgress(`Found ${ candidates.length } candidate notes in ${ Math.round((new Date() - startAt) / 100) / 10 }s`);
  return candidates;
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Execute app.searchNotes for each keyword and increment matchCount
// for candidates returned per keyword.
// Limits results to MAX_NOTES_PER_QUERY per query to prevent overwhelming candidate counts.
//
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Candidate accumulator
// @param {boolean} isPrimary - Whether these are primary keywords (affects scoring weight)
// @param {Array<string>} keywords - Keywords to search for
// @param {SearchAgent} searchAgent - The search agent instance with app API access
async function addMatchesFromSearchNotes(candidatesByUuid, isPrimary, keywords, searchAgent) {
  let notesFound = [];
  for (let i = 0; i < keywords.length; i += MAX_SEARCH_CONCURRENCY) {
    const batch = keywords.slice(i, i + MAX_SEARCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (keyword) => {
        let results = await searchAgent.app.searchNotes(keyword);
        if (!results.length) return { keyword, notes: [] };
        results = await filterNotesWithBody(keyword, results);
        results = eligibleNotesFromResults(results, searchAgent);
        if (results.length) notesFound = notesFound.concat(results);
        return { keyword, notes: uniqueUuidNoteCandidatesFromNotes(results) };
      })
    );

    for (const { keyword, notes: perKeywordNotes } of batchResults) {
      // Cap results per keyword to MAX_CANDIDATES_PER_KEYWORD (consistent with collectCandidatesWithKeywordLimits)
      const cappedNotes = perKeywordNotes.slice(0, MAX_CANDIDATES_PER_KEYWORD);
      if (perKeywordNotes.length > MAX_CANDIDATES_PER_KEYWORD) {
        console.log(`[searchNotes] Query "${ keyword }" returned ${ perKeywordNotes.length } notes, capping to ${ MAX_CANDIDATES_PER_KEYWORD }`);
      }
      for (const noteHandle of cappedNotes) {
        upsertCandidate(candidatesByUuid, isPrimary, noteHandle, keyword);
      }
    }
  }
  const uniqueNotes = notesFound.filter((n, i) => notesFound.indexOf(n) === i);
  console.log(`[searchNotes] Searching note bodies with`, keywords, `found ${ uniqueNotes.length } unique note(s)`, uniqueNotes.map(n => debugData(n)));
}

// --------------------------------------------------------------------------
// Collect candidates from keywords with per-keyword contribution limits.
// Processes keywords one at a time, tracking how many notes each keyword contributes.
// When a keyword returns >= MAX_CANDIDATES_PER_KEYWORD, it is marked as "maxed out".
//
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Candidate accumulator
// @param {boolean} isPrimary - Whether these are primary keywords (affects scoring weight)
// @param {Array<string>} keywords - Keywords to process (caller should pre-filter if needed)
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Object} tagRequirement - Tag filtering requirements
// @returns {Promise<Array<string>>} Keywords that hit the contribution limit
async function collectCandidatesWithKeywordLimits(candidatesByUuid, isPrimary, keywords, searchAgent, tagRequirement) {
  const maxedOutKeywords = [];
  const requiredTags = requiredTagsFromTagRequirement(tagRequirement);
  const tagFilter = requiredTags.length === 1 ? requiredTags[0] : null;
  let notesFound = [];

  for (const keyword of keywords) {
    let keywordNoteMatches;
    if (tagFilter) {
      keywordNoteMatches = await searchAgent.app.filterNotes({ query: keyword, tag: tagFilter });
    } else {
      keywordNoteMatches = await searchAgent.app.filterNotes({ query: keyword });
    }
    keywordNoteMatches = eligibleNotesFromResults(keywordNoteMatches, searchAgent);

    // Cap results if keyword returns too many and mark as maxed out
    if (keywordNoteMatches.length >= MAX_CANDIDATES_PER_KEYWORD) {
      console.log(`Keyword "${ keyword }" returned ${ keywordNoteMatches.length } notes (>= ${ MAX_CANDIDATES_PER_KEYWORD }), capping contribution and marking as maxed out`);
      keywordNoteMatches = keywordNoteMatches.slice(0, MAX_CANDIDATES_PER_KEYWORD);
      maxedOutKeywords.push(keyword);
    }

    notesFound = notesFound.concat(keywordNoteMatches);

    // Add to candidates
    for (const note of uniqueUuidNoteCandidatesFromNotes(keywordNoteMatches)) {
      upsertCandidate(candidatesByUuid, isPrimary, note, keyword);
    }
  }

  const uniqueNotes = notesFound.filter((n, i) => notesFound.indexOf(n) === i);
  console.log(`[filterNotes with limits] Collected ${ pluralize(uniqueNotes.length, "unique note") } from ${ pluralize(keywords.length, "keyword") }, candidatesByUuid size: ${ candidatesByUuid.size }`);

  return maxedOutKeywords;
}

// --------------------------------------------------------------------------
// Filter and limit notes from a query result.
// Excludes notes that have the summary note tag and limits to MAX_NOTES_PER_QUERY.
//
// @param {Array<Object>} notes - Array of notes from app.filterNotes/app.searchNotes
// @param {SearchAgent} searchAgent - The search agent instance (used to get summary note tag)
// @returns {Array<Object>} Filtered and limited notes
function eligibleNotesFromResults(notes, searchAgent) {
  let filtered = notes || [];

  // Exclude notes with the summary note tag (prevents returning previous search results)
  const summaryNoteTagToExclude = searchAgent.summaryNoteTag();
  if (summaryNoteTagToExclude) {
    filtered = filtered.filter(note => {
      if (!note.tags) return true;
      return !note.tags.some(tag =>
        tag === summaryNoteTagToExclude || tag.startsWith(summaryNoteTagToExclude + "/")
      );
    });
  }

  // Limit results per query to MAX_NOTES_PER_QUERY
  if (filtered.length > MAX_NOTES_PER_QUERY) {
    filtered = filtered.slice(0, MAX_NOTES_PER_QUERY);
  }

  return filtered;
}

// --------------------------------------------------------------------------
// Execute the actual search based on the current search strategy.
// Uses different search approaches based on search attempt:
// - First pass: Search each keyword individually and combine results
// - Second pass (ATTEMPT_INDIVIDUAL): Split multi-word keywords into individual words and search each
//
// Only falls back to app.searchNotes if the combined filterNotes candidates are fewer than
// MIN_FILTER_NOTES_RESULTS. When falling back, searchNotes results also increment matchCount.
//
// @param {Array<string>} primaryKeywords - Primary keywords to search for (each keyword may contain multiple words)
// @param {number} resultCount - Number of results requested by user (used to scale thresholds/caps)
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Array<string>} secondaryKeywords - Secondary keywords (full list for density, sliced for querying)
// @param {Object} tagRequirement - Tag filtering requirements
// @param {string} [tagRequirement.mustHave] - Tag that must be present
// @returns {Promise<Array<SearchCandidateNote>>} Array of note objects (max MAX_RESULTS_RETURNED)
async function executeSearchStrategy(primaryKeywords, resultCount, searchAgent, secondaryKeywords, tagRequirement) {
  if (!primaryKeywords?.length) return [];

  const strategyName = searchAgent.searchAttempt;
  const effectiveResultCount = resultCount || DEFAULT_SEARCH_NOTES_RETURNED;
  const minTargetResults = Math.max(MIN_PHASE2_TARGET_CANDIDATES, effectiveResultCount);
  // Determine active keywords based on search attempt strategy
  let activePrimaryKeywords;
  let activeSecondaryKeywords;

  // Slice secondary keywords for query execution (full list used later for density calculation)
  const secondaryKeywordsForQuerying = (secondaryKeywords || []).slice(0, MAX_SECONDARY_KEYWORDS_TO_QUERY);

  if (searchAgent.searchAttempt === ATTEMPT_FIRST_PASS) {
    // First pass: Search each keyword individually
    activePrimaryKeywords = [ ...primaryKeywords ];
    activeSecondaryKeywords = [ ...secondaryKeywordsForQuerying ];
  } else {
    // Second pass: Split multi-word keywords into individual words and search each word
    activePrimaryKeywords = wordsFromMultiWordKeywords(primaryKeywords);
    activeSecondaryKeywords = wordsFromMultiWordKeywords(secondaryKeywordsForQuerying);
  }

  // Accumulate candidates and matchCount across query permutations
  const candidatesByUuid = new Map(); // uuid -> SearchCandidateNote

  // 1) filterNotes primary keywords with per-keyword limits
  const maxedOutPrimaryKeywords = await collectCandidatesWithKeywordLimits(candidatesByUuid, true,
    activePrimaryKeywords, searchAgent, tagRequirement);

  // 2) filterNotes secondary keywords (only if we need to broaden) with per-keyword limits
  // Filter out secondary keywords that contain any maxed-out primary keyword
  activeSecondaryKeywords = filterKeywordsContainingMaxedOut(activeSecondaryKeywords, maxedOutPrimaryKeywords);
  let maxedOutSecondaryKeywords = [];
  if (candidatesByUuid.size < minTargetResults && activeSecondaryKeywords.length) {
    console.log(`[${ strategyName }] Below minimum target (${ minTargetResults }), broadening filterNotes with ${ activeSecondaryKeywords.length } secondary keywords`);
    maxedOutSecondaryKeywords = await collectCandidatesWithKeywordLimits(candidatesByUuid, false,
      activeSecondaryKeywords, searchAgent, tagRequirement);
  }

  // Combine maxed out keywords for filtering remaining queries
  const maxedOutKeywords = [ ...maxedOutPrimaryKeywords, ...maxedOutSecondaryKeywords ];
  if (maxedOutKeywords.length) {
    console.log(`[${ strategyName }] Keywords that hit contribution limit: ${ maxedOutKeywords.join(", ") }`);
  }

  // Build remaining keywords for searchNotes fallback (filter out maxed-out keywords)
  const remainingPrimaryKeywords = filterKeywordsContainingMaxedOut(activePrimaryKeywords, maxedOutKeywords);
  const remainingSecondaryKeywords = filterKeywordsContainingMaxedOut(activeSecondaryKeywords, maxedOutKeywords);

  // 3/4) searchNotes primary then secondary ONLY if filterNotes produced too few candidates
  if (candidatesByUuid.size < minTargetResults) {
    console.log(`[${ strategyName }] Too few candidates (${ candidatesByUuid.size }) below minimum (${ minTargetResults }), supplementing with app.searchNotes`);
    if (remainingPrimaryKeywords.length) {
      await addMatchesFromSearchNotes(candidatesByUuid, true, remainingPrimaryKeywords, searchAgent);
    }

    if (candidatesByUuid.size < minTargetResults && remainingSecondaryKeywords.length) {
      console.log(`[${ strategyName }] Searching ${ remainingSecondaryKeywords.length } secondary keywords with app.searchNotes since we only located ${ candidatesByUuid.size } candidates so far`);
      await addMatchesFromSearchNotes(candidatesByUuid, false, remainingSecondaryKeywords, searchAgent);
    }
  } else {
    console.log(`[${ strategyName }] Searched ${ remainingPrimaryKeywords.length } primary filterNotes queries: ${ candidatesByUuid.size } unique candidates`);
  }

  // Sort candidates by preContentMatchScore and limit to top MAX_CANDIDATES_FOR_DENSITY_CALCULATION
  // before fetching body content (expensive operation)
  const allCandidates = Array.from(candidatesByUuid.values());
  const sortedByPreContentScore = allCandidates
    .sort((a, b) => b.preContentMatchScore - a.preContentMatchScore)
    .slice(0, MAX_CANDIDATES_FOR_DENSITY_CALCULATION);

  if (allCandidates.length > sortedByPreContentScore.length) {
    console.log(`[${ strategyName }] Limiting from ${ allCandidates.length } to ${ sortedByPreContentScore.length } candidates for density calculation (top preContentMatchScore). Cutoff note was`, sortedByPreContentScore[sortedByPreContentScore.length - 1]);
  }

  // Calculate keyword density estimate for top candidates before final sorting
  const densityPromises = sortedByPreContentScore.map(async candidate => {
    try {
      const content = await searchAgent.app.getNoteContent({ uuid: candidate.uuid });
      candidate.setBodyContent(content);
      candidate.calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords);
    } catch (error) {
      candidate.calculateKeywordDensityEstimate(primaryKeywords, secondaryKeywords);
    }
  });
  await Promise.all(densityPromises);

  const finalResults = sortedByPreContentScore
    .sort((a, b) => {
      // Primary sort: higher keyword density estimate first
      const densityDiff = (b.keywordDensityEstimate || 0) - (a.keywordDensityEstimate || 0);
      if (densityDiff !== 0) return densityDiff;
      // Tiebreaker: more recently updated first (if available)
      const bUpdated = b.updated ? new Date(b.updated).getTime() : 0;
      const aUpdated = a.updated ? new Date(a.updated).getTime() : 0;
      return bUpdated - aUpdated;
    });

  console.log(`Calculated keyword density estimates for ${ finalResults.length } candidates`, finalResults.map(n => debugData(n)));
  return finalResults;
}

// --------------------------------------------------------------------------
// Filter out keywords that contain any of the maxed-out keywords as a substring.
// Case-insensitive matching. Used to remove derivative keywords when a base keyword
// has hit the contribution limit.
//
// @param {Array<string>} keywords - Keywords to filter
// @param {Array<string>} maxedOutKeywords - Keywords that have hit the contribution limit
// @returns {Array<string>} Keywords that don't contain any maxed-out keyword
function filterKeywordsContainingMaxedOut(keywords, maxedOutKeywords) {
  if (!maxedOutKeywords || !maxedOutKeywords.length) return keywords;

  return keywords.filter(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    return !maxedOutKeywords.some(maxed => lowerKeyword.includes(maxed.toLowerCase()));
  });
}

// --------------------------------------------------------------------------
// Return only resultNotes where we can find the keyword in either the note title or body
//
// @param {string} keyword - Keyword to search for
// @param {Array<Object>} resultNotes - Notes from app.searchNotes
// @returns {Promise<Array<Object>>} Notes containing the keyword
async function filterNotesWithBody(keyword, resultNotes) {
  const pattern = new RegExp(`(?:^|\\b|\\s)${ keyword }`, "i");
  const eligibleNotes = await resultNotes.filter(async note => {
    if (pattern.test(note.name)) return true;
    return pattern.test(note.bodyContent);
  });
  if (eligibleNotes.length !== resultNotes.length) {
    console.log(`Enforcing presence of "${ keyword }" yields ${ eligibleNotes.length } eligible notes from ${ resultNotes.length } input notes`);
  }
  return eligibleNotes;
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
// Upsert a candidate note into the map, calculating pre-content score for the keyword.
// If the note already exists, ensures keyword score is calculated if not already present.
//
// @param {Map<string, SearchCandidateNote>} candidatesByUuid - Map of uuid -> candidate note
// @param {boolean} isPrimary - Whether this is a primary keyword (affects scoring weight)
// @param {Object} noteHandle - Note handle from Amplenote API (app.filterNotes, app.searchNotes, etc.)
// @param {string} queryKeyword - Keyword from the query that found this note
function upsertCandidate(candidatesByUuid, isPrimary, noteHandle, queryKeyword) {
  let candidate = candidatesByUuid.get(noteHandle.uuid);

  if (!candidate) {
    candidate = SearchCandidateNote.create(noteHandle);
    candidatesByUuid.set(noteHandle.uuid, candidate);
  }

  // Ensure pre-content score exists for this keyword (skips if already scored)
  candidate.ensureKeywordPreContentScore(isPrimary, queryKeyword);
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
