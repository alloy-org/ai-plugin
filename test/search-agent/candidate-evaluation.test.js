import { phase5_sanityCheck } from "functions/search/candidate-evaluation.js"
import { MIN_KEEP_RESULT_SCORE } from "constants/search-settings.js"

describe("Candidate evaluation (phase5 pruning)", () => {
  const baseCriteria = { resultCount: 10 };

  function stubSearchAgent() {
    return {
      emitProgress: () => {},
      handleNoResults: () => ({ found: false }),
      formatResult: (_found, notes) => ({ notes }),
      llm: async () => ({ confident: true }),
      retryCount: 0,
      maxRetries: 0,
    };
  }

  it("prunes notes with score < MIN_KEEP_RESULT_SCORE or reasoning containing 'poor match' when at least one good note remains", async () => {
    const searchAgent = stubSearchAgent();
    const rankedNotes = [
      { note: { uuid: "good-1", name: "Good" }, finalScore: 7, scoreBreakdown: { reasoning: "Strong match" }, checks: {} },
      { note: { uuid: "bad-1", name: "Bad score" }, finalScore: MIN_KEEP_RESULT_SCORE - 0.1, scoreBreakdown: { reasoning: "Decent" }, checks: {} },
      { note: { uuid: "bad-2", name: "Bad wording" }, finalScore: 8, scoreBreakdown: { reasoning: "Poor match for the request" }, checks: {} },
    ];

    const result = await phase5_sanityCheck(searchAgent, rankedNotes, baseCriteria, "query");
    expect(result.notes.map(n => n.note.uuid)).toEqual(["good-1"]);
  });

  it("does not prune if it would remove every note", async () => {
    const searchAgent = stubSearchAgent();
    const rankedNotes = [
      { note: { uuid: "only-1", name: "Only" }, finalScore: MIN_KEEP_RESULT_SCORE - 0.2, scoreBreakdown: { reasoning: "Not great" }, checks: {} },
      { note: { uuid: "only-2", name: "Only2" }, finalScore: MIN_KEEP_RESULT_SCORE - 0.8, scoreBreakdown: { reasoning: "poor match" }, checks: {} },
    ];

    const result = await phase5_sanityCheck(searchAgent, rankedNotes, baseCriteria, "query");
    expect(result.notes.map(n => n.note.uuid)).toEqual(["only-1", "only-2"]);
  });
});
