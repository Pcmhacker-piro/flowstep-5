import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import type { PartSelection } from "./DesignFrame";
import { findInvalid, suggest, tokenize } from "@/lib/tailwind-validate";

type Props = {
  targets: PartSelection[];
  onClose: () => void;
  onRemove: (editId: string) => void;
  onApply: (nextSnippet: string) => void;
  onAiEdit: () => void;
  onFocus?: (target: PartSelection) => void;
};

function parseRoot(snippet: string): HTMLElement | null {
  try {
    const doc = new DOMParser().parseFromString(snippet, "text/html");
    return (doc.body.firstElementChild as HTMLElement | null) ?? null;
  } catch {
    return null;
  }
}

function directText(el: HTMLElement): string {
  let s = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent ?? "";
  });
  return s;
}

function hasElementChildren(el: HTMLElement): boolean {
  return el.children.length > 0;
}

export function Inspector({ targets, onClose, onRemove, onApply, onAiEdit, onFocus }: Props) {
  const isSingle = targets.length === 1;
  const target = isSingle ? targets[0] : null;

  const root = useMemo(() => (target ? parseRoot(target.snippet) : null), [target]);
  const initialTag = root?.tagName.toLowerCase() ?? "div";
  const initialClasses = root?.getAttribute("class") ?? "";
  const initialText = root ? directText(root) : "";
  const textOnly = root ? !hasElementChildren(root) : false;

  const [classes, setClasses] = useState(initialClasses);
  const [text, setText] = useState(initialText);
  const [dirty, setDirty] = useState(false);
  const [caret, setCaret] = useState(0);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClasses(initialClasses);
    setText(initialText);
    setDirty(false);
    setShowSuggest(false);
  }, [target?.editId, initialClasses, initialText]);

  const invalidTokens = useMemo(() => findInvalid(classes), [classes]);
  const hasInvalid = invalidTokens.length > 0;

  // Current word at the caret drives the suggestion list.
  const currentWord = useMemo(() => {
    const before = classes.slice(0, caret);
    const match = before.match(/\S+$/);
    return match ? match[0] : "";
  }, [classes, caret]);

  const suggestions = useMemo(
    () => (currentWord ? suggest(currentWord, 8) : []),
    [currentWord],
  );

  // Reset the highlighted suggestion whenever the list changes.
  useEffect(() => {
    setActiveSuggest(0);
  }, [suggestions]);

  // Keep the highlighted suggestion scrolled into view.
  useEffect(() => {
    if (!showSuggest) return;
    const list = suggestListRef.current;
    if (!list) return;
    const item = list.querySelectorAll<HTMLButtonElement>("button")[activeSuggest];
    item?.scrollIntoView({ block: "nearest" });
  }, [activeSuggest, showSuggest, suggestions]);

  const attrs = useMemo(() => {
    if (!root) return [] as { name: string; value: string }[];
    return Array.from(root.attributes)
      .filter((a) => a.name !== "class" && a.name !== "data-edit-id")
      .map((a) => ({ name: a.name, value: a.value }));
  }, [root]);

  const applySuggestion = (choice: string) => {
    const before = classes.slice(0, caret);
    const after = classes.slice(caret);
    const start = before.length - currentWord.length;
    const next = classes.slice(0, start) + choice + after;
    setClasses(next);
    setDirty(true);
    // Restore focus + caret after the inserted token.
    const newCaret = start + choice.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newCaret, newCaret);
        setCaret(newCaret);
      }
    });
  };

  const removeInvalid = () => {
    const cleaned = tokenize(classes)
      .filter((t) => !invalidTokens.includes(t))
      .join(" ");
    setClasses(cleaned);
    setDirty(true);
  };

  const autoFixInvalid = () => {
    const fixed = tokenize(classes)
      .map((t) => {
        if (!invalidTokens.includes(t)) return t;
        const top = suggest(t, 1)[0];
        return top ?? null;
      })
      .filter((t): t is string => t !== null)
      .join(" ");
    setClasses(fixed);
    setDirty(true);
  };

  const apply = () => {
    if (!root) return;
    root.setAttribute("class", classes);
    if (textOnly) {
      root.textContent = text;
    }
    onApply(root.outerHTML);
    setDirty(false);
  };


  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-black/5 bg-white">
      <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
        <span className="text-sm font-semibold text-[#0b1220]">Inspector</span>
        <span className="rounded-full bg-[#2b6bff]/10 px-2 py-0.5 text-[11px] font-semibold text-[#2b6bff]">
          {targets.length} selected
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-full p-1 text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#0b1220]/50">
            Selection
          </div>
          <div
            className="mt-1 space-y-1"
            role="listbox"
            aria-label="Selected sections"
          >
            {targets.map((t, idx) => (
              <div
                key={t.editId}
                className="group flex items-center gap-2 rounded-md border border-black/5 bg-black/[0.02] px-2 py-1.5 hover:border-[#2b6bff]/30 hover:bg-[#2b6bff]/5 focus-within:border-[#2b6bff]/50 focus-within:bg-[#2b6bff]/10"
              >
                <button
                  type="button"
                  onClick={() => onFocus?.(t)}
                  onFocus={() => onFocus?.(t)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                    e.preventDefault();
                    const dir = e.key === "ArrowDown" ? 1 : -1;
                    const next = (idx + dir + targets.length) % targets.length;
                    const list = e.currentTarget.closest('[role="listbox"]');
                    const btn = list?.querySelectorAll<HTMLButtonElement>(
                      'button[data-selection-item="true"]',
                    )[next];
                    btn?.focus();
                  }}
                  data-selection-item="true"
                  title="Scroll to and highlight in the design (↑/↓ to move)"
                  className="flex flex-1 items-center gap-2 truncate rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-[#2b6bff]/40"
                >
                  <span className="rounded bg-[#0b1220] px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {t.label.split(".")[0]}
                  </span>
                  <span className="truncate font-mono text-[11px] text-[#0b1220]/70 group-hover:text-[#0b1220]">
                    {t.label}
                  </span>
                </button>
                <button
                  onClick={() => onRemove(t.editId)}
                  className="ml-auto rounded-full p-0.5 text-[#0b1220]/50 hover:bg-black/10 hover:text-[#0b1220]"
                  aria-label={`Remove ${t.label} from selection`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {isSingle && (
          <>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#0b1220]/50">
                Element
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-md bg-[#0b1220] px-2 py-0.5 font-mono text-xs text-white">
                  &lt;{initialTag}&gt;
                </span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#0b1220]/50">
                Classes
                {hasInvalid && (
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 normal-case tracking-normal">
                    <AlertTriangle className="h-3 w-3" />
                    {invalidTokens.length} invalid
                  </span>
                )}
              </label>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={classes}
                  onChange={(e) => {
                    setClasses(e.target.value);
                    setDirty(true);
                    setCaret(e.target.selectionStart);
                    setShowSuggest(true);
                  }}
                  onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
                  onClick={(e) => setCaret(e.currentTarget.selectionStart)}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                  onKeyDown={(e) => {
                    const listOpen = showSuggest && suggestions.length > 0;
                    if (!listOpen) {
                      if (e.key === "Escape") setShowSuggest(false);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveSuggest((i) => (i + 1) % suggestions.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveSuggest(
                        (i) => (i - 1 + suggestions.length) % suggestions.length,
                      );
                    } else if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      const pick = suggestions[activeSuggest] ?? suggestions[0];
                      applySuggestion(pick + " ");
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowSuggest(false);
                    }
                  }}
                  rows={4}
                  spellCheck={false}
                  className={`mt-1 w-full resize-y rounded-lg border bg-white px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-[#0b1220] outline-none ${
                    hasInvalid
                      ? "border-red-300 focus:border-red-500"
                      : "border-black/10 focus:border-[#2b6bff]"
                  }`}
                  placeholder="tailwind classes…"
                />
                {showSuggest && suggestions.length > 0 && (
                  <div
                    ref={suggestListRef}
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-black/10 bg-white p-1 shadow-lg"
                  >
                    {suggestions.map((s, i) => {
                      const isActive = i === activeSuggest;
                      return (
                        <button
                          key={s}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveSuggest(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applySuggestion(s + " ");
                          }}
                          className={`flex w-full items-center justify-between rounded px-2 py-1 text-left font-mono text-[11px] ${
                            isActive
                              ? "bg-[#2b6bff]/10 text-[#0b1220]"
                              : "text-[#0b1220] hover:bg-[#2b6bff]/5"
                          }`}
                        >
                          <span>{s}</span>
                          {isActive && (
                            <span className="ml-2 rounded bg-black/5 px-1 text-[9px] text-[#0b1220]/60">
                              Enter
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {hasInvalid && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {invalidTokens.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-600"
                    >
                      {t}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={autoFixInvalid}
                    className="ml-1 rounded bg-[#2b6bff]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2b6bff] hover:bg-[#2b6bff]/20"
                    title="Replace each invalid token with its top suggestion"
                  >
                    Auto-fix
                  </button>
                  <button
                    type="button"
                    onClick={removeInvalid}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
                  >
                    Remove all
                  </button>
                </div>
              )}
            </div>


            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-[#0b1220]/50">
                Text
              </label>
              {textOnly ? (
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setDirty(true);
                  }}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-[#0b1220] outline-none focus:border-[#2b6bff]"
                  placeholder="Element text…"
                />
              ) : (
                <div className="mt-1 rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-2.5 py-2 text-xs text-[#0b1220]/50">
                  Contains child elements — edit via the AI prompt or select a smaller
                  section.
                </div>
              )}
            </div>

            {attrs.length > 0 && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-[#0b1220]/50">
                  Attributes
                </div>
                <div className="mt-1 space-y-1">
                  {attrs.map((a) => (
                    <div
                      key={a.name}
                      className="flex items-baseline gap-2 rounded-md bg-black/[0.03] px-2 py-1 font-mono text-[11px]"
                    >
                      <span className="text-[#0b1220]/60">{a.name}</span>
                      <span className="truncate text-[#0b1220]">{a.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!isSingle && (
          <div className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-3 text-xs text-[#0b1220]/60">
            Multiple sections selected. Direct class/text editing is only available for a
            single section. Use the AI prompt to apply one change across all selected
            sections.
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-black/5 p-3">
        {isSingle && (
          <>
            {hasInvalid && (
              <p className="text-[11px] leading-snug text-amber-600">
                {invalidTokens.length} class{invalidTokens.length > 1 ? "es" : ""} look
                unfamiliar — you can still apply them.
              </p>
            )}
            <button
              onClick={apply}
              disabled={!dirty || !root}
              title={!dirty ? "Change classes or text first" : undefined}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0b1220] px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-[#0b1220]/10 disabled:text-[#0b1220]/40"
            >
              <Check className="h-4 w-4" /> Apply changes
            </button>
          </>
        )}
        <button
          onClick={onAiEdit}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-medium text-[#0b1220] hover:bg-black/5"
        >
          {isSingle ? "Edit with AI prompt" : `Prompt across ${targets.length} sections`}
        </button>
      </div>

    </aside>
  );
}
