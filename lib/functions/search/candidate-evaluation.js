import { pluralize } from "app-util"
import { MIN_KEEP_RESULT_SCORE } from "constants/search-settings"

// Candidate Evaluation for SearchAgent
// Handles Phases 3-5: deep analysis, scoring/ranking, and sanity checking of candidate notes

const LLM_SCORE_BODY_CONTENT_LENGTH = 3000;
const MIN_ACCEPT_SCORE = 8;

// Ranking weights (used in rankPreliminary heuristic scoring)
const RANK_MATCH_COUNT_CAP = 10;            // Max matchCount value to consider
const RANK_MATCH_COUNT_WEIGHT = 1.5;        // Multiplier for matchCount signal
const RANK_PRIMARY_KEYWORD_WEIGHT = 10;     // Score boost per primary keyword match in title
const RANK_RECENCY_BASE_SCORE = 5;          // Base recency score (decays over time)
const RANK_RECENCY_DECAY_DAYS = 30;         // Days per unit of recency decay
const RANK_SECONDARY_KEYWORD_WEIGHT = 3;    // Score boost per secondary keyword match in title
const RANK_SECONDARY_KEYWORDS_TO_CHECK = 3; // Max secondary keywords to check
const RANK_TAG_BOOST_WEIGHT = 5;            // Multiplier for tag boost value

// --------------------------------------------------------------------------
// Phase 3: Deep analysis of top candidates only
// Performs preliminary ranking to identify top candidates, then fetches detailed metadata
// (images, PDFs, URLs, content) in parallel for the top 8. Filters out candidates that
// fail hard requirements (missing required PDFs, images, exact phrases, or URLs).
//
// @param {SearchAgent} searchAgent - The search agent instance with parallel execution support
// @param {Array<SearchCandidateNote>} candidates - Array of candidate notes from phase 2
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
  const validCandidates = deepAnalysis.filter(note => {
    const { checks } = note;

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
// @param {Array<SearchCandidateNote>} analyzedCandidates - Array of analyzed notes from phase 3 with checks
// @param {UserCriteria} criteria - Search criteria for scoring context
// @param {string} userQuery - Original user query for relevance scoring
// @returns {Promise<Array<SearchCandidateNote>>} Array of ranked notes with scores and reasoning, sorted by score
export async function phase4_scoreAndRank(searchAgent, analyzedCandidates, criteria, userQuery) {
  searchAgent.emitProgress(`Phase 4: Ranking ${ pluralize(analyzedCandidates.length, "result") }...`);

  const now = new Date();
  const scoringPrompt = `
You are scoring note search results. Original query: "${ userQuery }"

Extracted criteria:
${ JSON.stringify(criteria, null, 2) }

Score each candidate note 0-10 on these dimensions:
1. COHERENCE: Does the title & content of this note seem to generally match the user's query?
2. TITLE_RELEVANCE: How well does the note title match the search intent?
3. KEYWORD_DENSITY: How concentrated are the keywords in the content?
4. CRITERIA_MATCH: Does it meet all the hard requirements (PDF/image/URL/exact phrase)?
5. TAG_ALIGNMENT: Does it have relevant or preferred tags?
6. RECENCY: If the user specified recency requirement, does it meet that? If no user-specified requirement, score 10 for recency within a month of today (${ now.toDateString() }), and scale down to 0 for candidates from 12+ months earlier.

Candidates to score:
${ analyzedCandidates.map((candidate, index) => `
${ index }. "${ candidate.name }"
   UUID: ${ candidate.uuid }
   Tags: ${ candidate.tags?.join(", ") || "none" }
   Updated: ${ candidate.updated }
   Checks: ${ JSON.stringify(candidate.checks) }
   Body Content (ending with $END$): ${ candidate.bodyContent.slice(0, LLM_SCORE_BODY_CONTENT_LENGTH) }\n$END$
`).join("\n\n") }

Return ONLY valid JSON array:
[
  {
    "noteIndex": 0,
    "coherence": 7,
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
  console.log("Received scores from LLM:", scores);

  // Ensure scores is an array
  const scoresArray = Array.isArray(scores) ? scores : [scores];

  // Todo: Const-ify the weights influencing results?
  // Todo: Is criteriaMatch composite or binary? Only seems composite if we expect users will say they _prefer_ notes with attachments, but that's not captured in UserCriteria yet so
  const weights = {
    coherence: 0.20,
    criteriaMatch: 0.16,
    keywordDensity: 0.18,
    recency: 0.08,
    tagAlignment: 0.11,
    titleRelevance: 0.22,
  };

  const rankedNotes = scoresArray.map(score => {
    const weightedLlmScore = Object.entries(weights).reduce((sum, [ key, weight ]) => {
      const rawValue = score[key];
      const value = Number((rawValue === undefined || rawValue === null) ? 0 : rawValue);
      return sum + value * weight;
    }, 0);

    const note = analyzedCandidates[score.noteIndex];
    if (note) {
      const matchCountSignal = Math.min(RANK_MATCH_COUNT_CAP, (note.matchCount || 0)) * 0.05;
      const finalScore = weightedLlmScore + matchCountSignal;
      note.finalScore = Math.round(finalScore * 10) / 10; // Round to 1 decimal
      note.scoreBreakdown = score;
      note.reasoning = score.reasoning;
    }
    return note;
  }).filter(n => n);

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
    console.log(`Pruned ${ pruneResult.removedCount } low-quality results (score < ${ MIN_KEEP_RESULT_SCORE } or "poor match"), leaving ${ pruneResult.rankedNotes.length } notes:`, pruneResult.rankedNotes);
  } else {
    console.log(`No results pruned among ${ rankedNotes.length } candidates:`, rankedNotes);
  }
  rankedNotes = pruneResult.rankedNotes;

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
  console.log(`Deep analysis finds note "${ note.name }" needAttachments: ${ needAttachments } == ${ checks.hasPDF }, needImages: ${ needImages } == ${ checks.hasImage }`);

  note.checks = checks;
  return note;
}

// --------------------------------------------------------------------------
// Derive a heuristic-based score of how closely this note seems to match the user's searchParams
function rankPreliminary(noteCandidates, searchParams) {
  const msPerDay = 1000 * 60 * 60 * 24;

  const noteScores = noteCandidates.map(note => {
    let score = 0;

    // Title keyword matches (highest weight)
    const titleLower = (note.name || "").toLowerCase();
    searchParams.primaryKeywords.forEach(kw => {
      if (titleLower.includes(kw.toLowerCase())) {
        score += RANK_PRIMARY_KEYWORD_WEIGHT;
      }
    });

    // Secondary keyword bonus
    searchParams.secondaryKeywords.slice(0, RANK_SECONDARY_KEYWORDS_TO_CHECK).forEach(kw => {
      if (titleLower.includes(kw.toLowerCase())) {
        score += RANK_SECONDARY_KEYWORD_WEIGHT;
      }
    });

    // MatchCount (weak signal): more independent query hits suggests relevance
    score += Math.min(RANK_MATCH_COUNT_CAP, (note.matchCount || 0)) * RANK_MATCH_COUNT_WEIGHT;

    // Tag boost
    score += (note.tagBoost || 1.0) * RANK_TAG_BOOST_WEIGHT;

    // Recency bonus
    if (searchParams.dateFilter) {
      const daysSinceUpdate = (Date.now() - new Date(note.updated)) / msPerDay;
      score += Math.max(0, RANK_RECENCY_BASE_SCORE - daysSinceUpdate / RANK_RECENCY_DECAY_DAYS);
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
