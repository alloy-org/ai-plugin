import { debugData, pluralize } from "app-util"
import { MIN_KEEP_RESULT_SCORE, RANK_MATCH_COUNT_CAP } from "constants/search-settings"

const LLM_SCORE_BODY_CONTENT_LENGTH = 3000;
const MAX_NOTES_PER_RANKING = 10;
const MAX_TIMEOUT_RETRIES = 3;
const MIN_ACCEPT_SCORE = 8;

// --------------------------------------------------------------------------
// Phase 4: Score and rank candidates using LLM
// Uses LLM to score each candidate on title relevance, keyword density, criteria match,
// tag alignment, and recency. Calculates weighted final scores and sorts candidates
// by score in descending order.
//
// @param {SearchAgent} searchAgent - The search agent instance with LLM capabilities
// @param {Array<SearchCandidateNote>} analyzedCandidates - Array of analyzed notes from phase 3 with checks
// @param {UserCriteria} criteria - Search criteria for scoring context
// @param {string} userQuery - Original user query for relevance scoring
// @returns {Promise<Array<SearchCandidateNote>>} Array of ranked notes with scores and reasoning, sorted by score
export async function phase4_scoreAndRank(searchAgent, analyzedCandidates, criteria, userQuery) {
  searchAgent.emitProgress(`Phase 4: Ranking ${ pluralize(analyzedCandidates.length, "result") }...`);

  // Split candidates into batches of max MAX_NOTES_PER_RANKING to process in parallel
  const batches = [];
  for (let i = 0; i < analyzedCandidates.length; i += MAX_NOTES_PER_RANKING) {
    batches.push(analyzedCandidates.slice(i, i + MAX_NOTES_PER_RANKING));
  }

  console.log(`[Phase 4] ${ analyzedCandidates.length > MAX_NOTES_PER_RANKING ? "Split" : "Taking" } ${ analyzedCandidates.length } candidates in ${ pluralize(batches.length, "batch") } for final scoring`);

  // Process batches in parallel
  const batchResults = await Promise.all(
    batches.map(batch => scoreCandidateBatchWithRetry(searchAgent, batch, criteria, userQuery))
  );

  // Flatten and sort
  const rankedNotes = batchResults.flat();
  const sortedNotes = rankedNotes.sort((a, b) => b.finalScore - a.finalScore);

  console.log(`[Phase 4] Finished with ${ sortedNotes.length } sorted notes, headlined by "${ sortedNotes[0]?.name }"`);
  return sortedNotes;
}

// --------------------------------------------------------------------------
// Phase 5: Sanity check and potential retry
// Validates the top search result makes sense for the user's query.
// Auto-accepts excellent matches (≥9.5), performs LLM validation for lower scores,
// and may trigger retry with broader/narrower criteria if confidence is low.
//
// @param {SearchAgent} searchAgent - The search agent instance with LLM and retry capabilities
// @param {Array<SearchCandidateNote>} rankedNotes - Array of ranked note results from phase 4, sorted by score
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
    rankedNotes = pruneResult.rankedNotes;
    console.log(`Pruned ${ pluralize(pruneResult.removedCount, "low quality result") } (score < ${ MIN_KEEP_RESULT_SCORE } or "poor match"), leaving ${ pruneResult.rankedNotes.length } notes:`, rankedNotes.map(n => debugData(n)));
  } else {
    console.log(`No results pruned among ${ rankedNotes.length } candidates:`, rankedNotes.map(n => debugData(n)));
  }

  const topResult = rankedNotes[0];

  // Auto-accept if score is very high
  if (topResult.finalScore >= MIN_ACCEPT_SCORE) {
    searchAgent.emitProgress(`Found ${ topResult.finalScore }/10 match, returning up to ${ pluralize(criteria.resultCount, "result") } (type ${ typeof criteria.resultCount })`);
    return searchAgent.formatResult(true, rankedNotes, criteria.resultCount);
  }

  // Sanity check for lower scores
  const sanityPrompt = `
Original query: "${ userQuery }"

Top recommended note:
- Title: "${ topResult.name }"
- Score: ${ topResult.finalScore }/10
- Tags: ${ topResult.tags.join(", ") || "none" }
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

  console.log(`Sanity check failed: ${ sanityCheck.concerns }`);
  searchAgent.retryCount++;

  if (sanityCheck.suggestAction === "retry_broader") {
    return searchAgent.nextSearchAttempt(userQuery, criteria);
  }

  // Default: return what we have
  return searchAgent.formatResult(false, rankedNotes, criteria.resultCount);
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Check if an error is a timeout error based on error message patterns from fetch providers.
// @param {Error} error - The error to check
// @returns {boolean} True if the error indicates a timeout
function isTimeoutError(error) {
  if (!error || !error.message) return false;
  const message = error.message.toLowerCase();
  return message.includes("timeout");
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

// --------------------------------------------------------------------------
// Helper: Score a batch of candidates (single attempt)
async function scoreCandidateBatch(searchAgent, candidates, criteria, userQuery) {
  const now = new Date();
  const scoringPrompt = `
You are scoring note search results. Original query: "${ userQuery }"

Extracted criteria:
${ JSON.stringify(criteria, null, 2) }

Score each candidate note 0-10 on these dimensions:
1. COHERENCE: Does the title & content of this note seem to generally match the user's query?
2. TITLE_RELEVANCE: How well does the note title match the search intent?
3. KEYWORD_DENSITY: How concentrated are the keywords in the content?
4. TAG_ALIGNMENT: Does it have relevant or preferred tags?
5. RECENCY: If the user specified recency requirement, does it meet that? If no user-specified requirement, score 10 for recency within a month of today (${ now.toDateString() }), and scale down to 0 for candidates from 12+ months earlier.

Candidates to score:
${ candidates.map(candidate => `
UUID: ${ candidate.uuid }
Title: "${ candidate.name }"
Tags: ${ candidate.tags?.join(", ") || "none" }
Updated: ${ candidate.updated }
Body Content (ending with $END$): ${ candidate.bodyContent.slice(0, LLM_SCORE_BODY_CONTENT_LENGTH) }\n$END$
`).join("\n\n") }

Return ONLY valid JSON array with one entry per candidate, using the UUID to identify each:
[
  {
    "uuid": "the-candidate-uuid",
    "coherence": 7,
    "titleRelevance": 8,
    "keywordDensity": 7,
    "tagAlignment": 6,
    "recency": 5,
    "reasoning": "Brief explanation of why this note matches"
  }
]
`;

  const scores = await searchAgent.llm(scoringPrompt, { jsonResponse: true });
  // Ensure scores is an array
  const scoresArray = Array.isArray(scores) ? scores : [scores];

  // Build UUID lookup map for efficient candidate matching
  const candidatesByUuid = new Map(candidates.map(candidate => [candidate.uuid, candidate]));

  // Todo: Const-ify the weights influencing results?
  const weights = {
    coherence: 0.25,
    keywordDensity: 0.25,
    recency: 0.1,
    tagAlignment: 0.15,
    titleRelevance: 0.25,
  };

  return scoresArray.map(score => {
    const weightedLlmScore = Object.entries(weights).reduce((sum, [ key, weight ]) => {
      const rawValue = score[key];
      const value = Number((rawValue === undefined || rawValue === null) ? 0 : rawValue);
      return sum + value * weight;
    }, 0);

    const note = candidatesByUuid.get(score.uuid);
    if (note) {
      score.keywordDensitySignal = Math.round(Math.min(RANK_MATCH_COUNT_CAP, note.keywordDensityEstimate || 1) * 0.2 * 10) / 10;
      const finalScore = weightedLlmScore + score.keywordDensitySignal;
      note.finalScore = Math.round(finalScore * 10) / 10; // Round to 1 decimal
      note.scoreBreakdown = score;
      note.reasoning = score.reasoning;
    }
    return note;
  }).filter(Boolean);
}

// --------------------------------------------------------------------------
// Helper: Score a batch of candidates with retry logic.
// Timeout errors are retried up to MAX_TIMEOUT_RETRIES times.
// Non-timeout errors are retried once.
//
// @param {SearchAgent} searchAgent - The search agent instance
// @param {Array<SearchCandidateNote>} candidates - Array of candidates to score
// @param {UserCriteria} criteria - Search criteria for scoring context
// @param {string} userQuery - Original user query
// @returns {Promise<Array<SearchCandidateNote>>} Scored candidates or empty array on failure
async function scoreCandidateBatchWithRetry(searchAgent, candidates, criteria, userQuery) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_TIMEOUT_RETRIES; attempt++) {
    try {
      return await scoreCandidateBatch(searchAgent, candidates, criteria, userQuery);
    } catch (error) {
      lastError = error;

      if (isTimeoutError(error)) {
        searchAgent.emitProgress(`Batch scoring timed out (attempt ${ attempt }/${ MAX_TIMEOUT_RETRIES })`);
        if (attempt < MAX_TIMEOUT_RETRIES) {
          continue; // Retry on timeout
        }
      } else {
        // Non-timeout error: retry once then fail
        searchAgent.emitProgress(`Batch scoring failed, retrying once...`);
        try {
          return await scoreCandidateBatch(searchAgent, candidates, criteria, userQuery);
        } catch (retryError) {
          searchAgent.emitProgress(`Batch scoring failed after retry ("${ retryError }")`);
          return [];
        }
      }
    }
  }

  searchAgent.emitProgress(`Batch scoring failed after ${ MAX_TIMEOUT_RETRIES } timeout retries ("${ lastError }")`);
  return []; // Return empty for this batch on failure
}
