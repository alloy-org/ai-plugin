// Search Agent Settings and Constants

// Search attempt strategies
export const ATTEMPT_FIRST_PASS = "first_pass";        // Search all keywords together
export const ATTEMPT_INDIVIDUAL = "individual";        // Search each keyword individually
export const DEFAULT_SEARCH_NOTES_RETURNED = 10;
export const MAX_CHARACTERS_TO_SEARCH_BODY = 4000;
// Maximum number of notes to return from any search strategy
export const MAX_RESULTS_RETURNED = 30;
// Maximum number of parallel search operations to run concurrently
export const MAX_SEARCH_CONCURRENCY = 10;
export const MAX_SECONDARY_KEYWORDS_TO_QUERY = 15;

// Minimum filterNotes results before falling back to app.searchNotes
export const MIN_FILTER_NOTES_RESULTS = 10;

// Minimum score threshold for keeping lower-quality results in the final list.
// (Used to prune "poor match" / low scoring candidates when there are better options.)
export const MIN_KEEP_RESULT_SCORE = 5;

// Minimum target number of results before broadening search with secondary keywords
export const MIN_TARGET_RESULTS = 10;
export const RANK_MATCH_COUNT_CAP = 10;            // Max matchCount value to consider
