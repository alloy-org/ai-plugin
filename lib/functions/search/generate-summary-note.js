import { noteUrlFromUUID, pluralize } from "app-util"
import { preferredModel } from "providers/ai-provider-settings"

const MAX_SCORE_DISPLAY = 10;

// --------------------------------------------------------------------------
// Create a summary note with search results
export async function createSearchSummaryNote(searchAgent, searchResult, userQuery) {
  const { notes } = searchResult;
  try {
    // Get the AI model used for the search
    const modelUsed = preferredModel(searchAgent.app, searchAgent.lastModelUsed) || "unknown model";

    // Generate note title
    const titlePrompt = `Create a brief, descriptive title (max 40 chars) for a search results note.
Search query: "${ userQuery }"
Found: ${ searchResult.found ? "Yes" : "No" }
Return ONLY the title text, nothing else.`;

    const titleBase = await searchAgent.llm(titlePrompt);
    const now = new Date();
    const noteTitle = `${ titleBase.trim() } (${ modelUsed } queried at ${ now.toLocaleDateString() })`;

    // Build note content
    let noteContent = "";

    if (notes?.length) {
      noteContent += `# Matched Notes (${ notes.length === searchResult.maxResultCount ? "top " : "" }${ pluralize(notes.length, "result") })\n\n`;

      noteContent += `| ***Note*** | ***Score (1-10)*** | ***Reasoning*** | ***Tags*** |\n`;
      noteContent += `| --- | --- | --- | --- |\n`;
      notes.forEach(note => {
        noteContent += `| [${ note.name }](${ note.url }) |` +
          ` ${ Math.min(note.finalScore?.toFixed(1), MAX_SCORE_DISPLAY) } |` +
          ` ${ note.reasoning || "N/A" } |` +
          ` ${ note.tags && note.tags.length > 0 ? note.tags.join(", ") : "Not found" } |\n`;
      });
    } else {
      noteContent += `## No Results Found\n\nNo notes matched the search criteria.\n\n`;
    }

    noteContent += `\n\n\n# Search Inputs\n\n**Query:**\n "${ userQuery }"\n\n`;
    noteContent += `**Result summary:** ${ searchResult.resultSummary }\n\n`

    const searchResultTag = searchAgent.summaryNoteTag();
    const localUuid = await searchAgent.app.createNote(noteTitle.trim(), [ searchResultTag ].filter(Boolean));
    const summaryNoteHandle = await searchAgent.app.findNote(localUuid);
    console.log(`Created ${ localUuid } which translates to`, summaryNoteHandle);
    await searchAgent.app.replaceNoteContent(summaryNoteHandle, noteContent);

    return {
      uuid: summaryNoteHandle.uuid,
      name: noteTitle.trim(),
      url: noteUrlFromUUID(summaryNoteHandle.uuid),
    };
  } catch (error) {
    console.error("Failed to create search summary note:", error);
    return null;
  }
}
