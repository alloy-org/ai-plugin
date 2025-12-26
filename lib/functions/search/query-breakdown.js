// Query Analysis for SearchAgent
// Handles Phase 1: extracting structured search criteria from natural language queries

import UserCriteria from "functions/search/user-criteria"

// --------------------------------------------------------------------------
// Phase 1: Extract structured search criteria from natural language
// Uses LLM to parse the user's natural language query and extract primary/secondary keywords,
// filters, date ranges, tag requirements, and other search criteria. Merges LLM-extracted
// criteria with any manual overrides provided in options.
//
// @param {SearchAgent} searchAgent - The search agent instance with LLM capabilities
// @param {string} userQuery - The natural language search query from the user (50-5000 words)
// @param {Object} [options={}] - Optional manual overrides for any criteria fields
// @returns {Promise<UserCriteria>} Structured search criteria object with all requirements
export async function phase1_analyzeQuery(searchAgent, userQuery, options) {
  searchAgent.emitProgress("Phase 1: Analyzing query...");

  const analysisPrompt = `
Analyze this note search query and extract structured search criteria.

User Query: "${ userQuery }"

Extract:
1. PRIMARY_KEYWORDS: 3-5 keywords most likely to appear in the note TITLE
   - PREFER two-word pairs when they form a distinct concept (e.g., "credit card", "New York", 
     "machine learning", "blood pressure", "chicken soup")
   - Use single words only when they are uniquely specific on their own (e.g., "cryptocurrency")
   - Return all keywords in singular form (e.g., "recipe" not "recipes")
   - Examples of GOOD primary keywords: ["credit card", "payment", "annual fee"]
   - Examples of BAD primary keywords: ["credit", "card", "payment"] (should be "credit card")

2. SECONDARY_KEYWORDS: 5-10 additional keywords likely in note content
   - Same two-word pair preference applies here
   - Include category terms (e.g., "financial document" for credit card topics)
   - Include synonyms or abbreviations (e.g., "NY" for "New York", "ML" for "machine learning")
   - Include single-word fallbacks from primary keyword phrases to catch partial matches
     (e.g., if "gift ideas" is user query, include "gift" to catch any notes like "2019 gifts")
   - Return all keywords in singular form (e.g., "document" not "documents")
   - Examples: ["interest rate", "billing cycle", "cash back", "reward point"]
   - Example for "gift ideas" query: ["gift", "birthday", "holiday", "christmas", "shopping list", "wishlist", "wish list"]

3. EXACT_PHRASE: If user wants exact text match, extract it (or null)

4. CRITERIA:
   - containsPDF: Did the user request notes with PDF attachments?
   - containsImage: Did user request notes with images?
   - containsURL: Did the user request notes with web links?

5. DATE_FILTER:
   - type: "created" or "updated" (or null if no date mentioned)
   - after: ISO date string (YYYY-MM-DD) for earliest date

6. TAG_REQUIREMENT:
   - mustHave: Tag that MUST be present (null if none required)
   - preferred: Tag that's PREFERRED but not required (null if none)

Return ONLY valid JSON:
{
  "primaryKeywords": ["two word", "keyword pair", "single"],
  "secondaryKeywords": ["related phrase", "synonym pair", "category term"],
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
}
`;

  const validateCriteria = result => {
    return result?.primaryKeywords && Array.isArray(result.primaryKeywords) && result.primaryKeywords.length;
  };

  const extracted = await searchAgent.llmWithRetry(analysisPrompt, validateCriteria, { jsonResponse: true });
  console.log("Extracted criteria:", extracted);

  // Ensure required fields exist with defaults
  if (!extracted.secondaryKeywords) extracted.secondaryKeywords = [];
  if (!extracted.criteria) extracted.criteria = { containsPDF: false, containsImage: false, containsURL: false };
  if (!extracted.tagRequirement) extracted.tagRequirement = { mustHave: null, preferred: null };

  // Create UserCriteria instance from extracted data and options
  return UserCriteria.fromExtracted(extracted, options);
}
