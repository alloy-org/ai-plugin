import { pluralize } from "app-util"
import { MIN_KEEP_RESULT_SCORE } from "constants/search-settings"

// Candidate Evaluation for SearchAgent
// Handles Phases 3-5: deep analysis, scoring/ranking, and sanity checking of candidate notes

const LLM_SCORE_BODY_CONTENT_LENGTH = 3000;
const MIN_ACCEPT_SCORE = 8;

// --------------------------------------------------------------------------
// Phase 3: Deep analysis of top candidates only
// Performs preliminary ranking to identify top candidates, then fetches detailed metadata
// (images, PDFs, URLs, content) in parallel for the top 8. Filters out candidates that
// fail hard requirements (missing required PDFs, images, exact phrases, or URLs).
//
// @param {SearchAgent} searchAgent - The search agent instance with parallel execution support
// @param {Array<NoteHandle>} candidates - Array of candidate notes from phase 2, note handles from searchNotes and filterNotes
// @param {UserCriteria} criteria - Search criteria with boolean requirements to check
// @returns {Promise<Object>} Object with {validCandidates, allAnalyzed} arrays
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
// Uses LLM to score each candidate on title relevance, keyword density, criteria match,
// tag alignment, and recency. Calculates weighted final scores and sorts candidates
// by score in descending order.
//
// @param {SearchAgent} searchAgent - The search agent instance with LLM capabilities
// @param {Array<NoteHandle>} analyzedCandidates - Array of analyzed notes from phase 3 with checks (originating from searchNotes and filterNotes)
// @param {UserCriteria} criteria - Search criteria for scoring context
// @param {string} userQuery - Original user query for relevance scoring
// @returns {Promise<Array<Object>>} Array of ranked notes with scores and reasoning, sorted by score
export async function phase4_scoreAndRank(searchAgent, analyzedCandidates, criteria, userQuery) {
  searchAgent.emitProgress("Phase 4: Ranking results...");

  const now = new Date();
  const scoringPrompt = `
You are scoring note search results. Original query: "${ userQuery }"

Extracted criteria:
${ JSON.stringify(criteria, null, 2) }

Score each candidate note 0-10 on these dimensions:
1. TITLE_RELEVANCE: How well does the note title match the search intent?
2. KEYWORD_DENSITY: How concentrated are the keywords in the content?
3. CRITERIA_MATCH: Does it meet all the hard requirements (PDF/image/URL/exact phrase)?
4. TAG_ALIGNMENT: Does it have relevant or preferred tags?
5. RECENCY: If the user specified recency requirement, does it meet that? If no user-specified requirement, score 10 for recency within a month of today (${ now.toDateString() }), and scale down to 0 for candidates from 12+ months earlier.
6. MATCH_COUNT_SIGNAL: Consider the candidate's MatchCount (how many separate query permutations matched this note across filterNotes/searchNotes). Higher MatchCount is a weak positive signal that the note is relevant, but should not override clear intent mismatch. Score 0-10 where 10 means "highly consistent match across many permutations".

Candidates to score:
${ analyzedCandidates.map((candidate, index) => `
${ index }. "${ candidate.note.name }"
   UUID: ${ candidate.note.uuid }
   MatchCount: ${ candidate.note.matchCount || 0 }
   Tags: ${ candidate.note.tags?.join(", ") || "none" }
   Updated: ${ candidate.note.updated }
   Checks: ${ JSON.stringify(candidate.checks) }
   Body Content (ending with $END$): ${ candidate.content?.slice(0, LLM_SCORE_BODY_CONTENT_LENGTH) }\n$END$
`).join("\n\n") }

Return ONLY valid JSON array:
[
  {
    "noteIndex": 0,
    "titleRelevance": 8,
    "keywordDensity": 7,
    "criteriaMatch": 10,
    "tagAlignment": 6,
    "recency": 5,
    "matchCountSignal": 4,
    "reasoning": "Brief explanation of why this note matches"
  }
]
`;

  const scores = await searchAgent.llm(scoringPrompt, { jsonResponse: true });
  console.log("Received scores from LLM:", scores);

  // Ensure scores is an array
  const scoresArray = Array.isArray(scores) ? scores : [scores];

  // Calculate weighted final scores
  const weights = {
    titleRelevance: 0.28,
    keywordDensity: 0.23,
    criteriaMatch: 0.20,
    tagAlignment: 0.14,
    recency: 0.10,
    matchCountSignal: 0.05
  };

  const rankedNotes = scoresArray.map(score => {
    // Compute weighted score; treat any missing dimensions as 0 to avoid NaN.
    const finalScore = Object.entries(weights).reduce((sum, [ key, weight ]) => {
      const rawValue = score[key];
      const value = Number((rawValue === undefined || rawValue === null) ? 0 : rawValue);
      return sum + value * weight;
    }, 0);

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
// Validates the top search result makes sense for the user's query.
// Auto-accepts excellent matches (≥9.5), performs LLM validation for lower scores,
// and may trigger retry with broader/narrower criteria if confidence is low.
//
// @param {SearchAgent} searchAgent - The search agent instance with LLM and retry capabilities
// @param {Array<NoteHandle>} rankedNotes - Array of ranked note results (originating from searchNotes and filterNotes) from phase 4, sorted by score
// @param {UserCriteria} criteria - The search criteria containing keywords, filters, and requirements
// @param {string} userQuery - The original natural language search query from the user
// @returns {<Object with keys [
//    confidence: {number} Confidence score of the best-matched note (0-10),
//    criteria: {UserCriteria} Used to go searching,
//    found: {boolean} Was a conclusive result found?,
//    message: {string} Message describing search outcome,
//    notes: Array<Object> Ordered list of best-matched notes, with keys:
//      checks {Object} With results of criteria checks (hasPDF, hasImage, hasExactPhrase, hasURL),
//      note {Object} With uuid, name, url, tags, updated
//      rank {number} Rank position among search results (1 = best match)
//      reasoning {string} Explanation of why this note was ranked as it was
//      score {number} Final weighted score (0-10)
//    summaryNote: NoteHandle - Optional summary note created to document the search,
//    suggestions: Array<Object> - Optional array of close matches if no conclusive result found
//  ]>} The final search result with found notes, or triggers a retry
export async function phase5_sanityCheck(searchAgent, rankedNotes, criteria, userQuery) {
  searchAgent.emitProgress(`Phase 5: Verifying ${ pluralize(rankedNotes.length, "result" ) }...`);

  if (rankedNotes.length === 0) {
    return searchAgent.handleNoResults(criteria);
  }

  const pruneResult = rankedNotesAfterRemovingPoorMatches(rankedNotes);
  if (pruneResult.removedCount) {
    console.log(`Pruned ${ pruneResult.removedCount } low-quality results (score < ${ MIN_KEEP_RESULT_SCORE } or "poor match")`);
  }
  rankedNotes = pruneResult.rankedNotes;

  const topResult = rankedNotes[0];

  // Auto-accept if score is very high
  if (topResult.finalScore >= MIN_ACCEPT_SCORE) {
    searchAgent.emitProgress(`Found ${ topResult.finalScore }/10 match, returning result.`);
    return searchAgent.formatResult(true, rankedNotes, criteria.resultCount);
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
    searchAgent.emitProgress(`Search completed with ${ pluralize(criteria.resultCount, "final result") }`);
    return searchAgent.formatResult(true, rankedNotes, criteria.resultCount);
  }

  // Handle retry
  console.log(`Sanity check failed: ${ sanityCheck.concerns }`);
  searchAgent.retryCount++;

  if (sanityCheck.suggestAction === "retry_broader") {
    return searchAgent.retryWithBroaderCriteria(userQuery, criteria);
  }

  // Default: return what we have
  return searchAgent.formatResult(false, rankedNotes, criteria.resultCount);
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

  await Promise.all(fetches);
  console.log(`Deep analysis finds note "${ note.name }" from ${ JSON.stringify(searchParams) } finds needAttachments: ${ checks.hasPDF }, needImages: ${ checks.hasImage }, needContent: ${ content ? "fetched" : "not fetched" }`);

  return { note, content, checks };
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

    // MatchCount (weak signal): more independent query hits suggests relevance
    score += Math.min(10, (note.matchCount || 0)) * 1.5;

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

// --------------------------------------------------------------------------
// Remove obviously poor candidates from the ranked list, but only if there is at least
// one solid candidate remaining after filtering.
//
// A candidate is removed if:
// - finalScore < MIN_KEEP_RESULT_SCORE, OR
// - scoreBreakdown.reasoning contains "poor match" (case-insensitive)
//
// @param {Array<Object>} rankedNotes - Phase 4 ranked notes (sorted best-first)
// @returns {{ rankedNotes: Array<Object>, removedCount: number }} Pruned list and removal count
function rankedNotesAfterRemovingPoorMatches(rankedNotes) {
  const poorMatchRegex = /poor match/i;

  const filteredRankedNotes = rankedNotes.filter(r => {
    const reasoning = (r.scoreBreakdown && r.scoreBreakdown.reasoning) ? r.scoreBreakdown.reasoning : "";
    const hasPoorMatchLanguage = poorMatchRegex.test(reasoning);
    return r.finalScore >= MIN_KEEP_RESULT_SCORE && !hasPoorMatchLanguage;
  });

  if (filteredRankedNotes.length && filteredRankedNotes.length < rankedNotes.length) {
    return { rankedNotes: filteredRankedNotes, removedCount: rankedNotes.length - filteredRankedNotes.length };
  }

  return { rankedNotes, removedCount: 0 };
}
