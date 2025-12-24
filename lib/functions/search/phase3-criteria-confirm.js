import { MAX_SEARCH_CONCURRENCY, RANK_MATCH_COUNT_CAP } from "constants/search-settings"
import { normalizedTagFromTagName } from "functions/search/tag-normalization"
import { requiredTagsFromTagRequirement } from "functions/search/tag-requirements"

const MAX_DEEP_ANALYZED_NOTES = 30;

// Ranking weights (used in rankPreliminary heuristic scoring)
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
// (images, PDFs, URLs, content) in parallel for the top MAX_DEEP_ANALYZED_NOTES. Filters out candidates that
// fail hard requirements (missing required PDFs, images, exact phrases, or URLs).
//
// @param {SearchAgent} searchAgent - The search agent instance with parallel execution support
// @param {Array<SearchCandidateNote>} candidates - Array of candidate notes from phase 2
// @param {UserCriteria} criteria - Search criteria with boolean requirements to check
// @returns {Promise<Object>} Object with {validCandidates, allAnalyzed} arrays
export async function phase3_criteriaConfirm(searchAgent, candidates, criteria) {
  searchAgent.emitProgress("Phase 3: Analyzing top candidates...");

  // Preliminary ranking to identify top candidates
  const preliminaryRanked = rankPreliminary(candidates, criteria);
  const topCandidates = preliminaryRanked.slice(0, MAX_DEEP_ANALYZED_NOTES);

  if (!hasDeepAnalysisCriteria(criteria)) {
    console.log("No deep analysis criteria specified, skipping criteria confirmation phase");
    return { validCandidates: topCandidates, allAnalyzed: topCandidates };
  }

  console.log(`Deep analyzing top ${ MAX_DEEP_ANALYZED_NOTES } of ${ candidates.length } candidates`);

  // Fetch required metadata in parallel (but limit concurrency)
  const deepAnalyzedNotes = await searchAgent.parallelLimit(
    topCandidates.map(note => () => analyzeNoteCriteriaMatch(note, searchAgent, criteria)),
    MAX_SEARCH_CONCURRENCY
  );

  if (deepAnalyzedNotes.length !== topCandidates.length) {
    if (searchAgent.plugin.constants.isTestEnvironment) {
      throw new Error("Deep analyzed notes count mismatch in test environment");
    } else {
      console.warn("Warning: Deep analyzed notes count mismatch:", { expected: topCandidates.length, actual: deepAnalyzedNotes.length } );
    }
  }

  // Filter out candidates that fail hard requirements
  const validCandidates = deepAnalyzedNotes.filter(note => {
    const { checks } = note;
    const requiredTags = requiredTagsFromTagRequirement(criteria.tagRequirement);

    if (criteria.booleanRequirements.containsPDF && !checks.hasPDF) return false;
    if (criteria.booleanRequirements.containsImage && !checks.hasImage) return false;
    if (criteria.booleanRequirements.containsURL && !checks.hasURL) return false;
    if (criteria.exactPhrase && !checks.hasExactPhrase) return false;
    if (requiredTags.length && !checks.hasRequiredTags) return false;

    return true;
  });

  console.log(`${ validCandidates.length } candidates passed criteria checks among ${ candidates.length } candidates`);

  searchAgent.emitProgress(`${ validCandidates.length } notes match all criteria`);
  return { validCandidates, allAnalyzed: deepAnalyzedNotes };
}

// --------------------------------------------------------------------------
// Local helpers
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Deep analyze a single note
// @param {SearchCandidateNote} noteCandidate - The candidate note to analyze
// @param {SearchAgent} searchAgent - The search agent instance
// @param {UserCriteria} searchParams - The search criteria with boolean requirements
// @returns {Promise<SearchCandidateNote>} The note with populated checks
async function analyzeNoteCriteriaMatch(noteCandidate, searchAgent, searchParams) {
  const checks = {};

  // Determine what we need to fetch
  const needAttachments = searchParams.booleanRequirements.containsPDF;
  const needImages = searchParams.booleanRequirements.containsImage;
  const requiredTags = requiredTagsFromTagRequirement(searchParams.tagRequirement);

  // Fetch in parallel
  const fetches = [];

  if (needAttachments) {
    fetches.push(
      searchAgent.app.notes.find(noteCandidate.uuid).then(n => n.attachments())
        .then(attachments => {
          checks.hasPDF = attachments.some(a => a.type === "application/pdf" || a.name.endsWith(".pdf"));
          checks.attachmentCount = attachments.length;
        })
    );
  }

  if (needImages) {
    fetches.push(
      searchAgent.app.notes.find(noteCandidate.uuid).then(n => n.images())
        .then(images => {
          checks.hasImage = images.length > 0;
          checks.imageCount = images.length;
        })
    );
  }

  if (searchParams.exactPhrase) {
    checks.hasExactPhrase = noteCandidate.bodyContent.includes(searchParams.exactPhrase);
  }

  if (searchParams.criteria.containsURL) {
    checks.hasURL = /https?:\/\/[^\s]+/.test(noteCandidate.bodyContent);
    // Extract URL count
    const urls = noteCandidate.bodyContent.match(/https?:\/\/[^\s]+/g);
    checks.urlCount = urls ? urls.length : 0;
  }

  if (requiredTags.length) {
    const tagCheck = requiredTagCheckFromNoteTags(noteCandidate.tags, requiredTags);
    checks.hasRequiredTags = tagCheck.hasAllRequiredTags;
    checks.missingRequiredTags = tagCheck.missingRequiredTags;
  }

  await Promise.all(fetches);

  noteCandidate.checks = checks;
  return noteCandidate;
}

// --------------------------------------------------------------------------
function hasDeepAnalysisCriteria(criteria) {
  const requiredTags = requiredTagsFromTagRequirement(criteria.tagRequirement);
  return (
    criteria.booleanRequirements.containsPDF ||
    criteria.booleanRequirements.containsImage ||
    criteria.booleanRequirements.containsURL ||
    criteria.exactPhrase ||
    requiredTags.length
  );
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
// Validate that noteTags satisfy all requiredTags (supports hierarchical tags via "/")
// @param {Array<string>} noteTags - Tags present on the note
// @param {Array<string>} requiredTags - Tags required by the query
// @returns {{ hasAllRequiredTags: boolean, missingRequiredTags: Array<string> }} Tag check results
//
// Examples (=> hasAllRequiredTags):
// - requiredTagCheckFromNoteTags(["food", "recipes"], ["food"]) => true
// - requiredTagCheckFromNoteTags(["food/recipes", "travel"], ["food"]) => true
// - requiredTagCheckFromNoteTags(["food/recipes/desserts"], ["food/recipes"]) => true
// - requiredTagCheckFromNoteTags(["food"], ["food/recipes"]) => false
// - requiredTagCheckFromNoteTags(["food"], ["food", "recipes"]) => false
// - requiredTagCheckFromNoteTags([], ["food"]) => false
// - requiredTagCheckFromNoteTags(["finance"], ["Some Tag"]) => false
function requiredTagCheckFromNoteTags(noteTags, requiredTags) {
  // note.tags is already normalized by Amplenote; we only need to normalize user-provided tags
  const normalizedNoteTags = Array.isArray(noteTags) ? noteTags : [];
  const normalizedRequiredTags = (Array.isArray(requiredTags) ? requiredTags : [])
    .map(t => normalizedTagFromTagName(t))
    .filter(Boolean);

  const missingRequiredTags = [];
  for (const requiredTag of normalizedRequiredTags) {
    const hasTag = normalizedNoteTags.some(noteTag => {
      return noteTag === requiredTag || noteTag.startsWith(requiredTag + "/");
    });
    if (!hasTag) missingRequiredTags.push(requiredTag);
  }

  return { hasAllRequiredTags: missingRequiredTags.length === 0, missingRequiredTags };
}
