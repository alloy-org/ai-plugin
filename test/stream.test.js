import fs from "fs"
import { STREAM_MOCK_MODEL } from "../lib/constants/provider"
import { AI_MODEL_LABEL } from "../lib/constants/settings"
import nock from "nock"
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

// --------------------------------------------------------------------------------------
describe("This here plugin", () => {
  const plugin = mockPlugin();
  plugin.constants.isTestEnvironment = true;
  plugin.constants.streamTest = true;

  // --------------------------------------------------------------------------------------
  it("should handle overspaced response", async () => {
    const { app, note } = mockAppWithContent("Once upon a time there was a very special baby who was born a manager");

    // Mock the OpenAI API call
    nock("https://api.openai.com")
      .persist()
      .post("/v1/chat/completions")
      .reply((uri, requestBody, cb) => {
        const fileData = fs.readFileSync(path.join(__dirname, "fixtures/openai-thesaurus-stream.ndjson"), "utf8");
        const readableStream = new TestReadableStream();
        const jsonArray = JSON.parse(fileData);
        for (const chunk of jsonArray) {
          readableStream.addData(chunk);
        }
        console.log("Nock intercepted request. Sending back", fileData.length, "bytes")
        cb(null, [ 200, "taco" ]);
        // cb(null, [ 200, readableStream ]);
        // return new Promise((resolve, reject) => resolve(fileData));
        // return fs.createReadStream(path.join(__dirname, "fixtures/openai-thesaurus-stream.ndjson"));
      });

    app.notes.find.mockReturnValue(note);
    mockAlertAccept(app);
    // app.settings[AI_MODEL_LABEL] = "gpt-4-1106-preview";
    app.settings[AI_MODEL_LABEL] = STREAM_MOCK_MODEL;
    await plugin.replaceText["Thesaurus"].run(app, "manager");

    const tuple = app.prompt.mock.calls[0];
    const answers = tuple[1].inputs[0].options.map(option => option.value.toLowerCase());

    expect(answers).toEqual(["Jesus"]);
  }, AWAIT_TIME);
})
