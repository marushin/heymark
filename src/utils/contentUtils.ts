/**
 * Extracts the first non-empty line from markdown content and cleans it for use as a title.
 * @param content The markdown content
 * @param fallback The fallback title (usually the filename)
 * @returns The extracted title or fallback
 */
export const getTitleFromContent = (content: string, fallback: string): string => {
  if (!content || content.trim() === "") return fallback;
  
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      // Remove markdown heading symbols if the line starts with them
      // e.g., "# My Title" -> "My Title", "## Sub Title" -> "Sub Title"
      return trimmed.replace(/^#+\s*/, "");
    }
  }
  
  return fallback;
};
