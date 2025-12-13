// Query Analysis for SearchAgent
// Handles Phase 1: extracting structured search criteria from natural language queries

// --------------------------------------------------------------------------
// Phase 1: Extract structured search criteria from natural language
export async function phase1_analyzeQuery(searchAgent, userQuery, options) {
  searchAgent.emitProgress("Phase 1: Analyzing query...");

  const analysisPrompt = `
Analyze this note search query and extract structured search criteria.

User Query: "${ userQuery }"

Extract:
1. PRIMARY_KEYWORDS: 3-5 words most likely to appear in the note TITLE
2. SECONDARY_KEYWORDS: 5-10 additional words likely in note content
3. EXACT_PHRASE: If user wants exact text match, extract it (or null)
4. CRITERIA:
   - containsPDF: Does user want notes with PDF attachments?
   - containsImage: Does user want notes with images?
   - containsURL: Does user want notes with web links?
5. DATE_FILTER:
   - type: "created" or "updated" (or null if no date mentioned)
   - after: ISO date string (YYYY-MM-DD) for earliest date
6. TAG_REQUIREMENT:
   - mustHave: Tag that MUST be present (null if none required)
   - preferred: Tag that"s PREFERRED but not required (null if none)
7. RESULT_COUNT: 1 for single best match, or N for top N results

Return ONLY valid JSON:
{
  "primaryKeywords": ["word1", "word2"],
  "secondaryKeywords": ["word3", "word4", "word5"],
  "exactPhrase": null,
  "criteria": {
    "containsPDF": false,
    "containsImage": false,
    "containsURL": false
  },
  "dateFilter": null,
  "tagRequirement": {
    "mustHave": null,
    "preferred": null
  },
  "resultCount": 1
}
`;

  const validateCriteria = (result) => {
    return result?.primaryKeywords && Array.isArray(result.primaryKeywords) && result.primaryKeywords.length > 0;
  };

  const extracted = await searchAgent.llmWithRetry(analysisPrompt, validateCriteria, { jsonResponse: true });
  console.log("Extracted criteria:", extracted);

  // Ensure required fields exist with defaults
  if (!extracted.secondaryKeywords) extracted.secondaryKeywords = [];
  if (!extracted.criteria) extracted.criteria = { containsPDF: false, containsImage: false, containsURL: false };
  if (!extracted.tagRequirement) extracted.tagRequirement = { mustHave: null, preferred: null };

  // Normalize tag requirements
  const normalizeTag = (tag) => {
    if (!tag) return tag;
    return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  };

  const extractedTagReq = {
    mustHave: normalizeTag(extracted.tagRequirement?.mustHave),
    preferred: normalizeTag(extracted.tagRequirement?.preferred)
  };

  const optionsTagReq = {
    mustHave: normalizeTag(options.tagRequirement?.mustHave),
    preferred: normalizeTag(options.tagRequirement?.preferred)
  };

  // Apply any manual overrides from options (but don't override extracted values with undefined)
  const result = { ...extracted };
  if (options.criteria) {
    result.criteria = { ...extracted.criteria, ...options.criteria };
  }
  result.tagRequirement = { ...extractedTagReq, ...optionsTagReq };

  return result;
}
