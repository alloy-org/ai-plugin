import { AI_MODEL_LABEL } from "constants/settings"
import SearchAgent from "functions/search-agent"
import { phase1_analyzeQuery } from "functions/search/query-breakdown"
import { defaultTestModel, mockApp, mockPlugin, providersWithApiKey } from "../test-helpers"

const AWAIT_TIME = 30000;

// --------------------------------------------------------------------------------------
describe("Phase 1 Query Breakdown - Result Count", () => {
  const plugin = mockPlugin();
  
  // Helper to run query with real LLM if available
  const analyzeQueryWithRealLlm = async (userQuery, options = {}) => {
    const app = mockApp([]);
    const availableModels = providersWithApiKey();
    
    if (availableModels.length === 0) {
      console.warn("Skipping test: No configured AI providers found in environment");
      return null;
    }

    // Pick a model to test with (randomly or first available)
    const modelName = availableModels[Math.floor(Math.random() * availableModels.length)];
    app.settings[AI_MODEL_LABEL] = defaultTestModel(modelName);
    console.log(`Testing with model: ${ app.settings[AI_MODEL_LABEL] }`);

    const searchAgent = new SearchAgent(app, plugin);
    return await phase1_analyzeQuery(searchAgent, userQuery, options);
  };

  it("should extract resultCount of 1 when user requests 'the note that...'", async () => {
    const criteria = await analyzeQueryWithRealLlm("Find the note that contains the secret code");
    if (criteria) {
      expect(criteria.resultCount).toBe(1);
    }
  }, AWAIT_TIME);

  it("should fallback to default resultCount if user request is vague", async () => {
    // "Find some recipes" -> LLM should return null for resultCount, defaulting to 10
    const criteria = await analyzeQueryWithRealLlm("Find some recipes");
    if (criteria) {
      expect(criteria.resultCount).toBe(10); 
    }
  }, AWAIT_TIME);
  
  it("should respect options.resultCount override even if LLM returns something else", async () => {
    // LLM should see "Find 5 recipes" and try to return 5, but our override (3) should win
    const criteria = await analyzeQueryWithRealLlm("Find 5 recipes", { resultCount: 3 });
    if (criteria) {
      expect(criteria.resultCount).toBe(3);
    }
  }, AWAIT_TIME);

  it("should use LLM resultCount if options.resultCount is explicitly null", async () => {
    // "Find 5 recipes" -> LLM returns 5. Options has null, so we use LLM's 5.
    const criteria = await analyzeQueryWithRealLlm("Find 5 recipes", { resultCount: null });
    if (criteria) {
      expect(criteria.resultCount).toBe(5);
    }
  }, AWAIT_TIME);
});
