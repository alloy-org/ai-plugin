import { phase5_sanityCheck } from "functions/search/candidate-evaluation.js"
import { MIN_KEEP_RESULT_SCORE } from "constants/search-settings.js"
import SearchCandidateNote from "functions/search/search-candidate-note.js"

describe("Candidate evaluation (phase5 pruning)", () => {
  const baseCriteria = { resultCount: 10 };

  function stubSearchAgent() {
    return {
      emitProgress: () => {},
      formatResult: (_found, notes) => ({ notes }),
      handleNoResults: () => ({ found: false }),
      llm: async () => ({ confident: true }),
      maxRetries: 0,
      retryCount: 0,
    };
  }

  // --------------------------------------------------------------------------
  // Create a SearchCandidateNote with evaluation results populated
  function createRankedCandidate(uuid, name, finalScore, reasoning) {
    const candidate = new SearchCandidateNote(
      uuid,
      name,
      [],       // tags
      "2024-01-01T00:00:00Z",  // created
      "2024-01-01T00:00:00Z",  // updated
      "",       // bodyContent
      0,        // originalContentLength
      1         // matchCount
    );
    candidate.checks = {};
    candidate.finalScore = finalScore;
    candidate.scoreBreakdown = { reasoning };
    return candidate;
  }

  it("prunes notes with score < MIN_KEEP_RESULT_SCORE or reasoning containing 'poor match' when at least one good note remains", async () => {
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
