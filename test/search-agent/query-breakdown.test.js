import { AI_MODEL_LABEL } from "constants/settings"
import SearchAgent from "functions/search-agent"
import { phase1_analyzeQuery } from "functions/search/query-breakdown"
import { defaultTestModel, mockApp, mockPlugin, providersWithApiKey } from "../test-helpers"

const AWAIT_TIME = 30000;

// --------------------------------------------------------------------------------------
// Words that commonly appear in user query prefixes but should never be extracted as keywords.
// These are filler words from phrases like "Return notes with", "Notes that mention", etc.
const PREFIX_FILLER_WORDS = [
  "about", "all", "any", "can", "contain", "containing", "find", "me", "mention", "note", "notes",
  "notebook", "reference", "return", "show", "some", "talk", "with", "written", "you" ];

// --------------------------------------------------------------------------------------
// Test cases: [userQuery, expectedContentWords]
// Each test verifies that prefix filler words are excluded and expected content words are found.
const PREFIX_FILTERING_TEST_CASES = [
  ["Return all notes that contain recipes for chocolate cake", ["cake", "chocolate", "recipe"], []],
  ["Present ALL notes that make mention or reference to our quarterly budget meeting", ["budget", "meeting", "quarterly"], []],
  ["Any notes from my notebook that happen to talk about Python programming tutorials", ["programming", "python", "tutorial"], []],
  ["Find some notes containing vacation photos from Hawaii", ["hawaii", "photo", "vacation"], []],
  ["Show me ALL THE notes you can find with tax documents from 2024", ["2024", "document", "tax"], ["return"]],
  ["Anything I've written about that the popular systems for taking great notes", [ "note", "system" ], ["note"]],
];

// --------------------------------------------------------------------------------------
describe("Query Breakdown - Prefix Filtering", () => {
  const plugin = mockPlugin();

  // --------------------------------------------------------------------------------------
  it.each(PREFIX_FILTERING_TEST_CASES)(
    "should exclude prefix filler words and find content keywords for: %s",
    async (userQuery, expectedContentWords, allowedFillerWords) => {
      const app = mockApp([]);
      const availableModels = providersWithApiKey();
      const modelName = availableModels[Math.floor(Math.random() * availableModels.length)];
      app.settings[AI_MODEL_LABEL] = defaultTestModel(modelName);

      const searchAgent = new SearchAgent(app, plugin);
      const criteria = await phase1_analyzeQuery(searchAgent, userQuery, {});

      // Verify no prefix filler words appear in keywords
      const llmReturnedKeywords = [
        ...criteria.primaryKeywords.map(keyword => keyword.toLowerCase()),
        ...criteria.secondaryKeywords.map(keyword => keyword.toLowerCase()),
      ];

      for (const fillerWord of PREFIX_FILLER_WORDS) {
        if (!allowedFillerWords.includes(fillerWord.replace(/s$/, ""))) {
          expect(llmReturnedKeywords).not.toContain(fillerWord);
        }
      }

      // Verify at least one expected content word is present
      const hasExpectedWord = expectedContentWords.every(expectedWord =>
        llmReturnedKeywords.find(wordOrPhrase => {
          const words = wordOrPhrase.split(" ").map(w => w.replace(/s$/, ""));
          return words.includes(expectedWord);
        })
      );
      expect(hasExpectedWord).toBe(true);
    }, AWAIT_TIME);
});
