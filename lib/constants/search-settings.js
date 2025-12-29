// Search Agent Settings and Constants

// Search attempt strategies
export const ATTEMPT_FIRST_PASS = "first_pass";        // Search all keywords together
export const ATTEMPT_INDIVIDUAL = "individual";        // Search each keyword individually
export const ATTEMPT_STRATEGIES = [ ATTEMPT_FIRST_PASS, ATTEMPT_INDIVIDUAL ];
export const DEFAULT_SEARCH_NOTES_RETURNED = 10;

// Keyword density scoring weights for preliminary ranking
// Higher density = more relevant match, normalized by note length
export const KEYWORD_BODY_PRIMARY_WEIGHT = 1;          // Points per primary keyword match in body
export const KEYWORD_BODY_SECONDARY_WEIGHT = 0.5;      // Points per secondary keyword match in body
export const KEYWORD_DENSITY_DIVISOR = 500;            // Divide total points by (contentLength / this)
export const KEYWORD_TAG_PRIMARY_WEIGHT = 1;           // Points when primary keyword contains tag part
export const KEYWORD_TAG_SECONDARY_WEIGHT = 0.5;       // Points when secondary keyword contains tag part
export const KEYWORD_TITLE_PRIMARY_WEIGHT = 5;         // Points per primary keyword match in title
export const KEYWORD_TITLE_SECONDARY_WEIGHT = 2;       // Points per secondary keyword match in title

export const MAX_CANDIDATES_FOR_DENSITY_CALCULATION = 100;    // Max candidates to fetch body content for
export const MAX_PHASE4_TIMEOUT_RETRIES = 3;                  // Number of retry attempts for phase4 scoring timeouts
export const MAX_CHARACTERS_TO_SEARCH_BODY = 4000;
export const MAX_NOTES_PER_QUERY = 100;                       // Max notes accepted per filterNotes/searchNotes query
export const MAX_CANDIDATES_PER_KEYWORD = 30;
export const MAX_DEEP_ANALYZED_NOTES = 30;
// Maximum number of parallel search operations to run concurrently
export const MAX_SEARCH_CONCURRENCY = 10;
export const MAX_SECONDARY_KEYWORDS_TO_QUERY = 15;

// Minimum filterNotes results before falling back to app.searchNotes
export const MIN_FILTER_NOTES_RESULTS = 10;

// Minimum score threshold for keeping lower-quality results in the final list.
// (Used to prune "poor match" / low scoring candidates when there are better options.)
export const MIN_KEEP_RESULT_SCORE = 5;

// Minimum number of candidates phase2 should aim to return for density calculation
export const MIN_PHASE2_TARGET_CANDIDATES = 50;

// Minimum target number of results before broadening search with secondary keywords
export const MIN_TARGET_RESULTS = 10;

// Phase 4 scoring timeout in seconds (LLM batch scoring operations)
export const PHASE4_TIMEOUT_SECONDS = 60;
export const POLLING_INTERVAL_EMBED_MILLISECONDS = 1500;

// Pre-content match scoring (before fetching body content)
// Score formula for note name matches: matchLength * (0.02 * matchLength + 0.1)
// This yields: 5 chars = 1pt, 10 chars = 3pts, 15 chars = 6pts, 20 chars = 10pts
export const PRE_CONTENT_MAX_SCORE_PER_KEYWORD = 10;          // Maximum score contribution per keyword
export const PRE_CONTENT_MIN_PRIMARY_SCORE = 0.5;             // Minimum score for any primary keyword match
export const PRE_CONTENT_MIN_SECONDARY_SCORE = 0.2;           // Minimum score for any secondary keyword match
export const PRE_CONTENT_SECONDARY_MULTIPLIER = 0.5;          // Secondary keywords score at 50% of primary
export const PRE_CONTENT_TAG_WORD_PRIMARY_SCORE = 0.2;        // Score when 4+ char keyword matches tag word start
export const PRE_CONTENT_TAG_WORD_SECONDARY_SCORE = 0.1;      // Same for secondary keywords

export const RANK_MATCH_COUNT_CAP = 10;            // Max matchCount value to consider
export const RESULT_TAG_DEFAULT = "plugins/ample-ai/search-results"
