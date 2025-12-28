import { MAX_DEEP_ANALYZED_NOTES, MAX_SEARCH_CONCURRENCY } from "constants/search-settings"
import { normalizedTagFromTagName, requiredTagsFromTagRequirement } from "functions/search/tag-utils"

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

  // Preliminary ranking to identify top candidates (uses keywordDensityEstimate from phase2)
  const preliminaryRanked = rankPreliminary(candidates);
  const topCandidates = preliminaryRanked.slice(0, MAX_DEEP_ANALYZED_NOTES);

  if (!hasDeepAnalysisCriteria(criteria)) {
    console.log("No exclusionary criteria specified, skipping criteria confirmation phase");
    return { validCandidates: topCandidates, allAnalyzed: topCandidates };
  }

  console.log(`Criteria analyzing top ${ candidates.length } candidates`);

  // Fetch required metadata in parallel (but limit concurrency)
  const criteriaAnalyzedNotes = await searchAgent.parallelLimit(
    topCandidates.map(note => () => analyzeNoteCriteriaMatch(note, searchAgent, criteria)),
    MAX_SEARCH_CONCURRENCY);

  if (criteriaAnalyzedNotes.length !== topCandidates.length) {
    if (searchAgent.plugin.constants.isTestEnvironment) {
      throw new Error("Deep analyzed notes count mismatch in test environment");
    } else {
      console.warn("Warning: Deep analyzed notes count mismatch:", { expected: topCandidates.length, actual: criteriaAnalyzedNotes.length } );
    }
  }

  // Filter out candidates that fail hard requirements
  const validCandidates = criteriaAnalyzedNotes.filter(note => {
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
  return { validCandidates, allAnalyzed: criteriaAnalyzedNotes };
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
// Sort candidates by keywordDensityEstimate (calculated in phase2)
// The keywordDensityEstimate reflects match density normalized by content length.
//
// @param {Array<SearchCandidateNote>} noteCandidates - Candidates with keywordDensityEstimate populated
// @returns {Array<SearchCandidateNote>} Sorted candidates (highest density first)
function rankPreliminary(noteCandidates) {
  return [...noteCandidates].sort((a, b) => {
    const densityDiff = (b.keywordDensityEstimate || 0) - (a.keywordDensityEstimate || 0);
    if (densityDiff !== 0) return densityDiff;
    // Tiebreaker: more recently updated first
    const bUpdated = b.updated ? new Date(b.updated).getTime() : 0;
    const aUpdated = a.updated ? new Date(a.updated).getTime() : 0;
    return bUpdated - aUpdated;
  });
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
