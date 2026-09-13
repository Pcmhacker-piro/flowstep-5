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

  const fragmentDoc = docFromHtml(`<body>${newSnippet}</body>`);
  const replacement = fragmentDoc.body?.firstElementChild;
  if (!replacement) return null;

  el.parentNode.replaceChild(doc.importNode(replacement, true), el);
  return serialize(doc, html);
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
