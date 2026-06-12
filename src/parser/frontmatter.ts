/**
 * Minimal YAML frontmatter parser — handles the subset we see in
 * DefenseTech copy: simple key: value pairs, no nested objects, no arrays
 * beyond comma-separated wikilink lists. Avoids pulling in a full YAML
 * dep just for this.
 *
 * Recognized value types:
 *   key: value           → string
 *   key: [v1, v2]        → array of strings (Obsidian-style)
 *   key: "quoted"        → string with leading/trailing quotes stripped
 */

export function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    // Skip comments and empty lines
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const colonMatch = line.match(/^([\w-]+):\s*(.*)$/);
    if (!colonMatch) continue;

    const key = colonMatch[1]!;
    let value = colonMatch[2]!.trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function extractFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const frontmatter = parseFrontmatter(match[1]!);
  const body = text.slice(match[0].length);
  return { frontmatter, body };
}
