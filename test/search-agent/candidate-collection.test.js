import { ATTEMPT_FIRST_PASS, MAX_CANDIDATES_PER_KEYWORD, MIN_PHASE2_TARGET_CANDIDATES } from "constants/search-settings"
import { phase2_collectCandidates } from "functions/search/phase2-candidate-collection"
import { mockApp, mockNote } from "../test-helpers"

// --------------------------------------------------------------------------
// Helper to generate N mock notes with keyword in TITLE (found by filterNotes AND searchNotes)
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
// Helper to generate N mock notes with keyword in BODY only (found by searchNotes but NOT filterNotes)
function generateBodyOnlyNotes(keyword, count, startIndex = 0) {
  return Array.from({ length: count }, (_, i) => {
    const index = startIndex + i;
    return mockNote(
      `Document ${ index }`,
      `# Notes\n\nThis document discusses ${ keyword } topics and ${ keyword } concepts.`,
      `body-${ keyword.toLowerCase() }-${ String(index).padStart(3, "0") }`
    );
  });
}

// --------------------------------------------------------------------------
describe("Candidate collection (strategy precedence + matchCount)", () => {
  const primaryKeywords = ["project", "meeting", "summary"];
  const secondaryKeywords = ["agenda", "action", "follow-up"];

  // Shared notes reused across tests
  const noteHighMatch = mockNote("Project meeting summary", "# Project notes\n\nMeeting summary and next steps.", "cc-001");
  const notePrimaryA = mockNote("Project kickoff", "# Work\n\nProject kickoff details.", "cc-002");
  const notePrimaryB = mockNote("Q4 meeting notes", "# Work\n\nMeeting notes for Q4.", "cc-003");
  const notePrimaryC = mockNote("Weekly summary", "# Work\n\nWeekly summary draft.", "cc-004");
  const noteShouldNotMatch = mockNote("Groceries", "# Personal\n\nGrocery list.", "cc-999");

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
    return {
      app,
      emitProgress: () => {},
      maxedOutKeywords: new Set(),
      recordMaxedOutKeywords: function(keywords) {
        for (const keyword of keywords || []) {
          this.maxedOutKeywords.add(keyword.toLowerCase());
        }
      },
      searchAttempt: ATTEMPT_FIRST_PASS,
      summaryNoteTag: () => null,
    };
  }

  it("only uses primaryKeywords + filterNotes when primary filterNotes yields enough candidates", async () => {
    // 60+ notes with primary keywords in title → exceeds MIN_PHASE2_TARGET_CANDIDATES
    const manyPrimaryNotes = [
      noteHighMatch, notePrimaryA, notePrimaryB, notePrimaryC,
      ...generateMockNotes("Project", 20, 100),
      ...generateMockNotes("Meeting", 20, 200),
      ...generateMockNotes("Summary", 20, 300),
    ];
    const app = mockApp([...manyPrimaryNotes, noteShouldNotMatch]);

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    // searchNotes not needed when filterNotes yields enough candidates
    expect(app.searchNotes).not.toHaveBeenCalled();
    // Only primary keywords queried (no secondary needed)
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual(primaryQueries);

    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();
    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("uses primaryKeywords + secondaryKeywords with filterNotes when primary filterNotes yields too few candidates", async () => {
    // Only 4 notes with primary keywords in title → too few, forces secondary keyword search
    const fewPrimaryNotes = [noteHighMatch, notePrimaryA, notePrimaryB, notePrimaryC];
    // 50+ notes with secondary keywords in title → enough to reach MIN_PHASE2_TARGET_CANDIDATES
    const manySecondaryNotes = [
      ...generateMockNotes("Agenda", 20, 400),
      ...generateMockNotes("Action", 20, 500),
      ...generateMockNotes("Follow-up", 20, 600),
    ];
    const app = mockApp([...fewPrimaryNotes, ...manySecondaryNotes, noteShouldNotMatch]);

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes).not.toHaveBeenCalled();
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual([...primaryQueries, ...secondaryQueries]);

    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();
    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("uses searchNotes with primaryKeywords when filterNotes yields too few candidates (no secondaryKeywords)", async () => {
    // Only 1 note with primary keyword in title → filterNotes finds too few
    const titleNote = noteHighMatch;
    // 20 notes with keywords in BODY only → searchNotes finds these
    const bodyOnlyProjectNotes = generateBodyOnlyNotes("project", 20, 100);
    const bodyOnlyMeetingNotes = generateBodyOnlyNotes("meeting", 20, 200);
    const bodyOnlySummaryNotes = generateBodyOnlyNotes("summary", 20, 300);
    const app = mockApp([titleNote, ...bodyOnlyProjectNotes, ...bodyOnlyMeetingNotes, ...bodyOnlySummaryNotes, noteShouldNotMatch]);

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords: [] };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes.mock.calls.map(args => args[0])).toEqual(primaryQueries);
    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();

    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("uses searchNotes with secondaryKeywords when filterNotes + primary searchNotes still yield too few candidates", async () => {
    // Only 1 note with any keyword in title → filterNotes finds almost nothing
    const titleNote = noteHighMatch;
    // Few notes with primary keywords in body → not enough even with searchNotes
    const bodyOnlyPrimaryNotes = [
      ...generateBodyOnlyNotes("project", 5, 100),
      ...generateBodyOnlyNotes("meeting", 5, 200),
      ...generateBodyOnlyNotes("summary", 5, 300),
    ];
    // More notes with secondary keywords in body → enough to reach threshold
    const bodyOnlySecondaryNotes = [
      ...generateBodyOnlyNotes("agenda", 15, 400),
      ...generateBodyOnlyNotes("action", 15, 500),
      ...generateBodyOnlyNotes("follow-up", 15, 600),
    ];
    const app = mockApp([titleNote, ...bodyOnlyPrimaryNotes, ...bodyOnlySecondaryNotes, noteShouldNotMatch]);

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    expect(app.searchNotes.mock.calls.map(args => args[0])).toEqual([...primaryQueries, ...secondaryQueries]);
    expect(candidates.find(n => n.uuid === noteShouldNotMatch.uuid)).toBeUndefined();

    const high = candidates.find(n => n.uuid === noteHighMatch.uuid);
    expect(high).toBeDefined();
  });

  it("uses other keywords to fill MIN_PHASE2_TARGET_CANDIDATES when one keyword hits MAX_CANDIDATES_PER_KEYWORD", async () => {
    // High-density notes with multiple keywords in title (should rank at top)
    const highDensityNotes = [
      mockNote("Project meeting overview", "# Overview\n\nThis document covers project and meeting topics.", "high-density-001"),
      mockNote("Meeting summary report", "# Report\n\nThis includes meeting and summary points.", "high-density-002"),
      mockNote("Project summary document", "# Document\n\nComplete project and summary details.", "high-density-003"),
    ];

    // 35 notes for "project" keyword → will max out at 30
    const projectNotes = generateMockNotes("Project", MAX_CANDIDATES_PER_KEYWORD + 5, 700);
    // 15 notes each for "meeting" and "summary" → fill remaining slots
    const meetingNotes = generateMockNotes("Meeting", 15, 800);
    const summaryNotes = generateMockNotes("Summary", 15, 900);

    const allTestNotes = [...highDensityNotes, ...projectNotes, ...meetingNotes, ...summaryNotes];
    const app = mockApp(allTestNotes);

    const criteria = { ...baseCriteria, primaryKeywords, secondaryKeywords: [] };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    // Verify all primary keywords were queried (not just the first one)
    expect(app.filterNotes.mock.calls.map(args => args[0].query)).toEqual(primaryQueries);

    // Verify candidates from capped keyword are limited to MAX_CANDIDATES_PER_KEYWORD
    const projectCandidates = candidates.filter(n => n.uuid.startsWith("project-"));
    expect(projectCandidates.length).toBeLessThanOrEqual(MAX_CANDIDATES_PER_KEYWORD);

    // Verify we have candidates from other keywords that filled the remaining slots
    const meetingCandidates = candidates.filter(n => n.uuid.startsWith("meeting-"));
    const summaryCandidates = candidates.filter(n => n.uuid.startsWith("summary-"));
    expect(meetingCandidates.length).toBeGreaterThan(0);
    expect(summaryCandidates.length).toBeGreaterThan(0);

    // Verify total candidates meets or exceeds MIN_PHASE2_TARGET_CANDIDATES
    expect(candidates.length).toBeGreaterThanOrEqual(MIN_PHASE2_TARGET_CANDIDATES);

    // Verify top 3 candidates each have at least 2 keywords present (due to keywordDensity sorting)
    const top3 = candidates.slice(0, 3);
    for (const candidate of top3) {
      const candidateText = `${ candidate.name } ${ candidate.bodyContent || "" }`.toLowerCase();
      const keywordsPresent = primaryKeywords.filter(keyword => candidateText.includes(keyword.toLowerCase()));
      expect(keywordsPresent.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("prioritizes notes with maxed-out keywords in body even when title only matches a later keyword", async () => {
    // 5 primary keywords: first 2 will max out, 5th keyword appears in special note's title
    const fiveKeywords = ["alpha", "beta", "gamma", "delta", "epsilon"];

    // The key note: title matches only 5th keyword, but body contains 1st and 2nd keywords
    const keyNote = mockNote("Epsilon findings document",
      "# Research\n\nThis document discusses alpha patterns and beta analysis in depth. The alpha and beta concepts are central.",
      "key-note-001");

    // Competing notes: title matches 5th keyword but body has NO mention of alpha/beta
    const competingNotes = [
      mockNote("Epsilon overview", "# Overview\n\nGeneral epsilon concepts and methods.", "compete-001"),
      mockNote("Epsilon summary", "# Summary\n\nBrief epsilon introduction.", "compete-002"),
      mockNote("Epsilon notes", "# Notes\n\nMiscellaneous epsilon observations.", "compete-003"),
    ];

    // Generate enough notes to max out alpha and beta keywords (titles like "Alpha note 100")
    const alphaMaxNotes = generateMockNotes("Alpha", MAX_CANDIDATES_PER_KEYWORD + 5, 100);
    const betaMaxNotes = generateMockNotes("Beta", MAX_CANDIDATES_PER_KEYWORD + 5, 200);

    // Generate notes for remaining keywords to fill candidates
    const gammaNotes = generateMockNotes("Gamma", 10, 300);
    const deltaNotes = generateMockNotes("Delta", 10, 400);

    // Default filterNotes/searchNotes implementations search titles/content automatically
    const allTestNotes = [keyNote, ...competingNotes, ...alphaMaxNotes, ...betaMaxNotes, ...gammaNotes, ...deltaNotes];
    const app = mockApp(allTestNotes);

    const criteria = { ...baseCriteria, primaryKeywords: fiveKeywords, secondaryKeywords: [] };
    const candidates = await phase2_collectCandidates(mockSearchAgent(app), criteria);

    // Find key note and competitors in results
    const keyNoteResult = candidates.find(n => n.uuid === "key-note-001");
    const competitor1 = candidates.find(n => n.uuid === "compete-001");
    const competitor2 = candidates.find(n => n.uuid === "compete-002");

    expect(keyNoteResult).toBeDefined();
    expect(competitor1).toBeDefined();
    expect(competitor2).toBeDefined();

    // Key assertion: keyNote should rank higher than competitors because its body
    // contains alpha and beta (even though those keywords maxed out during collection)
    const keyNoteIndex = candidates.indexOf(keyNoteResult);
    const competitor1Index = candidates.indexOf(competitor1);
    const competitor2Index = candidates.indexOf(competitor2);

    expect(keyNoteIndex).toBeLessThan(competitor1Index);
    expect(keyNoteIndex).toBeLessThan(competitor2Index);

    // Verify keyNote has higher keyword density estimate than competitors
    expect(keyNoteResult.keywordDensityEstimate).toBeGreaterThan(competitor1.keywordDensityEstimate);
    expect(keyNoteResult.keywordDensityEstimate).toBeGreaterThan(competitor2.keywordDensityEstimate);
  });
});
