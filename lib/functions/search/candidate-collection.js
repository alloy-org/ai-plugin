// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

// Minimum target number of results before broadening search with secondary keywords
const MIN_TARGET_RESULTS = 10;

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
// Execute the actual search based on the current search strategy
async function executeSearchStrategy(searchAgent, keywords, tagRequirement) {
  if (keywords.length === 0) return [];

  const SearchAgent = (await import("../search-agent")).default;
  const strategyName = getStrategyName(searchAgent.searchAttempt);

  if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_FIRST_PASS) {
    // First pass: Search all keywords together
    const titleQuery = keywords.join(" ");
    const results = await searchAgent.app.filterNotes({
      query: titleQuery,
      tag: tagRequirement.mustHave || undefined
    });
    console.log(`[${ strategyName }] Title search for "${ titleQuery }": ${ results.length } results`);
    return results;

  } else if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_KEYWORD_PAIRS) {
    // Second pass: Search keywords in pairs
    const pairs = [];
    for (let i = 0; i < keywords.length - 1; i++) {
      pairs.push([ keywords[i], keywords[i + 1] ]);
    }
    // Also add first and last as a pair if we have 3+ keywords
    if (keywords.length >= 3) {
      pairs.push([ keywords[0], keywords[keywords.length - 1] ]);
    }

    const pairResults = await Promise.all(
      pairs.map(pair =>
        searchAgent.app.filterNotes({
          query: pair.join(" "),
          tag: tagRequirement.mustHave || undefined
        })
      )
    );

    // Combine and deduplicate results
    const seen = new Set();
    const uniqueResults = pairResults.flat().filter(note => {
      if (seen.has(note.uuid)) return false;
      seen.add(note.uuid);
      return true;
    });

    console.log(`[${ strategyName }] Searched ${ pairs.length } pairs: ${ uniqueResults.length } unique results`);
    return uniqueResults;

  } else if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_INDIVIDUAL) {
    // Third pass: Search each keyword individually, top 10 for each
    const individualResults = await Promise.all(
      keywords.map(async keyword => {
        const results = await searchAgent.app.filterNotes({
          query: keyword,
          tag: tagRequirement.mustHave || undefined
        });
        return results.slice(0, 10); // Top 10 for each keyword
      })
    );

    // Combine and deduplicate results
    const seen = new Set();
    const uniqueResults = individualResults.flat().filter(note => {
      if (seen.has(note.uuid)) return false;
      seen.add(note.uuid);
      return true;
    });

    console.log(`[${ strategyName }] Searched ${ keywords.length } keywords: ${ uniqueResults.length } unique results`);
    return uniqueResults;
  }

  return [];
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
