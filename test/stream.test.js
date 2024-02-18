import fs from "fs"
import { STREAM_MOCK_MODEL } from "../lib/constants/provider"
import { AI_MODEL_LABEL } from "../lib/constants/settings"
import { jest } from "@jest/globals"
import path from "path"
import { Readable } from "stream"
import { mockAlertAccept, mockAppWithContent, mockPlugin } from "./test-helpers"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AWAIT_TIME = 20000;

class TestReadableStream extends Readable {
  constructor(options) {
    super(options);
    this.data = []; // This will store the data to be streamed
  }

  _read(size) {
    // This method is called when the stream wants to read data.
    // You can push data into the stream here.
    if (this.data.length >  0) {
      this.push(this.data.shift());
    } else {
      this.push(null); // Signal that no more data will be provided
    }
  }

  // Method to add data to the stream
  addData(data) {
    this.data.push(data);
  }
}

const fileData = fs.readFileSync(path.join(__dirname, "fixtures/openai-thesaurus-stream.ndjson"), "utf8");

function mockFetch(data) {
  return jest.fn(() =>
    Promise.resolve({
      body: {
        on: (event, handler) => {
          if (event === 'readable') {
            console.log("Calling readable");
            // Simulate asynchronous data chunks
            setImmediate(() => handler());
          }
        },
        read: () => {
          // Return a chunk of data; simulate end of data by eventually returning null
          return "data chunk"; // Replace with actual data you want to mock
        }
      },
      ok: true,
    })
  );
}

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  beforeEach(() => {
    global.fetch = mockFetch(null);
  });

  afterAll(() => {
    // fetch.resetMocks();
  });

  // --------------------------------------------------------------------------------------
  it("should handle overspaced response", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    // app.settings[AI_MODEL_LABEL] = "gpt-4-1106-preview";
    app.settings[AI_MODEL_LABEL] = STREAM_MOCK_MODEL;
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(answers).toEqual(["Jesus"]);
  }, AWAIT_TIME * 2);
})
