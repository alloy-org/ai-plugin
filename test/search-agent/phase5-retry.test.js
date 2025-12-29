import { jest } from "@jest/globals"
import SearchAgent from "functions/search-agent"
import UserCriteria from "functions/search/user-criteria"
import { mockApp, mockNote, mockPlugin } from "../test-helpers"

describe("Phase 5 retry", () => {
  it("merges results from both passes and preserves scores", async () => {
    // n1 matches "retirement planning" phrase. n2 matches "investment" word but not "investment planning" phrase.
    const n1 = mockNote("Retirement Planning", "Content", "n1");
    const n2 = mockNote("Investment Strategy", "Content", "n2");
    const app = mockApp([n1, n2]);
    const agent = new SearchAgent(app, mockPlugin());
    let retrying = false;
    const scoredBatches = [];

    agent.llm = jest.fn(async (prompt) => {
      // Phase 4: Score notes (give n1 higher coherence to verify sort order preservation)
      if (prompt.includes("scoring note search results")) {
        // Track which notes are being scored in this batch to verify pass separation
        const batch = [];
        if (prompt.includes(n1.uuid)) batch.push(n1.uuid);
        if (prompt.includes(n2.uuid)) batch.push(n2.uuid);
        scoredBatches.push(batch);

        return [n1, n2].map(n => ({
          uuid: n.uuid, coherence: n.uuid === "n1" ? 10 : 5, reasoning: "Match"
        }));
      }
      // Phase 5: Trigger retry on first call
      if (prompt.includes("genuinely seem")) {
        if (!retrying) { retrying = true; return { confident: false, suggestAction: "retry_broader", concerns: "retry needed" }; }
        return { confident: true, suggestAction: "accept" };
      }
      return "Results";
    });

    const criteria = new UserCriteria({ primaryKeywords: ["retirement planning", "investment planning"], resultCount: 2 });
    const result = await agent.search("q", { criteria });

    // Verify retry occurred
    expect(agent.retryCount).toBeGreaterThan(0);

    // Verify necessity: Pass 1 only found/scored n1. Pass 2 found/scored n2.
    // (n1 is not rescored in pass 2 because it was rated in pass 1)
    expect(scoredBatches).toEqual([["n1"], ["n2"]]);

    // Verify merging: n1 found in pass 1, n2 found in pass 2 (retry)
    expect(result.notes.map(n => n.uuid)).toEqual(["n1", "n2"]);
    // Verify score preservation: n1 (from pass 1) maintained higher score
    expect(result.notes[0].finalScore).toBeGreaterThan(result.notes[1].finalScore);

    // Verify summary contains both
    const summaryNote = app._allNotes.find(n => n.uuid === result.summaryNote.uuid);
    expect(summaryNote.body).toMatch(/Retirement Planning.*Investment Strategy/s);
  });
});
