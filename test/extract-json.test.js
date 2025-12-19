import { extractJsonFromString } from "providers/fetch-json"
import { jsonFromAiText } from "app-util"

// --------------------------------------------------------------------------------------
describe("Observed AI responses", () => {

  it("should be parsed when missing starting bracket", () => {
    const openAiResponse = `"result": [
      "An additional",
      "A further",
      "One more",
      "A new addition to the",
      "Yet another",
      "(The) next in line for our GitClear blog series is a piece that...",
      "(Featuring) an extra new resource on the block: The GitClear help pages, presenting...",
      "(Introducing) a newfound gem amidst our blogging streak:",
      "(Showcasing), once again, something brand-new and informative:",
      "[Continuing with] an added bonus—more insights right here:"
    ]
    }`;

    const result = extractJsonFromString(openAiResponse);
    expect(result).toBeTruthy();
    expect(Object.keys(result)).toContain("result");
    expect(result["result"].length).toEqual(10);
  });

  it("should be parsed with missing quote", () => {
    const openAiResponse = `result":["insignificant","minor","negligible","unimportant","inconsequential","petty","slight","meaningless","nominal,","subordinate"]}`;
    const result = extractJsonFromString(openAiResponse);
    expect(result).toBeTruthy();
    expect(Object.keys(result)).toContain("result");
    expect(result["result"].length).toEqual(10);
  })
});

// --------------------------------------------------------------------------------------
describe("jsonFromAiText array and object handling", () => {

  it("should handle a single object wrapped in markdown code fences", () => {
    const response = "```json\n{ \"jsonStuff\": true }\n```";
    const result = jsonFromAiText(response);
    expect(result).toBeTruthy();
    expect(result.jsonStuff).toBe(true);
  });

  it("should handle an array wrapped in markdown code fences", () => {
    const response = "```json\n[\n{\"jsonStuff\": true}\n]\n```";
    const result = jsonFromAiText(response);
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].jsonStuff).toBe(true);
  });

  it("should handle a plain object", () => {
    const response = '"key": "value", "number": 42 }';
    const result = jsonFromAiText(response);
    expect(result).toBeTruthy();
    expect(result.key).toBe("value");
    expect(result.number).toBe(42);
  });

  it("should handle a plain array", () => {
    const response = '[{ "id": 1 }, { "id": 2 }]';
    const result = jsonFromAiText(response);
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it("should handle array with text before", () => {
    const response = 'Here is the result:\n[{ "item": "first" }]';
    const result = jsonFromAiText(response);
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].item).toBe("first");
  });

  it("should prefer array when both array and object brackets exist", () => {
    const response = '[{ "nested": true }';
    const result = jsonFromAiText(response);
    expect(result).toBeTruthy();
    expect(Array.isArray(result)).toBe(true);
  });
});
