import { jest } from "@jest/globals"
import { phase4_scoreAndRank, phase5_sanityCheck } from "functions/search/candidate-evaluation.js"
import {
  MAX_PHASE4_TIMEOUT_RETRIES,
  MIN_KEEP_RESULT_SCORE,
  PHASE4_TIMEOUT_SECONDS,
} from "constants/search-settings.js"
import SearchCandidateNote from "functions/search/search-candidate-note.js"
import { noteTimestampFromNow } from "../test-helpers.js"

describe("Candidate evaluation (phase5 pruning)", () => {
  const baseCriteria = { resultCount: 10 };

  function stubSearchAgent() {
    return {
      emitProgress: () => {},
      formatResult: (_found, notes) => ({ notes }),
      handleNoResults: () => ({ found: false }),
      llm: async () => ({ confident: true }),
      maxRetries: 0,
      ratedNoteUuids: new Set(),
      recordRatedNoteUuids: function(uuids) {
        for (const uuid of uuids || []) {
          this.ratedNoteUuids.add(uuid);
        }
      },
      retryCount: 0,
    };
  }

  // --------------------------------------------------------------------------
  // Create a SearchCandidateNote with evaluation results populated
  function createRankedCandidate(uuid, name, finalScore, reasoning) {
    const timestamp = noteTimestampFromNow({ daysAgo: 1 });
    const candidate = new SearchCandidateNote(uuid, name, [], timestamp, timestamp, "", 0, 1);
    candidate.checks = {};
    candidate.finalScore = finalScore;
    candidate.scoreBreakdown = { reasoning };
    return candidate;
  }

  it("prunes notes with score < MIN_KEEP_RESULT_SCORE or 'poor match' reasoning when good notes remain", async () => {
    const searchAgent = stubSearchAgent();
    const rankedNotes = [
      createRankedCandidate("good-1", "Good", 7, "Strong match"),
      createRankedCandidate("bad-1", "Bad score", MIN_KEEP_RESULT_SCORE - 0.1, "Decent"),
      createRankedCandidate("bad-2", "Bad wording", 8, "Poor match for the request"),
    ];

    const result = await phase5_sanityCheck(searchAgent, rankedNotes, baseCriteria, "query");
    expect(result.notes.map(n => n.uuid)).toEqual(["good-1"]);
  });

  it("does not prune if it would remove every note", async () => {
    const searchAgent = stubSearchAgent();
    const rankedNotes = [
      createRankedCandidate("only-1", "Only", MIN_KEEP_RESULT_SCORE - 0.2, "Not great"),
      createRankedCandidate("only-2", "Only2", MIN_KEEP_RESULT_SCORE - 0.8, "poor match"),
    ];

    const result = await phase5_sanityCheck(searchAgent, rankedNotes, baseCriteria, "query");
    expect(result.notes.map(n => n.uuid)).toEqual(["only-1", "only-2"]);
  });
});

// --------------------------------------------------------------------------
describe("Phase 4 timeout handling", () => {
  const TEST_TIMEOUT_SECONDS = 11;

  // --------------------------------------------------------------------------
  // Create a SearchCandidateNote for scoring
  function createScoringCandidate(uuid, name) {
    const timestamp = noteTimestampFromNow({ daysAgo: 1 });
    return new SearchCandidateNote(uuid, name, ["test-tag"], timestamp, timestamp, "Sample body content for scoring", 0, 1);
  }

  // --------------------------------------------------------------------------
  // Create a search agent stub with timeout-simulating LLM
  function stubSearchAgentWithTimeoutLlm({ callTracker, progressTracker, timeoutAfterSeconds }) {
    const agent = {
      emitProgress: (message) => {
        if (progressTracker) {
          progressTracker.messages.push(message);
        }
      },
      llm: async (_prompt, options = {}) => {
        const timeoutSeconds = options.timeoutSeconds;
        callTracker.calls.push({ timestamp: Date.now(), timeoutSeconds });

        // Simulate waiting for the timeout duration, then throw timeout error
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(new Error("Timeout"));
          }, timeoutAfterSeconds * 1000);
        });
      },
      ratedNoteUuids: new Set(),
      recordRatedNoteUuids: function(uuids) {
        for (const uuid of uuids || []) {
          this.ratedNoteUuids.add(uuid);
        }
      },
    };
    return agent;
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("confirms default timeout constant is 60 seconds", () => {
    expect(PHASE4_TIMEOUT_SECONDS).toBe(60);
  });

  it("confirms MAX_PHASE4_TIMEOUT_RETRIES allows 3 total attempts", () => {
    expect(MAX_PHASE4_TIMEOUT_RETRIES).toBe(3);
  });

  it("retries twice after timeout and respects timeout duration", async () => {
    const callTracker = { calls: [] };
    const progressTracker = { messages: [] };
    const candidates = [createScoringCandidate("timeout-test-1", "Test Note")];
    const criteria = { resultCount: 10 };

    const searchAgent = stubSearchAgentWithTimeoutLlm({
      callTracker, progressTracker, timeoutAfterSeconds: TEST_TIMEOUT_SECONDS });

    // Start the phase4 scoring (will timeout and retry)
    const resultPromise = phase4_scoreAndRank(searchAgent, candidates, criteria, "test query");

    // Advance time through all timeout attempts
    // First attempt: should not complete before TEST_TIMEOUT_SECONDS
    await jest.advanceTimersByTimeAsync((TEST_TIMEOUT_SECONDS - 1) * 1000);
    expect(callTracker.calls.length).toBe(1);

    // Complete first attempt at TEST_TIMEOUT_SECONDS - triggers retry
    await jest.advanceTimersByTimeAsync(1 * 1000);

    // Allow microtasks to process the rejection and start retry
    await jest.advanceTimersByTimeAsync(100);
    expect(callTracker.calls.length).toBe(2);

    // Process remaining retry attempts
    for (let attempt = 2; attempt < MAX_PHASE4_TIMEOUT_RETRIES; attempt++) {
      await jest.advanceTimersByTimeAsync(TEST_TIMEOUT_SECONDS * 1000);
      await jest.advanceTimersByTimeAsync(100);
      expect(callTracker.calls.length).toBe(attempt + 1);
    }

    // Final attempt timeout (no more retries after this)
    await jest.advanceTimersByTimeAsync(TEST_TIMEOUT_SECONDS * 1000);
    await jest.advanceTimersByTimeAsync(100);

    // Wait for the promise to resolve
    const result = await resultPromise;

    // Verify: MAX_PHASE4_TIMEOUT_RETRIES total calls (initial + retries)
    expect(callTracker.calls.length).toBe(MAX_PHASE4_TIMEOUT_RETRIES);

    // Verify: each call received the timeoutSeconds option from the module constant
    callTracker.calls.forEach(call => {
      expect(call.timeoutSeconds).toBe(PHASE4_TIMEOUT_SECONDS);
    });

    // Verify: after all retries exhausted, returns empty array
    expect(result).toEqual([]);

    // Verify: progress messages include elapsed time for each timeout
    const timeoutMessages = progressTracker.messages.filter(message => message.includes("timed out"));
    expect(timeoutMessages.length).toBe(MAX_PHASE4_TIMEOUT_RETRIES);
    timeoutMessages.forEach(message => {
      expect(message).toMatch(/timed out after \d+(\.\d)?s/);
    });
  }, PHASE4_TIMEOUT_SECONDS * 1000);
});
