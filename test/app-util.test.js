import { pluralize } from "app-util"

// --------------------------------------------------------------------------------------
describe("pluralize", () => {

  it("should pluralize with integer number", () => {
    expect(pluralize(1, "cat")).toBe("1 cat");
    expect(pluralize(2, "cat")).toBe("2 cats");
    expect(pluralize(0, "cat")).toBe("0 cats");
    expect(pluralize(100, "dog")).toBe("100 dogs");
  });

  it("should pluralize with string numeric value", () => {
    expect(pluralize("1", "cat")).toBe("1 cat");
    expect(pluralize("2", "cat")).toBe("2 cats");
    expect(pluralize("0", "cat")).toBe("0 cats");
    expect(pluralize("100", "dog")).toBe("100 dogs");
  });

  it("should format numbers with locale string", () => {
    expect(pluralize(1000, "item")).toBe("1,000 items");
    expect(pluralize("1000", "item")).toBe("1,000 items");
  });

  it("should throw error for non-numeric strings", () => {
    expect(() => pluralize("not a number", "cat")).toThrow("pluralize() requires an integer to be given");
  });

  it("should throw error for NaN", () => {
    expect(() => pluralize(NaN, "cat")).toThrow("pluralize() requires an integer to be given");
  });

  it("should throw error for null or undefined", () => {
    expect(() => pluralize(null, "cat")).toThrow("pluralize() requires an integer to be given");
    expect(() => pluralize(undefined, "cat")).toThrow("pluralize() requires an integer to be given");
  });
});

