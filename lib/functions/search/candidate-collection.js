// Candidate Collection for SearchAgent
// Handles Phase 2: collecting and filtering candidate notes using different search strategies

// --------------------------------------------------------------------------
// Phase 2: Collect candidate notes using fast API calls
export async function phase2_collectCandidates(searchAgent, criteria) {
  searchAgent.emitProgress("Phase 2: Filtering candidates...");

  const { primaryKeywords, secondaryKeywords, exactPhrase, dateFilter, tagRequirement } = criteria;

  // Step 2.1: Title-based filtering using current search strategy
  const titleCandidates = await searchTitlesByStrategy(searchAgent, primaryKeywords, tagRequirement);

  // Step 2.2: Content search if needed
  let candidates = titleCandidates;

  const needsContentSearch =
    titleCandidates.length < 5 ||
    exactPhrase ||
    criteria.criteria.containsPDF ||
    criteria.criteria.containsImage;

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
async function searchTitlesByStrategy(searchAgent, primaryKeywords, tagRequirement) {
  if (primaryKeywords.length === 0) return [];

  const SearchAgent = (await import("../search-agent")).default;

  if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_FIRST_PASS) {
    // First pass: Search all keywords together
    const titleQuery = primaryKeywords.join(" ");
    const results = await searchAgent.app.filterNotes({
      query: titleQuery,
      tag: tagRequirement.mustHave || undefined
    });
    console.log(`[First Pass] Title search for "${ titleQuery }": ${ results.length } results`);
    return results;

  } else if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_KEYWORD_PAIRS) {
    // Second pass: Search keywords in pairs
    const pairs = [];
    for (let i = 0; i < primaryKeywords.length - 1; i++) {
      pairs.push([ primaryKeywords[i], primaryKeywords[i + 1] ]);
    }
    // Also add first and last as a pair if we have 3+ keywords
    if (primaryKeywords.length >= 3) {
      pairs.push([ primaryKeywords[0], primaryKeywords[primaryKeywords.length - 1] ]);
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

    console.log(`[Keyword Pairs] Searched ${ pairs.length } pairs: ${ uniqueResults.length } unique results`);
    return uniqueResults;

  } else if (searchAgent.searchAttempt === SearchAgent.ATTEMPT_INDIVIDUAL) {
    // Third pass: Search each keyword individually, top 10 for each
    const individualResults = await Promise.all(
      primaryKeywords.map(async keyword => {
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

    console.log(`[Individual Keywords] Searched ${ primaryKeywords.length } keywords: ${ uniqueResults.length } unique results`);
    return uniqueResults;
  }

  return [];
}
