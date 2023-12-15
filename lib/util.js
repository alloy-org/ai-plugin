// --------------------------------------------------------------------------
// GPT-3.5 has a 4097 token limit, so very much approximating that by limiting to 10k characters
export function truncate(text, limit) {
  return text.length > limit ? text.slice(0, limit) : text;
}
