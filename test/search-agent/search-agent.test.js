import { AI_MODEL_LABEL } from "constants/settings.js"
import SearchAgent from "functions/search-agent.js"
import {
  defaultTestModel,
  mockAlertAccept,
  mockApp,
  mockNote,
  mockPlugin,
  noteTimestampFromNow,
} from "../test-helpers.js"

const AWAIT_TIME = 60000;
const DEBUG_MULTIPLIER = 5; // When debugging tests, this will increase timeouts

// --------------------------------------------------------------------------------------
describe("Search Agent", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;

  // --------------------------------------------------------------------------------------
  it("should find note with image and sandwich text", async () => {
    // Create 10 notes with varying content
    const notes = [
      mockNote("Beach Trip 2024", "# My Vacation\n\nBeach trip. Amazing sunset!", "note-001", {
        images: [{url: "https://example.com/beach.jpg"}],
        tags: ["vacation", "photos"], updated: noteTimestampFromNow({daysAgo: 7})
      }),
      mockNote("NYC Deli", "# Restaurant Review\n\nTried a new deli. Pastrami was great!", "note-002",
        {tags: ["food", "nyc"], updated: noteTimestampFromNow({monthsAgo: 1})}
      ),

      // Note 2: THE MATCH - Has both image and sandwich with mystery meat in New York, though it's
      // the least recent of notes, to make the challenge sporting
      mockNote("Street Food Discovery", "# Food Adventures in NYC\n\nFound an amazing street vendor in Manhattan. Had the most delicious sandwich with bologna that I couldn't identify, but it was incredible! Secret family recipe from New York. Need to find this cart again!\n\nSpicy tangy sauce.",
        "note-003", {
          images: [{url: "https://example.com/sandwich.jpg"}, {url: "https://example.com/vendor.jpg"}],
          tags: ["food", "nyc", "street-food"], updated: noteTimestampFromNow({monthsAgo: 11})
        }
      ),
      mockNote("Pizza Success", "# Pizza Night\n\nMade pizza from scratch. Perfect dough!", "note-004",
        {
          images: [{url: "https://example.com/pizza.jpg"}],
          tags: ["food", "cooking"], updated: noteTimestampFromNow({monthsAgo: 2})
        }
      ),
      mockNote("NY Food Guide", "# NY Restaurants\n\nBest places:\n- Joe's Pizza\n- Katz's Deli\n- Shake Shack",
        "note-005",
        {tags: ["food", "guide", "nyc"], updated: noteTimestampFromNow({monthsAgo: 3})}
      ),
      mockNote("Europe 2024", "# European Trip\n\nParis and Rome. Stunning architecture!", "note-006",
        {
          images: [{url: "https://example.com/eiffel.jpg"}, {url: "https://example.com/colosseum.jpg"}],
          tags: ["travel", "europe"], updated: noteTimestampFromNow({monthsAgo: 4})
        }
      ),
      mockNote("Sandwich Wishlist", "# Ideas\n\nTry:\n- BLT\n- Club\n- Reuben", "note-007",
        {tags: ["food", "todo"], updated: noteTimestampFromNow({monthsAgo: 5})}
      ),
      mockNote("Weekend BBQ", "# BBQ Party\n\nGrilled steaks and ribs. Great BBQ sauce!", "note-008",
        {
          images: [{url: "https://example.com/bbq.jpg"}],
          tags: ["food", "bbq", "party"], updated: noteTimestampFromNow({monthsAgo: 6})
        }
      ),
      mockNote("Q4 Planning", "# Meeting Notes\n\nQ4 goals and timeline. Follow up on budget.",
        "note-009", {tags: ["work", "meetings"], updated: noteTimestampFromNow({monthsAgo: 7})}
      ),
      mockNote("Architecture Notes", "# NYC Architecture\n\nIncredible buildings. Love Art Deco!",
        "note-010", {
          images: [{url: "https://example.com/building.jpg"}],
          tags: ["architecture", "nyc"], updated: noteTimestampFromNow({monthsAgo: 10})
        }
      )
    ];

    const app = mockApp(notes);
    mockAlertAccept(app);
    // Choose model name randomly between "anthropic", "openai" and "gemini":
    const availableModels = ["anthropic", "openai", "gemini"];
    const modelName = availableModels[Math.floor(Math.random() * availableModels.length)];
    const testModel = defaultTestModel(modelName);
    app.settings[AI_MODEL_LABEL] = testModel;

    // Create search agent
    const searchAgent = new SearchAgent(app, plugin);

    // Test query: find note with image and sandwich with mystery meat in New York
    const userQuery = "Find the note with an image that mentions a sandwich with mystery meat in New York";

    const result = await searchAgent.search(userQuery);

    // Verify summary note was created
    expect(result.summaryNote).toBeDefined();
    expect(result.summaryNote.uuid).toBeDefined();

    // Verify the summary note title includes the AI model name
    expect(result.summaryNote.name).toContain(testModel);

    // Verify the summary note content includes the expected result note
    const summaryNote = app._allNotes.find(n => n.uuid === result.summaryNote.uuid);
    expect(summaryNote).toBeDefined();
    expect(summaryNote.body).toContain("Street Food Discovery");
    expect(summaryNote.body).toContain("note-003");

    // Verify we found the correct note
    expect(result.found).toBe(true);
    expect(result.notes).toBeDefined();
    expect(result.notes[0].note.uuid).toBe("note-003");
    expect(result.notes[0].note.name).toBe("Street Food Discovery");
    expect(result.confidence).toBeGreaterThan(6); // Should have high confidence

  }, AWAIT_TIME * DEBUG_MULTIPLIER);

  // --------------------------------------------------------------------------------------
  it("should filter candidates by tag requirement", async () => {
    const notes = [
      mockNote("Recipes from Mother", "# Food Recipes\n\nMy collection of cooking recipes and meal ideas.",
        "note-tag-001", {tags: ["food", "recipes"]}
      ),
      mockNote("Plain Jane the main dame", "# Plain Note\n\nTalks about food and cooking but has no tags.",
        "note-tag-002", {tags: []}
      )
    ];

    const app = mockApp(notes);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = defaultTestModel("anthropic");

    const searchAgent = new SearchAgent(app, plugin);
    const result = await searchAgent.search("Find food notes", {
      tagRequirement: {mustHave: "food", preferred: null}
    });

    expect(result.found).toBe(true);
    const resultNote = result.note || (result.notes && result.notes[0] && result.notes[0].note);
    expect(resultNote.uuid).toBe("note-tag-001");
  }, AWAIT_TIME * DEBUG_MULTIPLIER);

  // --------------------------------------------------------------------------------------
  it("should find notes pertaining to finance & retirement", async () => {
    const notes = [
      mockNote("Beach Trip 2024", "# My Vacation\n\nBeach trip. Amazing sunset!", "note-001", {
        images: [{url: "https://example.com/beach.jpg"}],
        tags: ["vacation", "photos"], updated: noteTimestampFromNow({daysAgo: 7})
      }),
    ];
  });
});
