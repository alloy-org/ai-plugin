import { jest } from "@jest/globals"
import SearchAgent from "functions/search-agent"
import UserCriteria from "functions/search/user-criteria"
import { mockApp, mockNote, mockPlugin, noteTimestampFromNow } from "../test-helpers"

// --------------------------------------------------------------------------
// Tests for phase5 retry behavior - verifies that when phase5 triggers a retry due to
// LLM lack of confidence, the highest scoring results from the first pass are preserved
// and merged into the final summaryNote.
//
// The test uses the natural behavior of ATTEMPT_INDIVIDUAL strategy which splits
// multi-word keywords into individual words on retry. This allows a note to be
// found only during retry without complex mocking.
describe("Phase 5 retry - preserving first pass results", () => {
  // First note: Found on first pass via "retirement planning" keyword (title contains both words)
  const firstPassNote = mockNote(
    "Retirement Planning Guide",
    "Comprehensive guide to retirement planning, including 401k strategies.",
    "first-pass-note-001",
    { tags: ["finance", "retirement"], updated: noteTimestampFromNow({ daysAgo: 5 }) }
  );

  // Second note: Only found on retry when "investment portfolio" is split to ["investment", "portfolio"]
  // Title contains "Investment" but NOT "portfolio", so won't match phrase "investment portfolio"
  const secondPassNote = mockNote(
    "Investment Analysis Report",
    "Analysis of investment performance and market trends for long-term growth.",
    "second-pass-note-002",
    { tags: ["finance", "investments"], updated: noteTimestampFromNow({ daysAgo: 10 }) }
  );

  // --------------------------------------------------------------------------
  // Create criteria with a two-word keyword that gets split on retry.
  // - "retirement planning" matches first note (title has both words)
  // - "investment portfolio" does NOT match second note (title lacks "portfolio")
  // - On retry, "investment portfolio" splits to ["investment", "portfolio"]
  // - "investment" then matches second note's title
  function createTestCriteria() {
    return new UserCriteria({
      primaryKeywords: ["retirement planning", "investment portfolio"],
      secondaryKeywords: [],
      resultCount: 2,
      tagRequirement: { mustHave: null, preferred: "finance" },
    });
  }

  // --------------------------------------------------------------------------
  // Override filterNotes to match whole keyword phrases in note titles.
  // This more closely mimics real Amplenote behavior where filterNotes does
  // substring matching on the query as a whole, not word-by-word.
  function setupPhraseMatchingFilterNotes(app, allNotes) {
    app.filterNotes = jest.fn().mockImplementation(async ({ query }) => {
      if (!query) return [...allNotes];
      const queryLower = query.toLowerCase();
      return allNotes.filter(note => {
        const nameLower = (note.name || "").toLowerCase();
        // Match if the ENTIRE query appears as substring in title
        return nameLower.includes(queryLower);
      });
    });
  }

  // --------------------------------------------------------------------------
  // Create LLM mock that tracks phase5 calls and returns appropriate responses
  // Phase 4 returns LOW scores (below MIN_ACCEPT_SCORE of 8) so phase5 sanity check runs
  function createLlmMock({ firstPhase5NotConfident }) {
    let phase5CallCount = 0;

    return jest.fn().mockImplementation(async (prompt) => {
      // Phase 4: Scoring candidates - return LOW scores so phase5 sanity check runs
      if (prompt.includes("Score each candidate note") || prompt.includes("scoring note search results")) {
        const uuidMatches = prompt.match(/UUID: ([a-z0-9-]+)/gi) || [];
        const uuids = uuidMatches.map(match => match.replace("UUID: ", ""));

        return uuids.map(uuid => {
          // First pass note gets slightly higher score
          const isFirstPassNote = uuid === "first-pass-note-001";
          return {
            uuid,
            coherence: isFirstPassNote ? 5 : 4,
            keywordDensity: isFirstPassNote ? 5 : 4,
            recency: 5,
            tagAlignment: 5,
            titleRelevance: isFirstPassNote ? 5 : 4,
            reasoning: isFirstPassNote
              ? "Decent match - addresses retirement planning"
              : "Moderate match - covers investment topics",
          };
        });
      }

      // Phase 5: Sanity check - first call returns not confident if configured
      if (prompt.includes("Does this genuinely seem like what the user is looking for")) {
        phase5CallCount++;

        if (firstPhase5NotConfident && phase5CallCount === 1) {
          return {
            confident: false,
            concerns: "Top result may not fully match user intent - need more results",
            suggestAction: "retry_broader",
          };
        }

        return {
          confident: true,
          concerns: null,
          suggestAction: "accept",
        };
      }

      // Summary note title generation
      if (prompt.includes("Create a brief, descriptive title")) {
        return "Finance Planning Results";
      }

      // Default response
      return {};
    });
  }

  // --------------------------------------------------------------------------
  it("includes first pass results in summaryNote when phase5 triggers retry due to low confidence", async () => {
    const plugin = mockPlugin();
    const allNotes = [firstPassNote, secondPassNote];
    const app = mockApp(allNotes);
    setupPhraseMatchingFilterNotes(app, allNotes);
    const searchAgent = new SearchAgent(app, plugin);

    // Set up LLM mock with first phase5 returning not confident
    searchAgent.llm = createLlmMock({ firstPhase5NotConfident: true });

    const criteria = createTestCriteria();
    const userQuery = "Find notes about retirement planning and investment strategies";
    const result = await searchAgent.search(userQuery, { criteria });

    // Verify search completed
    expect(result).toBeDefined();
    expect(result.found).toBe(true);

    // Verify summaryNote was created
    expect(result.summaryNote).toBeDefined();
    expect(result.summaryNote.uuid).toBeDefined();

    // Find the created summary note in app._allNotes
    const summaryNote = app._allNotes.find(note => note.uuid === result.summaryNote.uuid);
    expect(summaryNote).toBeDefined();

    // KEY ASSERTION: summaryNote should contain results from BOTH passes
    // First pass note (found before retry)
    expect(summaryNote.body).toContain("first-pass-note-001");
    expect(summaryNote.body).toContain("Retirement Planning Guide");

    // Second pass note (found after retry when "investment portfolio" was split)
    expect(summaryNote.body).toContain("second-pass-note-002");
    expect(summaryNote.body).toContain("Investment Analysis Report");

    // Verify both notes are in the result
    const resultUuids = result.notes.map(note => note.uuid);
    expect(resultUuids).toContain("first-pass-note-001");
    expect(resultUuids).toContain("second-pass-note-002");
  });

  // --------------------------------------------------------------------------
  it("preserves first pass result scores when merging with second pass results", async () => {
    const plugin = mockPlugin();
    const allNotes = [firstPassNote, secondPassNote];
    const app = mockApp(allNotes);
    setupPhraseMatchingFilterNotes(app, allNotes);
    const searchAgent = new SearchAgent(app, plugin);

    // Use LLM mock that gives higher score to first pass note
    searchAgent.llm = createLlmMock({ firstPhase5NotConfident: true });

    const criteria = createTestCriteria();
    const result = await searchAgent.search("Find retirement and investment notes", { criteria });

    expect(result.found).toBe(true);
    expect(result.notes.length).toBeGreaterThanOrEqual(2);

    // First pass note should have higher score and be ranked first
    const firstPassResult = result.notes.find(note => note.uuid === "first-pass-note-001");
    const secondPassResult = result.notes.find(note => note.uuid === "second-pass-note-002");

    expect(firstPassResult).toBeDefined();
    expect(secondPassResult).toBeDefined();
    expect(firstPassResult.finalScore).toBeGreaterThan(secondPassResult.finalScore);

    // Verify ordering - higher scored note comes first
    const firstPassIndex = result.notes.findIndex(note => note.uuid === "first-pass-note-001");
    const secondPassIndex = result.notes.findIndex(note => note.uuid === "second-pass-note-002");
    expect(firstPassIndex).toBeLessThan(secondPassIndex);
  });
});
