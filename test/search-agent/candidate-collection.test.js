import { ATTEMPT_FIRST_PASS, MAX_CANDIDATES_PER_KEYWORD, MIN_PHASE2_TARGET_CANDIDATES } from "constants/search-settings"
import { phase2_collectCandidates } from "functions/search/phase2-candidate-collection"
import { mockApp, mockNote } from "../test-helpers"

// --------------------------------------------------------------------------
// Helper to generate N mock notes with unique names/uuids
function generateMockNotes(prefix, count, startIndex = 0) {
  return Array.from({ length: count }, (_, i) => {
    const index = startIndex + i;
    return mockNote(
      `${ prefix } note ${ index }`,
      `# ${ prefix }\n\nContent for ${ prefix } note ${ index }.`,
      `${ prefix.toLowerCase().replace(/\s+/g, "-") }-${ String(index).padStart(3, "0") }`
    );
  });
}

// --------------------------------------------------------------------------
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

  // Generate enough notes to exceed MIN_PHASE2_TARGET_CANDIDATES threshold
  const bulkProjectNotes = generateMockNotes("Project", 20, 100);
  const bulkMeetingNotes = generateMockNotes("Meeting", 20, 200);
  const bulkSummaryNotes = generateMockNotes("Summary", 20, 300);
  const bulkAgendaNotes = generateMockNotes("Agenda", 15, 400);
  const bulkActionNotes = generateMockNotes("Action", 15, 500);
  const bulkFollowupNotes = generateMockNotes("Follow-up", 15, 600);

  const allNotes = [
    noteHighMatch,
    notePrimaryA, notePrimaryB, notePrimaryC,
    noteSecondaryA, noteSecondaryB, noteSecondaryC,
    noteExtra1, noteExtra2, noteExtra3, noteExtra4,
    noteShouldNotMatch,
    ...bulkProjectNotes,
    ...bulkMeetingNotes,
    ...bulkSummaryNotes,
    ...bulkAgendaNotes,
    ...bulkActionNotes,
    ...bulkFollowupNotes,
  ];

  const baseCriteria = {
    exactPhrase: null,
    dateFilter: null,
    tagRequirement: { mustHave: null, preferred: null },
  };

  // First pass: each keyword searched individually
  const primaryQueries = ["project", "meeting", "summary"];
  // Secondary keywords also searched individually
  const secondaryQueries = ["agenda", "action", "follow-up"];

  // --------------------------------------------------------------------------
  function mockSearchAgent(app) {
    return { app, emitProgress: () => {}, searchAttempt: ATTEMPT_FIRST_PASS, summaryNoteTag: () => null };
  }

  it("1) only uses primaryKeywords + filterNotes when primary filterNotes yields enough candidates", async () => {
    const app = mockApp(allNotes);
    app.searchNotes.mockImplementation(async () => []);

    // Return enough unique notes from filterNotes to exceed MIN_PHASE2_TARGET_CANDIDATES
    app.filterNotes.mockImplementation(async ({ query }) => {
      if (query === "project") return [noteHighMatch, notePrimaryA, ...bulkProjectNotes];
      if (query === "meeting") return [notePrimaryB, notePrimaryC, ...bulkMeetingNotes];
      if (query === "summary") return [noteExtra3, noteExtra4, ...bulkSummaryNotes];
      return [];
    });

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes).not.toHaveBeenCalled();
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual(primaryQueries);

    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();
    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("2) uses primaryKeywords + secondaryKeywords with filterNotes when primary filterNotes yields too few candidates", async () => {
    const app = mockApp(allNotes);
    app.searchNotes.mockImplementation(async () => []);

    app.filterNotes.mockImplementation(async ({ query }) => {
      // Primary keywords yield only a few uniques -> forces broadening with secondary filterNotes
      if (query === "project") return [noteHighMatch, notePrimaryA];
      if (query === "meeting") return [notePrimaryB];
      if (query === "summary") return [notePrimaryC];

      // Secondary keywords add enough uniques to exceed MIN_PHASE2_TARGET_CANDIDATES -> no searchNotes
      // Need 46+ secondary notes to reach 50 total with 4 primary
      if (query === "agenda") return [...bulkAgendaNotes, noteSecondaryA];
      if (query === "action") return [...bulkActionNotes];
      if (query === "follow-up") return [...bulkFollowupNotes];
      return [];
    });

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes).not.toHaveBeenCalled();
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual([...primaryQueries, ...secondaryQueries]);

    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();
    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("3) uses searchNotes with primaryKeywords when filterNotes yields too few candidates (no secondaryKeywords)", async () => {
    const app = mockApp(allNotes);

    app.filterNotes.mockImplementation(async ({ query }) => {
      if (primaryQueries.includes(query)) return [noteHighMatch];
      return [];
    });

    app.searchNotes.mockImplementation(async (query) => {
      if (query === "project") return [noteHighMatch, notePrimaryA, notePrimaryB, noteExtra1, noteExtra2];
      if (query === "meeting") return [noteHighMatch, notePrimaryC, noteExtra3];
      if (query === "summary") return [noteHighMatch, noteExtra4, noteSecondaryA, noteSecondaryB, noteSecondaryC];
      return [];
    });

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords: [] };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes.mock.calls.map(args => args[0])).toEqual(primaryQueries);
    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();

    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("4) uses searchNotes with secondaryKeywords when filterNotes + primary searchNotes still yield too few candidates", async () => {
    const app = mockApp(allNotes);

    // Keep filterNotes extremely narrow even after secondary -> forces searchNotes.
    app.filterNotes.mockImplementation(async () => [noteHighMatch]);

    app.searchNotes.mockImplementation(async (query) => {
      // Primary searchNotes adds some, but not enough to reach MIN_FILTER_NOTES_RESULTS.
      if (query === "project") return [noteHighMatch, notePrimaryA, notePrimaryB];
      if (query === "meeting") return [noteHighMatch, notePrimaryC];
      if (query === "summary") return [noteHighMatch];

      // Secondary searchNotes is required to reach enough candidates.
      if (query === "agenda") return [noteSecondaryA, noteSecondaryB, noteExtra1];
      if (query === "action") return [noteSecondaryC, noteExtra2, noteExtra3];
      if (query === "follow-up") return [noteExtra4];
      return [];
    });

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes.mock.calls.map(args => args[0])).toEqual([...primaryQueries, ...secondaryQueries]);
    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();

    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("5) uses other keywords to fill MIN_PHASE2_TARGET_CANDIDATES when one keyword hits MAX_CANDIDATES_PER_KEYWORD", async () => {
    const app = mockApp(allNotes);
    app.searchNotes.mockImplementation(async () => []);

    // Generate notes for the keyword that will max out (>= MAX_CANDIDATES_PER_KEYWORD)
    const maxedOutProjectNotes = generateMockNotes("MaxProject", MAX_CANDIDATES_PER_KEYWORD + 10, 700);

    // Generate notes for other keywords to fill the remaining slots
    // Need (MIN_PHASE2_TARGET_CANDIDATES - MAX_CANDIDATES_PER_KEYWORD) = 50 - 30 = 20 more notes
    const remainingNeeded = MIN_PHASE2_TARGET_CANDIDATES - MAX_CANDIDATES_PER_KEYWORD;
    const meetingFillNotes = generateMockNotes("MeetingFill", Math.ceil(remainingNeeded / 2), 800);
    const summaryFillNotes = generateMockNotes("SummaryFill", Math.ceil(remainingNeeded / 2), 900);

    app.filterNotes.mockImplementation(async ({ query }) => {
      // First keyword returns more than MAX_CANDIDATES_PER_KEYWORD -> gets capped
      if (query === "project") return maxedOutProjectNotes;
      // Other primary keywords return notes to fill the gap
      if (query === "meeting") return meetingFillNotes;
      if (query === "summary") return summaryFillNotes;
      return [];
    });

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords: [] };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    // Verify all primary keywords were queried (not just the first one)
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual(primaryQueries);

    // Verify we have candidates from the capped keyword (should be exactly MAX_CANDIDATES_PER_KEYWORD)
    const projectCandidates = candidates.filter(n => n.uuid.startsWith("maxproject-"));
    expect(projectCandidates.length).toBe(MAX_CANDIDATES_PER_KEYWORD);

    // Verify we have candidates from the other keywords that filled the remaining slots
    const meetingCandidates = candidates.filter(n => n.uuid.startsWith("meetingfill-"));
    const summaryCandidates = candidates.filter(n => n.uuid.startsWith("summaryfill-"));
    expect(meetingCandidates.length).toBeGreaterThan(0);
    expect(summaryCandidates.length).toBeGreaterThan(0);

    // Verify total candidates meets or exceeds MIN_PHASE2_TARGET_CANDIDATES
    expect(candidates.length).toBeGreaterThanOrEqual(MIN_PHASE2_TARGET_CANDIDATES);
  });
});
