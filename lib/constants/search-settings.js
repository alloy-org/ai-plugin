// Search Agent Settings and Constants

// Search attempt strategies
export const ATTEMPT_FIRST_PASS = "first_pass";        // Search all keywords together
export const ATTEMPT_KEYWORD_PAIRS = "keyword_pairs";  // Search keywords in pairs
export const ATTEMPT_INDIVIDUAL = "individual";        // Search each keyword individually

// Maximum number of parallel search operations to run concurrently
export const MAX_PARALLEL_SEARCHES = 10;

// Maximum number of notes to return from any search strategy
export const MAX_RESULTS_RETURNED = 30;

export const MAX_SECONDARY_KEYWORDS_TO_QUERY = 15;

// Minimum filterNotes results before falling back to app.searchNotes
export const MIN_FILTER_NOTES_RESULTS = 10;

// Minimum score threshold for keeping lower-quality results in the final list.
// (Used to prune "poor match" / low scoring candidates when there are better options.)
export const MIN_KEEP_RESULT_SCORE = 5;

// Minimum target number of results before broadening search with secondary keywords
export const MIN_TARGET_RESULTS = 10;
