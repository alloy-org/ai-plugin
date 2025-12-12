import { extractJsonFromString } from "providers/fetch-json"

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
