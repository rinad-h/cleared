// Minimal JSONC parser for wrangler.jsonc: drops // and /* */ comments outside
// strings and trailing commas before } or ]. Throws on malformed input instead
// of hanging (an unterminated block comment is an error).

export function stripJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) throw new Error("unterminated /* comment");
      i = end + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}

/** Every string value in a parsed JSON tree, with its key path (e.g. "vars.PUBLIC_BASE_URL"). */
export function* stringValues(node, path = []) {
  if (typeof node === "string") yield [path.join("."), node];
  else if (Array.isArray(node)) for (const [i, v] of node.entries()) yield* stringValues(v, [...path, String(i)]);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) yield* stringValues(v, [...path, k]);
}
