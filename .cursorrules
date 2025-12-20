# Cursor Rules for ai-plugin

## Environment & Testing

- All necessary packages are already installed. Do NOT run `npm install` before executing tests.
- See README.md for instructions on invoking tests.

## Naming Conventions

- Avoid abbreviated variable and constant names. Prefer clarity over brevity.
  - Bad: `PRELIM_MATCH_COUNT`, `cfg`, `opts`, `params`
  - Good: `RANK_MATCH_COUNT`, `config`, `options`, `parameters`
- Use `outputFromInput` naming convention for transform/translation functions (prefer "from" over "to").
  - Bad: `notesToUniqueNotes`, `convertToJson`
  - Good: `uniqueNotesFromNotes`, `jsonFromObject`

## Code Formatting

- Use up to 100 characters of line width where practical.
- Avoid splitting function arguments onto separate lines; keep calls on one line when under 100 chars.
- Alphabetize:
  - Destructured variables from function returns: `const { alpha, beta, gamma } = fn()`
  - Function arguments in definitions and calls
  - Local helper functions within a file
  - Exported constants within a constants file

## Code Organization

- Use pre-function documentation blocks with `// --------------------------------------------------------------------------` dividers.
- Move magic numbers to named constants with descriptive names.
- Local helper functions should be alphabetically sorted within their section.
- If a function exceeds 30 lines, look for opportunities to extract logic into smaller helper functions.
- Functions exceeding 50 lines should be refactored into smaller, focused helpers.
- Within each file, exported functions should precede local/private functions.
- Use a delimiter block to mark the transition from exported to private functions:
  ```
  // --------------------------------------------------------------------------
  // Local helpers
  // --------------------------------------------------------------------------
  ```
- Within each section (exported and local), functions should be alphabetically sorted by name.

## Documentation

- Add JSDoc-style documentation for each new function.
- Use `//` line comments instead of `/* */` block comments for documentation.
  - Bad:
    ```
    /**
     * @param {string} name - The name
     * @returns {boolean} True if valid
     */
    ```
  - Good:
    ```
    // @param {string} name - The name
    // @returns {boolean} True if valid
    ```

## JavaScript Style

- Do NOT use the `??` nullish coalescing operator. Use explicit null/undefined checks instead.
  - Bad: `const value = score ?? 0`
  - Good: `const value = (score === undefined || score === null) ? 0 : score`

