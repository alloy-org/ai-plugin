
// --------------------------------------------------------------------------
export async function userSearchCriteria(app) {
  return await app.prompt("Enter your search criteria", { inputs: [
      { type: "text", label: "Describe any identifying details of the note(s) you wish to locate" },
      { type: "date", label: "Only notes created or changed since (optional)" },
      { type: "tags", label: "Only return notes with this tag (optional)" },
      { type: "string", label: "Max notes to return (optional)" },
    ] });
}
