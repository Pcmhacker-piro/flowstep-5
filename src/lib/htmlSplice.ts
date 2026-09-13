// Structural-path addressing for elements inside a generated design document.
//
// Selection happens in a live iframe DOM, but edits must be spliced back into
// the stored HTML string. Matching by serialized outerHTML is unreliable (the
// browser normalizes attributes, quotes and self-closing tags), and regex
// matching breaks on nested same-tag elements. A child-index path from <body>
// is exact for both directions, so every target — any element, at any depth —
// can be read and replaced deterministically.

export type ElementPath = number[];

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function serialize(doc: Document, original: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(original)?.[0]?.trim() ?? "<!DOCTYPE html>";
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

/** Child-index path from `root` down to `el`, or null when not a descendant. */
export function pathOf(el: Element, root: Element): ElementPath | null {
  const path: number[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path : null;
}

export function elementAtPath(root: Element, path: ElementPath): Element | null {
  let node: Element | null = root;
  for (const index of path) {
    node = node?.children.item(index) ?? null;
    if (!node) return null;
  }
  return node;
}

/** outerHTML of the element at `path` inside `html`, optionally tagged with an edit id. */
export function readSnippetAtPath(
  html: string,
  path: ElementPath,
  editId?: string,
): string | null {
  const doc = docFromHtml(html);
  if (!doc.body) return null;
  const el = elementAtPath(doc.body, path);
  if (!el) return null;
  const clone = el.cloneNode(true) as Element;
  if (editId) clone.setAttribute("data-edit-id", editId);
  else clone.removeAttribute("data-edit-id");
  return clone.outerHTML;
}

/** Replace the element at `path` with `newSnippet`; returns the full HTML or null. */
export function spliceAtPath(
  html: string,
  path: ElementPath,
  newSnippet: string,
): string | null {
  if (path.length === 0) return null;
  const doc = docFromHtml(html);
  if (!doc.body) return null;
  const el = elementAtPath(doc.body, path);
  if (!el || !el.parentNode) return null;

  const replacement = firstElementOf(newSnippet);
  if (!replacement) return null;

  el.parentNode.replaceChild(doc.importNode(replacement, true), el);
  return serialize(doc, html);
}

// ---------------------------------------------------------------------------
// Path verification
//
// The path is captured in the LIVE iframe DOM, but applied to the stored HTML
// string. Those two trees can drift (scripts that inject nodes, markup the
// parser relocates), and a one-off index silently rewrites the WRONG element.
// So every path is re-verified against a signature of the picked element, and
// re-derived by search when it does not line up.
// ---------------------------------------------------------------------------

type Signature = { tag: string; cls: string; text: string; kids: number };

function normText(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Parse a snippet and return its single root element (handles full documents). */
export function firstElementOf(snippet: string): Element | null {
  const trimmed = snippet.trim();
  const doc = docFromHtml(
    /^<!doctype|^<html[\s>]/i.test(trimmed) ? trimmed : `<body>${trimmed}</body>`,
  );
  return doc.body?.firstElementChild ?? null;
}

function signatureOf(el: Element): Signature {
  return {
    tag: el.tagName.toLowerCase(),
    cls: (el.getAttribute("class") ?? "").replace(/\s+/g, " ").trim(),
    text: normText(el.textContent ?? ""),
    kids: el.children.length,
  };
}

function scoreMatch(a: Signature, b: Signature): number {
  if (a.tag !== b.tag) return 0;
  let score = 1;
  if (a.cls && a.cls === b.cls) score += 3;
  if (a.text && a.text === b.text) score += 3;
  if (!a.text && !b.text) score += 1;
  if (a.kids === b.kids) score += 1;
  return score;
}

/**
 * Return the path that really points at the picked element inside `html`.
 * Prefers `path` when it still matches the element's signature; otherwise finds
 * the best unique match. Returns null when the element cannot be located — the
 * caller must then skip the edit rather than clobber an unrelated element.
 */
export function resolveElementPath(
  html: string,
  path: ElementPath,
  snippet: string,
): ElementPath | null {
  const ref = firstElementOf(snippet);
  if (!ref) return null;
  ref.removeAttribute("data-edit-id");
  ref.removeAttribute("data-lov-hover");
  const sig = signatureOf(ref);

  const doc = docFromHtml(html);
  if (!doc.body) return null;

  const perfect = 1 + (sig.cls ? 3 : 0) + (sig.text ? 3 : 0) + (sig.text ? 0 : 1) + 1;

  const candidate = path.length > 0 ? elementAtPath(doc.body, path) : null;
  if (candidate && scoreMatch(sig, signatureOf(candidate)) >= perfect) return path;

  let best: Element | null = null;
  let bestScore = 0;
  let ties = 0;
  doc.body.querySelectorAll(sig.tag).forEach((el) => {
    const score = scoreMatch(sig, signatureOf(el));
    if (score > bestScore) {
      bestScore = score;
      best = el;
      ties = 1;
    } else if (score === bestScore && score > 0) {
      ties++;
    }
  });

  // Weak or ambiguous matches are not good enough to edit blindly.
  if (!best || bestScore < 4) {
    return candidate && scoreMatch(sig, signatureOf(candidate)) >= 4 ? path : null;
  }
  if (ties > 1 && bestScore < perfect) return null;
  return pathOf(best, doc.body);
}

/** Short human label for a picked element. */
export function labelFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  if (text && text.length <= 28 && el.children.length === 0) return `${tag} "${text}"`;
  const cls =
    typeof (el as HTMLElement).className === "string"
      ? (el as HTMLElement).className
          .split(/\s+/)
          .filter((c) => c && c !== "data-lov-hover")
          .slice(0, 2)
          .join(".")
      : "";
  return cls ? `${tag}.${cls}` : tag;
}
