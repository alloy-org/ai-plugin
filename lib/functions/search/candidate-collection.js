// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

// Minimum target number of results before broadening search with secondary keywords
const MIN_TARGET_RESULTS = 10;

// Maximum number of notes to return from any search strategy
const MAX_RESULTS_RETURNED = 30;

// Minimum filterNotes results before falling back to app.searchNotes
const MIN_FILTER_NOTES_RESULTS = 10;

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
    const strategyName = getStrategyName(searchAgent.searchAttempt);
    console.log(`[${ strategyName }] Below minimum target (${ MIN_TARGET_RESULTS }), broadening with secondary keywords`);
    
    const secondaryKeywordsToUse = secondaryKeywords.slice(0, 5);
    const secondaryResults = await executeSearchStrategy(searchAgent, secondaryKeywordsToUse, tagRequirement);
    console.log(`[${ strategyName }] Secondary keyword search: ${ secondaryResults.length } results`);
    
    // Merge without duplicates
    results = mergeCandidates(results, secondaryResults);
    console.log(`[${ strategyName }] Total after merging: ${ results.length } results`);
  }
  
  return results;
}

// --------------------------------------------------------------------------
// Execute the actual search based on the current search strategy.
// Uses different max words per query based on search attempt:
// - First pass: max 3 words (consecutive triplets)
// - Second pass: max 2 words (pairs)
// - Third pass: 1 word (individual keywords, top 10 each)
//
// Falls back to app.searchNotes when filterNotes returns fewer than MIN_FILTER_NOTES_RESULTS.
//
// @param {SearchAgent} searchAgent - The search agent instance with app API access
// @param {Array<string>} keywords - Keywords to search for
// @param {Object} tagRequirement - Tag filtering requirements
// @param {string} [tagRequirement.mustHave] - Tag that must be present
// @returns {Promise<Array<Object>>} Array of note objects (max MAX_RESULTS_RETURNED)
async function executeSearchStrategy(searchAgent, keywords, tagRequirement) {
  if (keywords.length === 0) return [];

  const SearchAgent = (await import("../search-agent")).default;
  const strategyName = getStrategyName(searchAgent.searchAttempt);

  // Determine max words per query based on search attempt
  let maxWordsPerQuery;
  let limitPerQuery = null;

  if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_FIRST_PASS) {
    maxWordsPerQuery = 3;
  } else if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_KEYWORD_PAIRS) {
    maxWordsPerQuery = 2;
  } else if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_INDIVIDUAL) {
    maxWordsPerQuery = 1;
    limitPerQuery = 10; // Top 10 for each individual keyword
  } else {
    return [];
  }

  // Generate query combinations based on max words
  const queries = generateQueryCombinations(keywords, maxWordsPerQuery);

  // Execute all filterNotes queries in parallel
  const queryResults = await Promise.all(
    queries.map(async query => {
      const results = await searchAgent.app.filterNotes({
        query: query.join(" "),
        tag: tagRequirement.mustHave || undefined
      });
      // Apply per-query limit if specified (for individual keyword searches)
      return limitPerQuery ? results.slice(0, limitPerQuery) : results;
    })
  );

  // Check if we need to fall back to app.searchNotes
  const totalFilterResults = queryResults.flat().length;
  if (totalFilterResults < MIN_FILTER_NOTES_RESULTS) {
    console.log(`[${ strategyName }] Filter results (${ totalFilterResults }) below minimum, using app.searchNotes`);
    const fallbackQuery = keywords.join(" ");
    const searchResults = await searchAgent.app.searchNotes(fallbackQuery);
    console.log(`[${ strategyName }] app.searchNotes returned ${ searchResults.length } results`);
    return searchResults.slice(0, MAX_RESULTS_RETURNED);
  }

  // Combine and deduplicate results
  const seen = new Set();
  const uniqueResults = queryResults.flat().filter(note => {
    if (seen.has(note.uuid)) return false;
    seen.add(note.uuid);
    return true;
  });

  console.log(`[${ strategyName }] Searched ${ queries.length } queries: ${ uniqueResults.length } unique results`);
  return uniqueResults.slice(0, MAX_RESULTS_RETURNED);
}

// --------------------------------------------------------------------------
// Generate query combinations based on max words per query.
// - maxWords >= keywords.length: Returns all keywords as single query
// - maxWords = 1: Returns individual keywords
// - maxWords = 2: Returns consecutive pairs (plus first/last pair if 3+ keywords)
// - maxWords = 3: Returns consecutive triplets
//
// @param {Array<string>} keywords - Array of keywords to combine
// @param {number} maxWords - Maximum number of words per query combination
// @returns {Array<Array<string>>} Array of query combinations, each an array of keywords
function generateQueryCombinations(keywords, maxWords) {
  if (maxWords >= keywords.length) {
    // Use all keywords as one query
    return [keywords];
  }

  if (maxWords === 1) {
    // Individual keywords
    return keywords.map(k => [k]);
  }

  if (maxWords === 2) {
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

  if (maxWords === 3) {
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
// Get a human-readable name for the current search strategy
async function getStrategyName(searchAttempt) {
  const SearchAgent = (await import("../search-agent")).default;
  
  if (searchAttempt === SearchAgent.ATTEMPT_FIRST_PASS) return "First Pass";
  if (searchAttempt === SearchAgent.ATTEMPT_KEYWORD_PAIRS) return "Keyword Pairs";
  if (searchAttempt === SearchAgent.ATTEMPT_INDIVIDUAL) return "Individual Keywords";
  return "Unknown";
}
