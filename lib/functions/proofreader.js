const WRITING_IMPROVEMENT_SUGGESTIONS = [
  {
    by: "sentence",
    label: "Suggest removing/shortening sentences",
    example: ({
      inputs: [
        `1. At some point, we need to go find some apple fritters.`,
        `2. Pump it up, pump it up, PUMP UP THE VOLUME.`,
        `3. Don't be such a cheapskate, hand over the apples.`
        `4. If nothing else, there are bound to be some extremely wonderful apples in Washington state.`
      ],
      response: {
        "1": [ "We need to go find some apple fritters.", "We need some apple fritters.", "Let's go find some apple fritters." ],
        "4": [ "There are bound to be some wonderful apples in Washington.", "I hear there are great apples in Washington state.", "Washington is certain to have wonderful apples." ]
      }
    })
  },
  {
    by: "sentence",
    label: "Fix grammar inconsistencies & missing words",
    example: ({
      inputs: [
        `1. At some point, she the apples`,
        `2. They're favorite soup is duck soup, strangely.`,
        `3. I try not too get to angry when people mix up "composed of" vs "comprised of," but if I murder them occasionally, so it goes.`
        `4. Chicken?`
      ],
      response: {
        "1": [ "At some point, she ate the apples", "At some point, she bought the apples", "At some point, she took the apples" ],
        "2": [ "Their favorite soup is duck soup, strangely.", "Their favorite soup is duck soup." ],
        "3": [ `I try not to get too angry when people mix up "composed of" vs "comprised of," but if I murder them occasionally, so it goes.`, `I try not to get too angry when people mix up "composed of" vs "comprised of," but if I murder them occasionally, whoops.` ]
      }
    })
  },
  {
    by: "sentence",
    label: "Revise passive voice to active"
  },
  {
    by: "sentence",
    label: "Remove filler words (e.g., adverbs)",
  },
  {
    by: "paragraph",
    label: "Add supporting facts/examples",
  },
  {
    by: "sentence",
    label: "Suggest alternate word choices",
  },
  {
    by: "paragraph",
    label: "Suggest better document flow",
  },
  {
    by: "paragraph",
    label: "Suggest better document transitions",
  },
  {
    by: "paragraph",
    label: "Suggest humorous asides",
  },
  {
    by: "paragraph",
    label: "Suggest better document organization",
  }
];

// --------------------------------------------------------------------------
export async function initiateProofread(plugin, app, noteUUID) {
  const note = await app.notes.find(noteUUID);
  const noteContent = await note.content();
  const checkboxInputs = WRITING_IMPROVEMENT_SUGGESTIONS.map(detail => ({
    label: detail.label,
    value: true,
    type: "checkbox",
  }));

  const instructionArray = await app.prompt("What changes & improvements shall we look for?", {
    inputs: checkboxInputs.concat({
      label: "Other instructions (optional)",
      type: "text",
    })
  });

  const { numberedParagraphs, numberedSentences } = numberedContent(noteContent);
  for (const improvementSuggestion of WRITING_IMPROVEMENT_SUGGESTIONS) {
    const unit = improvementSuggestion.by;
    const system = "You are a New York Times bestselling columnist that helps to write snappy content for friends in your spare time";
    const messages = [ `Your friend has requested that you read their preliminary writing to help them improve it before they 
      publish to a broad audience. They have given you an essay entitled "${ note.name }" and` +
      `specifically requested that you review their ${ unit } for "${ improvementSuggestion.label }"` ];
    messages.push(`For each ${ unit } where you have a suggestion, respond with that number, and three 3 options whose text 
      would improve the ${ unit }`);

  }
}

// --------------------------------------------------------------------------
function numberedContent(noteContent) {
  const paragraphs = noteContent.split("\n").filter(n => n.length);
  const numberedParagraphs = [];
  for (let i = 0; i < paragraphs.length; i++) {
    numberedParagraphs.push(`${ i }. ${ paragraphs[i] }`)
  }

  const minSentenceLength = 5;
  const sentences = noteContent.split(".").filter(s => s.trim().match(/([\w]+[\s\b]+){1,}/)?.at(0)?.length > minSentenceLength);
  const numberedSentences = [];
  for (let i = 0; i < sentences.length; i++) {
    numberedSentences.push(`${ i }. ${ sentences[i] }`)
  }

  return { numberedParagraphs, numberedSentences };
}
