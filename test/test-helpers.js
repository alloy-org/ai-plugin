import fs from "fs"
import { PROVIDER_DEFAULT_MODEL_IN_TEST } from "constants/provider"
import { PROVIDER_SETTING_KEY_LABELS, settingKeyLabel } from "constants/settings"
import dotenv from "dotenv"
import fetch from "isomorphic-fetch"
import { jest } from "@jest/globals"
import pluginObject from "../lib/plugin"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGIN_INTERFACES = [ "appOption", "dailyJotOption", "imageOption", "insertText", "linkOption",
  "noteOption", "renderEmbed", "replaceText" ];
export const LOCAL_MODELS_RUNNING = process.env.LOCAL_MODELS !== "suspended";

// --------------------------------------------------------------------------------------
export function aiProviderTestKey(providerEm) {
  switch (providerEm) {
    case "anthropic": return process.env.ANTHROPIC_API_KEY;
    case "deepseek": return process.env.DEEPSEEK_API_KEY;
    case "gemini": return process.env.GEMINI_API_KEY;
    case "grok": return process.env.GROK_API_KEY;
    case "openai": return process.env.OPENAI_API_KEY;
    case "perplexity": return process.env.PERPLEXITY_API_KEY;
  }
}

// --------------------------------------------------------------------------------------
export function contentFromFileName(fileName) {
  const filePath = path.join(__dirname, `fixtures/${ fileName }`);
  return fs.readFileSync(filePath, "utf8");
}

// --------------------------------------------------------------------------------------
export function defaultTestModel(providerEm) {
  return PROVIDER_DEFAULT_MODEL_IN_TEST[providerEm];
}

// --------------------------------------------------------------------------------------
export function mockAlertAccept(app) {
  app.alert.mockImplementation(async (text, options) => {
    if (!options) return null;
    return -1;
  });
}

// --------------------------------------------------------------------------------------
export function mockPlugin() {
  const plugin = pluginObject;
  global.fetch = fetch;

  PLUGIN_INTERFACES.forEach(entryPointKey => {
    if (plugin[entryPointKey]) {
      Object.entries(plugin[entryPointKey]).forEach(([ functionName, checkAndRunOrFunction ]) => {
        if (checkAndRunOrFunction.check || checkAndRunOrFunction.run) {
          if (checkAndRunOrFunction.check) {
            plugin[entryPointKey][functionName].check = plugin[entryPointKey][functionName].check.bind(plugin);
          }
          if (checkAndRunOrFunction.run) {
            plugin[entryPointKey][functionName].run = plugin[entryPointKey][functionName].run.bind(plugin);
          }
        } else {
          plugin[entryPointKey][functionName] = plugin[entryPointKey][functionName].bind(plugin); // .insertText
        }
      });
    }
  });

  plugin.callCountByModel = {};
  plugin.constants.isTestEnvironment = true;
  plugin.errorCountByModel = {};
  plugin.ollamaModelsFound = null;

  // If LOCAL_MODELS is suspended, disable checking for local models (Ollama)
  if (!LOCAL_MODELS_RUNNING) {
    plugin.noLocalModels = true;
  }

  return plugin;
}

// --------------------------------------------------------------------------------------
export function mockAppWithContent(content) {
  const note = mockNote(content, "Baby's first plugin", "abc123");
  const app = mockApp(note);
  return { app, note };
}

// --------------------------------------------------------------------------------------
export function mockApp(notes, { plugin = null } = {}) {
  // Accept either a single note or an array of notes
  const allNotes = Array.isArray(notes) ? notes : (notes ? [notes] : []);
  const seedNote = allNotes[0] || null;

  const app = {};

  // Store all notes for search functionality
  app._allNotes = allNotes;

  app.alert = jest.fn().mockImplementation(async (text, options = {}) => {
    console.debug("Alert was called", text);
  });
  app.context = {};
  app.context.noteUUID = seedNote?.uuid || "abc123";
  app.context.replaceSelection = jest.fn();
  app.context.replaceSelection.mockImplementation(async (newContent, sectionObject = null) => {
    if (seedNote) {
      await seedNote.replaceContent(newContent, sectionObject);
    }
  });

  app.createNote = jest.fn().mockImplementation(async (name, tags = []) => {
    const newNote = mockNote("", name, `note-created-${ Date.now() }`, { tags });
    allNotes.push(newNote);
    return newNote;
  });

  // Helper function to find a note by handle (can be UUID string or note object)
  const findNoteByHandle = (noteHandle) => {
    const uuid = typeof noteHandle === "string" ? noteHandle : noteHandle?.uuid;
    return allNotes.find(n => n.uuid === uuid);
  };

  // filterNotes - searches note titles and filters by tags
  app.filterNotes = jest.fn().mockImplementation(async (options = {}) => {
    const { query, tag } = options;
    let results = [...app._allNotes];

    if (tag) {
      results = results.filter(note => note.tags && note.tags.includes(tag));
    }

    if (query) {
      const queryWords = query.toLowerCase().split(/\s+/);
      results = results.filter(note => {
        const nameLower = (note.name || "").toLowerCase();
        // Match if any query word appears in the title
        return queryWords.some(word => nameLower.includes(word));
      });
    }

    return results;
  });

  app.getNoteContent = jest.fn().mockImplementation(async (noteHandle) => {
    const note = findNoteByHandle(noteHandle);
    return note ? note.content() : null;
  });

  app.insertNoteContent = jest.fn().mockImplementation(async (noteHandle, content) => {
    const note = findNoteByHandle(noteHandle);
    if (note) {
      note.body += content;
    }
  });

  app.navigate = jest.fn();
  app.prompt = jest.fn().mockImplementation(async (text, options = {}) => {
    console.error("Prompting user", prompt, "You probably wanted to mock this so it would respond?");
  });
  app.notes = {};
  app.notes.find = jest.fn().mockResolvedValue(null);
  app.notes.filter = jest.fn().mockResolvedValue(null);
  app.openEmbed = jest.fn().mockImplementation(async () => plugin?.renderEmbed(app))
  app.replaceNoteContent = jest.fn().mockImplementation(async (noteHandle, content) => {
    const note = findNoteByHandle(noteHandle);
    if (note) {
      note.body = content;
    }
  });
  app.setSetting = jest.fn().mockResolvedValue(null);
  app.setSetting.mockImplementation((key, value) => {
    app.settings[key] = value;
  });

  app.settings = {};
  for (const providerEm of Object.keys(PROVIDER_SETTING_KEY_LABELS)) {
    if (aiProviderTestKey(providerEm)) {
      app.settings[settingKeyLabel(providerEm)] = aiProviderTestKey(providerEm);
    }
  }

  // searchNotes - searches note content
  app.searchNotes = jest.fn().mockImplementation(async (query) => {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    return app._allNotes.filter(note => {
      const contentLower = (note.body || "").toLowerCase();
      const nameLower = (note.name || "").toLowerCase();
      const combined = contentLower + " " + nameLower;
      // Match if the query appears as a phrase, or if all words appear
      return combined.includes(queryLower) ||
        queryWords.every(word => combined.includes(word));
    });
  });

  if (allNotes.length > 0) {
    const noteFunction = jest.fn();
    noteFunction.mockImplementation(async (noteHandle) => {
      return findNoteByHandle(noteHandle) || null;
    });

    app.findNote = noteFunction;
    app.notes.find = noteFunction;
  }

  return app;
}

// --------------------------------------------------------------------------------------
export function mockNote(content, name, uuid, options = {}) {
  const note = {};
  note.body = content;
  note.name = name;
  note.uuid = uuid;
  note.tags = options.tags || [];
  note.created = options.created || new Date().toISOString();
  note.updated = options.updated || new Date().toISOString();
  note._images = options.images || [];
  note._attachments = options.attachments || [];

  note.content = async () => note.body;

  // --------------------------------------------------------------------------------------
  note.attachments = async () => {
    return note._attachments;
  }

  // --------------------------------------------------------------------------------------
  note.insertContent = async (newContent, options = {}) => {
    if (options.atEnd) {
      note.body += newContent;
    } else {
      note.body = `${ note.body }\n${ newContent }`;
    }
  }

  // --------------------------------------------------------------------------------------
  note.replaceContent = async (newContent, sectionObject = null) => {
    if (sectionObject) {
      const sectionHeadingText = sectionObject.section.heading.text;
      let throughLevel = sectionObject.section.heading?.level;
      if (!throughLevel) throughLevel = sectionHeadingText.match(/^#*/)[0].length;
      if (!throughLevel) throughLevel = 1;

      const indexes = Array.from(note.body.matchAll(/^#+\s*([^#\n\r]+)/gm));
      const sectionMatch = indexes.find(m => m[1].trim() === sectionHeadingText.trim());
      let startIndex, endIndex;
      if (!sectionMatch) {
        throw new Error(`Could not find section ${ sectionHeadingText } that was looked up. This might be expected`);
      } else {
        const level = sectionMatch[0].match(/^#+/)[0].length;
        const nextMatch = indexes.find(m => m.index > sectionMatch.index && m[0].match(/^#+/)[0].length <= level);
        endIndex = nextMatch ? nextMatch.index : note.body.length;
        startIndex = sectionMatch.index + sectionMatch[0].length + 1;
      }

      if (Number.isInteger(startIndex)) {
        const revisedContent = `${ note.body.slice(0, startIndex) }${ newContent.trim() }\n${ note.body.slice(endIndex) }`;
        note.body = revisedContent;
      } else {
        throw new Error(`Could not find section ${ sectionObject.section.heading.text } in note ${ note.name }`);
      }
    } else {
      note.body = newContent;
    }
  };

  // --------------------------------------------------------------------------------------
  note.sections = async () => {
    const headingMatches = note.body.matchAll(/^#+\s*([^\n]+)/gm);
    return Array.from(headingMatches).map(match => ({
      anchor: match[1].replace(/\s/g, "_"),
      level: /^#+/.exec(match[0]).length,
      text: match[1],
    }));
  }

  // --------------------------------------------------------------------------------------
  note.images = async () => {
    return note._images;
  }

  // --------------------------------------------------------------------------------------
  note.url = async () => {
    return `https://www.amplenote.com/notes/${ note.uuid }`;
  }

  return note;
}

// --------------------------------------------------------------------------------------
// @param {{ daysAgo?: number, monthsAgo?: number }} age - Relative note age from "now"
// @returns {string} ISO timestamp for a note created/updated time relative to now
export function noteTimestampFromNow(age = {}) {
  const { daysAgo, monthsAgo } = age;
  const timestamp = new Date();

  if (Number.isInteger(monthsAgo) && monthsAgo > 0) {
    timestamp.setMonth(timestamp.getMonth() - monthsAgo);
  }

  if (Number.isInteger(daysAgo) && daysAgo > 0) {
    timestamp.setDate(timestamp.getDate() - daysAgo);
  }

  return timestamp.toISOString();
}

// --------------------------------------------------------------------------------------
// Returns an array of provider identifiers that have API keys configured in the environment
export function providersWithApiKey() {
  const allProviders = Object.keys(PROVIDER_SETTING_KEY_LABELS);
  return allProviders.filter(providerEm => aiProviderTestKey(providerEm));
}
