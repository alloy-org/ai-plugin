// Candidate Evaluation for SearchAgent
// Handles Phases 3-5: deep analysis, scoring/ranking, and sanity checking of candidate notes

// --------------------------------------------------------------------------
// Phase 3: Deep analysis of top candidates only
export async function phase3_deepAnalysis(searchAgent, candidates, criteria) {
  searchAgent.emitProgress("Phase 3: Analyzing top candidates...");

  // Preliminary ranking to identify top candidates
  const preliminaryRanked = rankPreliminary(candidates, criteria);
  const topN = Math.min(8, preliminaryRanked.length);
  const topCandidates = preliminaryRanked.slice(0, topN);

  console.log(`Deep analyzing top ${ topN } of ${ candidates.length } candidates`);

  // Fetch required metadata in parallel (but limit concurrency)
  const deepAnalysis = await searchAgent.parallelLimit(
    topCandidates.map(note => () => analyzeNoteDeep(note, searchAgent, criteria)),
    5 // Max 5 concurrent API calls
  );

  // Filter out candidates that fail hard requirements
  const validCandidates = deepAnalysis.filter(analysis => {
    const { checks } = analysis;

    if (criteria.booleanRequirements.containsPDF && !checks.hasPDF) return false;
    if (criteria.booleanRequirements.containsImage && !checks.hasImage) return false;
    if (criteria.exactPhrase && !checks.hasExactPhrase) return false;
    if (criteria.booleanRequirements.containsURL && !checks.hasURL) return false;

    return true;
  });

  console.log(`${ validCandidates.length } candidates passed criteria checks`);

  searchAgent.emitProgress(`${ validCandidates.length } notes match all criteria`);
  return { validCandidates, allAnalyzed: deepAnalysis };
}

// --------------------------------------------------------------------------
// Phase 4: Score and rank candidates using LLM
export async function phase4_scoreAndRank(searchAgent, analyzedCandidates, criteria, userQuery) {
  searchAgent.emitProgress("Phase 4: Ranking results...");

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

  const scores = await searchAgent.llm(scoringPrompt, { jsonResponse: true });
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
export async function phase5_sanityCheck(searchAgent, rankedNotes, criteria, userQuery) {
  searchAgent.emitProgress("Phase 5: Verifying results...");

  if (rankedNotes.length === 0) {
    return searchAgent.handleNoResults(criteria);
  }

  const topResult = rankedNotes[0];

  // Auto-accept if score is very high
  if (topResult.finalScore >= 9.5) {
    searchAgent.emitProgress("Found excellent match!");
    return searchAgent.formatResult(rankedNotes, criteria.resultCount);
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

  const sanityCheck = await searchAgent.llm(sanityPrompt, { jsonResponse: true });

  if (sanityCheck.confident || searchAgent.retryCount >= searchAgent.maxRetries) {
    searchAgent.emitProgress("Search complete!");
    return searchAgent.formatResult(rankedNotes, criteria.resultCount);
  }

  // Handle retry
  console.log(`Sanity check failed: ${ sanityCheck.concerns }`);
  searchAgent.retryCount++;

  if (sanityCheck.suggestAction === "retry_broader") {
    return searchAgent.retryWithBroaderCriteria(userQuery, criteria);
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
  return searchAgent.formatResult(rankedNotes, criteria.resultCount);
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Deep analyze a single note
async function analyzeNoteDeep(note, searchAgent, searchParams) {
  const checks = {};
  let content = null;

  // Determine what we need to fetch
  const needAttachments = searchParams.booleanRequirements.containsPDF;
  const needImages = searchParams.booleanRequirements.containsImage;
  const needContent = searchParams.exactPhrase || searchParams.booleanRequirements.containsURL;

  // Fetch in parallel
  const fetches = [];

  if (needAttachments) {
    fetches.push(
      searchAgent.app.notes.find(note.uuid).then(n => n.attachments())
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
      searchAgent.app.notes.find(note.uuid).then(n => n.images())
        .then(images => {
          checks.hasImage = images.length > 0;
          checks.imageCount = images.length;
        })
    );
  }

  if (needContent) {
    fetches.push(
      searchAgent.app.notes.find(note.uuid).then(n => n.content())
        .then(noteContent => {
          content = noteContent;

          if (searchParams.exactPhrase) {
            checks.hasExactPhrase = noteContent.includes(searchParams.exactPhrase);
          }

          if (searchParams.criteria.containsURL) {
            checks.hasURL = /https?:\/\/[^\s]+/.test(noteContent);
            // Extract URL count
            const urls = noteContent.match(/https?:\/\/[^\s]+/g);
            checks.urlCount = urls ? urls.length : 0;
          }
        })
    );
  }

  await Promise.all(fetches);
  console.log(`Deep analysis finds note "${ note.name }" from ${ JSON.stringify(searchParams) } finds needAttachments: ${ checks.hasPDF }, needImages: ${ checks.hasImage }, needContent: ${ content ? "fetched" : "not fetched" }`);

  return {
    note,
    content: needContent ? content : null,
    contentPreview: content ? content.substring(0, 500) : null,
    checks
  };
}

// --------------------------------------------------------------------------
// Derive a heuristic-based score of how closely this note seems to match the user's searchParams
function rankPreliminary(noteCandidates, searchParams) {
  const noteScores = noteCandidates.map(note => {
    let score = 0;

    // Title keyword matches (highest weight)
    const titleLower = (note.name || "").toLowerCase();
    searchParams.primaryKeywords.forEach(kw => {
      if (titleLower.includes(kw.toLowerCase())) {
        score += 10;
      }
    });

    // Secondary keyword bonus
    searchParams.secondaryKeywords.slice(0, 3).forEach(kw => {
      if (titleLower.includes(kw.toLowerCase())) {
        score += 3;
      }
    });

    // Tag boost
    score += (note._tagBoost || 1.0) * 5;

    // Recency bonus
    if (searchParams.dateFilter) {
      const daysSinceUpdate = (Date.now() - new Date(note.updated)) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 5 - daysSinceUpdate / 30); // Decays over ~150 days
    }

    return { note, preliminaryScore: score };
  })

  const sortedByScore = noteScores.sort((a, b) => b.preliminaryScore - a.preliminaryScore);
  return sortedByScore.map(item => item.note);
}
