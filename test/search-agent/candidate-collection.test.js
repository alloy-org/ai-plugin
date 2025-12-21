import { phase2_collectCandidates } from "functions/search/phase2-candidate-collection"
import { ATTEMPT_KEYWORD_PAIRS } from "constants/search-settings"
import { mockApp, mockNote } from "../test-helpers"

describe("Candidate collection (strategy precedence + matchCount)", () => {
  const primaryKeywords = ["project", "meeting", "summary"];
  const secondaryKeywords = ["agenda", "action", "follow-up"];

  // Shared notes reused across tests (brief, realistic)
  const noteHighMatch = mockNote(
    "Project meeting summary",
    "# Project notes\n\nMeeting summary and next steps.",
    "cc-001"
  );
  const notePrimaryA = mockNote("Project kickoff", "# Work\n\nProject kickoff details.", "cc-002");
  const notePrimaryB = mockNote("Q4 meeting notes", "# Work\n\nMeeting notes for Q4.", "cc-003");
  const notePrimaryC = mockNote("Weekly summary", "# Work\n\nWeekly summary draft.", "cc-004");

  const noteSecondaryA = mockNote("Team agenda", "# Work\n\nAgenda for tomorrow.", "cc-005");
  const noteSecondaryB = mockNote("Action items", "# Work\n\nAction items list.", "cc-006");
  const noteSecondaryC = mockNote("Follow-up plan", "# Work\n\nFollow-up tasks.", "cc-007");

  const noteExtra1 = mockNote("Project timeline", "# Work\n\nProject timeline.", "cc-008");
  const noteExtra2 = mockNote("Meeting prep", "# Work\n\nMeeting prep.", "cc-009");
  const noteExtra3 = mockNote("Summary snippet", "# Work\n\nSummary snippet.", "cc-010");
  const noteExtra4 = mockNote("Decision log", "# Work\n\nDecision log.", "cc-011");

  const noteShouldNotMatch = mockNote("Groceries", "# Personal\n\nGrocery list.", "cc-999");

  const allNotes = [
    noteHighMatch,
    notePrimaryA, notePrimaryB, notePrimaryC,
    noteSecondaryA, noteSecondaryB, noteSecondaryC,
    noteExtra1, noteExtra2, noteExtra3, noteExtra4,
    noteShouldNotMatch,
  ];

  const baseCriteria = {
    exactPhrase: null,
    dateFilter: null,
    tagRequirement: { mustHave: null, preferred: null },
  };

  // keyword_pairs permutations for 3 keywords are:
  // primary: "project meeting", "meeting summary", "project summary"
  const primaryQueries = ["project meeting", "meeting summary", "project summary"];
  // secondary: "agenda action", "action follow-up", "agenda follow-up"
  const secondaryQueries = ["agenda action", "action follow-up", "agenda follow-up"];

  it("1) only uses primaryKeywords + filterNotes when primary filterNotes yields enough candidates", async () => {
    const app = mockApp(allNotes);
    app.searchNotes.mockImplementation(async () => []);

    app.filterNotes.mockImplementation(async ({ query }) => {
      if (query === "project meeting") return [noteHighMatch, notePrimaryA, notePrimaryB, noteExtra1, noteExtra2];
      if (query === "meeting summary") return [noteHighMatch, notePrimaryB, notePrimaryC, noteExtra3];
      if (query === "project summary") return [noteHighMatch, notePrimaryA, notePrimaryC, noteExtra4, noteSecondaryA, noteSecondaryB];
      return [];
    });

    const searchAgent = { app, searchAttempt: ATTEMPT_KEYWORD_PAIRS, emitProgress: () => {} };
    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };

    const candidates = await phase2_collectCandidates(searchAgent, criteria);

    expect(app.searchNotes).not.toHaveBeenCalled();
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual(primaryQueries);

    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();
    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
    expect(high.matchCount).toBeGreaterThan(1);
  });

  it("2) uses primaryKeywords + secondaryKeywords with filterNotes when primary filterNotes yields too few candidates", async () => {
    const app = mockApp(allNotes);
    app.searchNotes.mockImplementation(async () => []);

    app.filterNotes.mockImplementation(async ({ query }) => {
      // Primary permutations yield only 3 uniques total -> forces broadening with secondary filterNotes.
      if (primaryQueries.includes(query)) return [noteHighMatch, notePrimaryA];

      // Secondary permutations add enough uniques to exceed minimums -> no searchNotes.
      // Ensure we reach at least MIN_FILTER_NOTES_RESULTS unique candidates (currently 10).
      if (query === "agenda action") return [noteSecondaryA, noteSecondaryB, noteExtra1, noteExtra2, notePrimaryB, notePrimaryC];
      if (query === "action follow-up") return [noteSecondaryB, noteSecondaryC, noteExtra3, noteExtra4];
      if (query === "agenda follow-up") return [noteSecondaryA, noteSecondaryC];
      return [];
    });

    const searchAgent = { app, searchAttempt: ATTEMPT_KEYWORD_PAIRS, emitProgress: () => {} };
    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };

    const candidates = await phase2_collectCandidates(searchAgent, criteria);

    expect(app.searchNotes).not.toHaveBeenCalled();
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual([...primaryQueries, ...secondaryQueries]);

    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();
    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
    expect(high.matchCount).toBeGreaterThan(1);
  });

  it("3) uses searchNotes with primaryKeywords when filterNotes yields too few candidates (no secondaryKeywords)", async () => {
    const app = mockApp(allNotes);

    app.filterNotes.mockImplementation(async ({ query }) => {
      if (primaryQueries.includes(query)) return [noteHighMatch];
      return [];
    });

    app.searchNotes.mockImplementation(async (query) => {
      if (query === "project meeting") return [noteHighMatch, notePrimaryA, notePrimaryB, noteExtra1, noteExtra2];
      if (query === "meeting summary") return [noteHighMatch, notePrimaryC, noteExtra3];
      if (query === "project summary") return [noteHighMatch, noteExtra4, noteSecondaryA, noteSecondaryB, noteSecondaryC];
      return [];
    });

    const searchAgent = { app, searchAttempt: ATTEMPT_KEYWORD_PAIRS, emitProgress: () => {} };
    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords: [] };

    const candidates = await phase2_collectCandidates(searchAgent, criteria);

    expect(app.searchNotes.mock.calls.map(args => args[0])).toEqual(primaryQueries);
    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();

    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
    expect(high.matchCount).toBeGreaterThan(1);
  });

  it("4) uses searchNotes with secondaryKeywords when filterNotes + primary searchNotes still yield too few candidates", async () => {
    const app = mockApp(allNotes);

    // Keep filterNotes extremely narrow even after secondary -> forces searchNotes.
    app.filterNotes.mockImplementation(async () => [noteHighMatch]);

    app.searchNotes.mockImplementation(async (query) => {
      // Primary searchNotes adds some, but not enough to reach MIN_FILTER_NOTES_RESULTS.
      if (query === "project meeting") return [noteHighMatch, notePrimaryA, notePrimaryB];
      if (query === "meeting summary") return [noteHighMatch, notePrimaryC];
      if (query === "project summary") return [noteHighMatch];

      // Secondary searchNotes is required to reach enough candidates.
      if (query === "agenda action") return [noteSecondaryA, noteSecondaryB, noteExtra1];
      if (query === "action follow-up") return [noteSecondaryC, noteExtra2, noteExtra3];
      if (query === "agenda follow-up") return [noteExtra4];
      return [];
    });

    const searchAgent = { app, searchAttempt: ATTEMPT_KEYWORD_PAIRS, emitProgress: () => {} };
    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };

    const candidates = await phase2_collectCandidates(searchAgent, criteria);

    expect(app.searchNotes.mock.calls.map(args => args[0])).toEqual([...primaryQueries, ...secondaryQueries]);
    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();

    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
    expect(high.matchCount).toBeGreaterThan(1);
  });
});
