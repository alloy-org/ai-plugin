import { AI_MODEL_LABEL, SEARCH_USING_AGENT_LABEL } from "constants/settings"
import SearchAgent from "functions/search-agent"
import {
  defaultTestModel,
  mockAlertAccept,
  mockApp,
  mockNote,
  mockPlugin,
  providersWithApiKey
} from "./test-helpers"

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
      // Note 0: Has image but no sandwich content
      mockNote("# My Vacation\n\nBeach trip. Amazing sunset!", "Beach Trip 2024", "note-001", {
        images: [{ url: "https://example.com/beach.jpg", width: 1200, height: 800 }],
        tags: ["vacation", "photos"], updated: "2024-12-01T10:00:00Z"
      }),

      // Note 1: Has sandwich content but no image
      mockNote("# Restaurant Review\n\nTried a new deli. Pastrami was great!", "NYC Deli", "note-002",
        { tags: ["food", "nyc"], updated: "2024-11-20T15:30:00Z" }
      ),

      // Note 2: THE MATCH - Has both image and sandwich with mystery meat in New York
      mockNote(
        "# Food Adventures in NYC\n\nFound an amazing street vendor in Manhattan. Had the most " +
        "delicious sandwich with bologna that I couldn't identify, but it was incredible! " +
        "Secret family recipe from New York. Need to find this cart again!\n\nSpicy tangy sauce.",
        "Street Food Discovery", "note-003", {
          images: [
            { url: "https://example.com/sandwich.jpg", width: 800, height: 600 },
            { url: "https://example.com/vendor.jpg", width: 800, height: 600 }
          ],
          tags: ["food", "nyc", "street-food"], updated: "2024-12-10T14:20:00Z"
        }
      ),

      // Note 3: Has image and food content but not sandwich
      mockNote("# Pizza Night\n\nMade pizza from scratch. Perfect dough!", "Pizza Success", "note-004",
        {
          images: [{ url: "https://example.com/pizza.jpg", width: 1000, height: 750 }],
          tags: ["food", "cooking"], updated: "2024-11-15T19:00:00Z"
        }
      ),

      // Note 4: Food content, no image, mentions New York but not sandwich
      mockNote(
        "# NY Restaurants\n\nBest places:\n- Joe's Pizza\n- Katz's Deli\n- Shake Shack",
        "NY Food Guide", "note-005",
        { tags: ["food", "guide", "nyc"], updated: "2024-10-05T12:00:00Z" }
      ),

      // Note 5: Travel note with images, no food content
      mockNote("# European Trip\n\nParis and Rome. Stunning architecture!", "Europe 2024", "note-006",
        {
          images: [
            { url: "https://example.com/eiffel.jpg", width: 900, height: 1200 },
            { url: "https://example.com/colosseum.jpg", width: 1200, height: 900 }
          ],
          tags: ["travel", "europe"], updated: "2024-09-20T08:00:00Z"
        }
      ),

      // Note 6: Has sandwich in title but no image or detailed content
      mockNote("# Ideas\n\nTry:\n- BLT\n- Club\n- Reuben", "Sandwich Wishlist", "note-007",
        { tags: ["food", "todo"], updated: "2024-08-10T16:00:00Z" }
      ),

      // Note 7: Has image and mentions meat but not sandwich
      mockNote("# BBQ Party\n\nGrilled steaks and ribs. Great BBQ sauce!", "Weekend BBQ", "note-008",
        {
          images: [{ url: "https://example.com/bbq.jpg", width: 1100, height: 800 }],
          tags: ["food", "bbq", "party"], updated: "2024-07-22T18:30:00Z"
        }
      ),

      // Note 8: Work note with no food content or images
      mockNote("# Meeting Notes\n\nQ4 goals and timeline. Follow up on budget.", "Q4 Planning",
        "note-009", { tags: ["work", "meetings"], updated: "2024-12-05T09:00:00Z" }
      ),

      // Note 9: Has image and New York but talks about buildings, not food
      mockNote("# NYC Architecture\n\nIncredible buildings. Love Art Deco!", "Architecture Notes",
        "note-010", {
          images: [{ url: "https://example.com/building.jpg", width: 800, height: 1200 }],
          tags: ["architecture", "nyc"], updated: "2024-06-15T11:00:00Z"
        }
      )
    ];

    const app = mockApp(notes);
    mockAlertAccept(app);
    const testModel = defaultTestModel("gemini");
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
    expect(result.notes[0].uuid).toBe("note-003");
    expect(result.notes[0].name).toBe("Street Food Discovery");
    expect(result.confidence).toBeGreaterThan(7); // Should have high confidence

  }, AWAIT_TIME*DEBUG_MULTIPLIER);

  // --------------------------------------------------------------------------------------
  it("should filter candidates by tag requirement", async () => {
    const notes = [
      mockNote("# Food Recipes\n\nMy collection of cooking recipes and meal ideas.", "Recipes from Mother",
        "note-tag-001", { tags: ["food", "recipes"] }
      ),
      mockNote("# Plain Note\n\nTalks about food and cooking but has no tags.", "Plain Jane the main dame",
        "note-tag-002", { tags: [] }
      )
    ];

    const app = mockApp(notes);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = defaultTestModel("anthropic");

    const searchAgent = new SearchAgent(app, plugin);
    const result = await searchAgent.search("Find food notes", {
      tagRequirement: { mustHave: "food", preferred: null }
    });

    expect(result.found).toBe(true);
    const resultNote = result.note || result.notes[0];
    expect(resultNote.uuid).toBe("note-tag-001");
  }, AWAIT_TIME*DEBUG_MULTIPLIER);
});
