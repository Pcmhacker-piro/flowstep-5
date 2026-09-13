import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { DesignSkeleton } from "./DesignSkeleton";
import { labelFor, pathOf } from "@/lib/htmlSplice";

export type PartSelection = {
  designId: string;
  editId: string;
  preSnippet: string; // element.outerHTML BEFORE data-edit-id was added
  snippet: string;    // element.outerHTML AFTER data-edit-id was added
  label: string;
  path: number[];     // child-index path from <body> — exact address in the stored HTML
};

type Props = {
  id: string;
  html: string;
  isPartial: boolean;
  width: number;
  height: number;
  selectMode: boolean;
  highlightEditIds?: string[];
  focusRequest?: { editId: string; nonce: number } | null;
  onPickPart?: (sel: PartSelection) => void;
  onUnpickPart?: (designId: string, editId: string) => void;
  /** Reports the full document height (in 1440px-wide design units) so the
   *  canvas card can grow and show the whole page instead of the top fold. */
  onContentHeight?: (designId: string, innerHeight: number) => void;
};

const INNER_W = 1440;
const INNER_H = 960;

// Tags that almost always represent a meaningful design section on their own.
const SEMANTIC_TAGS = new Set([
  "HEADER", "NAV", "ASIDE", "MAIN", "FOOTER", "FORM",
  "TABLE", "THEAD", "TBODY", "TR", "FIGURE", "DIALOG", "ARTICLE",
]);

// "Looks like a card / KPI tile / chart wrapper" — rounded + a frame cue.
function isCardLike(el: Element): boolean {
  const cls =
    typeof (el as HTMLElement).className === "string"
      ? (el as HTMLElement).className
      : "";
  if (!cls) return false;
  const rounded = /\brounded-(?:lg|xl|2xl|3xl)\b/.test(cls);
  const framed =
    /\b(?:border|shadow(?:-[a-z0-9]+)?|ring-\d)\b/.test(cls) ||
    /\bbg-(?:white|zinc|neutral|slate|gray|stone)-?\d*\b/.test(cls);
  return rounded && framed;
}

function isNoisyWrapper(el: Element): boolean {
  // Bare layout wrappers we never want to pick as the "target".
  if (el === el.ownerDocument?.body || el === el.ownerDocument?.documentElement) return true;
  const tag = el.tagName;
  return tag === "HTML" || tag === "BODY";
}

// Promote the raw hit-tested element to the closest meaningful container.
// Returns the element unchanged when nothing better is nearby.
function resolveTarget(el: Element): Element {
  let node: Element | null = el;
  let hops = 0;
  while (node && !isNoisyWrapper(node) && hops < 10) {
    if (
      SEMANTIC_TAGS.has(node.tagName) ||
      node.hasAttribute("role") ||
      node.hasAttribute("data-card") ||
      node.hasAttribute("data-section") ||
      isCardLike(node)
    ) {
      return node;
    }
    node = node.parentElement;
    hops++;
  }
  return el;
}

export function DesignFrame({
  id,
  html,
  isPartial,
  width,
  height,
  selectMode,
  highlightEditIds,
  focusRequest,
  onPickPart,
  onUnpickPart,
  onContentHeight,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The card keeps the design's 1440px-wide viewport and grows vertically with
  // the page, so a tall generated site is shown in full rather than cropped to
  // the first fold.
  const [innerH, setInnerH] = useState(Math.max(INNER_H, Math.round((height / Math.max(width, 1)) * INNER_W)));
  const scale = width / INNER_W;

  // The iframe document is written incrementally (document.write) instead of
  // being re-created through srcDoc on every streamed chunk — a fresh srcDoc
  // reloads the document and makes the preview flicker/blink while designing.
  const writtenRef = useRef({ len: 0, closed: false, key: "", written: "" });
  // Bumps once the document is fully written + closed, so the interaction
  // effects below can attach without listening for a `load` event.
  const [docReady, setDocReady] = useState(0);
  const safeHtml = html;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const state = writtenRef.current;
    const restart =
      state.key !== id ||
      state.closed ||
      state.len > html.length ||
      html.slice(0, state.len) !== state.written;

    try {
      if (restart) {
        doc.open();
        doc.write(html);
        state.key = id;
        state.len = html.length;
        state.written = html;
        state.closed = false;
      } else if (html.length > state.len) {
        doc.write(html.slice(state.len));
        state.len = html.length;
        state.written = html;
      }

      if (!isPartial && !state.closed) {
        doc.close();
        state.closed = true;
        setDocReady((v) => v + 1);
      }
    } catch {
      /* iframe torn down mid-write */
    }
  }, [html, isPartial, id]);

  // Measure the real page height and grow the frame to fit it.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let raf = 0;
    let last = 0;

    const measure = () => {
      const doc = iframe.contentDocument;
      const body = doc?.body;
      if (!doc || !body) return;
      const measured = Math.max(
        body.scrollHeight,
        doc.documentElement?.scrollHeight ?? 0,
        body.getBoundingClientRect().height,
      );
      const next = Math.min(24000, Math.max(INNER_H, Math.round(measured)));
      if (Math.abs(next - last) < 4) return;
      last = next;
      setInnerH(next);
      onContentHeight?.(id, next);
    };

    measure();

    let observer: ResizeObserver | null = null;
    const win = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (win && "ResizeObserver" in win && iframe.contentDocument?.body) {
      observer = new win.ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(measure);
      });
      observer.observe(iframe.contentDocument.body);
    }

    // While streaming, the document keeps growing between writes.
    const poll = isPartial ? window.setInterval(measure, 400) : 0;
    const settle = window.setTimeout(measure, 600);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      if (poll) window.clearInterval(poll);
      window.clearTimeout(settle);
    };
  }, [html, isPartial, docReady, id, onContentHeight]);




  // Click-to-toggle-select overlay while select-mode is on.
  useEffect(() => {
    if (!selectMode || isPartial) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanup: (() => void) | null = null;

    const setup = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;

      const style = doc.createElement("style");
      style.setAttribute("data-lov-edit", "");
      style.textContent = `
        [data-edit-id]{outline:2px solid #2b6bff!important;outline-offset:-2px!important;background:rgba(43,107,255,0.06)!important;}
        [data-lov-hover]:not([data-edit-id]){outline:2px dashed #2b6bff!important;outline-offset:-2px!important;cursor:crosshair!important;background:rgba(43,107,255,0.04)!important;}
        [data-lov-hover][data-edit-id]{outline:2px solid #dc2626!important;background:rgba(220,38,38,0.08)!important;cursor:not-allowed!important;}
        html,body{cursor:crosshair!important;}
      `;
      doc.head.appendChild(style);

      let hover: Element | null = null;
      const setHover = (el: Element | null) => {
        if (hover && hover !== el) hover.removeAttribute("data-lov-hover");
        hover = el;
        if (hover) hover.setAttribute("data-lov-hover", "");
      };

      const isPickable = (el: Element | null) =>
        !!el && el !== doc.documentElement && el !== doc.body && el.tagName !== "HTML";

      const pickFor = (el: Element, e: MouseEvent): Element => {
        // Default: the exact element under the cursor, so ANY element can be
        // targeted — a heading, a single label, a button, an icon path.
        // Alt/Option held → widen to the nearest meaningful container/section.
        if (!e.altKey) return el;
        const resolved = resolveTarget(el);
        return isPickable(resolved) ? resolved : el;
      };

      const onMove = (e: MouseEvent) => {
        const raw = doc.elementFromPoint(e.clientX, e.clientY);
        if (!isPickable(raw)) return;
        setHover(pickFor(raw!, e));
      };

      const onLeave = () => setHover(null);

      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const raw =
          (hover as Element | null) ??
          doc.elementFromPoint(e.clientX, e.clientY);
        if (!isPickable(raw)) return;
        const el = pickFor(raw!, e) as HTMLElement;

        const existing = el!.getAttribute("data-edit-id");
        if (existing) {
          // Toggle OFF
          el!.removeAttribute("data-edit-id");
          el!.removeAttribute("data-lov-hover");
          hover = null;
          onUnpickPart?.(id, existing);
          return;
        }

        // Toggle ON — record the element's exact structural address so the edit
        // can be spliced back into the stored HTML even for deeply nested or
        // repeated elements.
        const path = pathOf(el!, doc.body);
        if (!path || path.length === 0) return;

        const preSnippet = el!.outerHTML;
        const editId = "e_" + Math.random().toString(36).slice(2, 8);
        el!.setAttribute("data-edit-id", editId);
        const snippet = el!.outerHTML;
        const label = labelFor(el!);

        onPickPart?.({ designId: id, editId, preSnippet, snippet, label, path });
      };

      doc.addEventListener("mousemove", onMove, true);
      doc.addEventListener("mouseleave", onLeave, true);
      doc.addEventListener("click", onClick, true);

      cleanup = () => {
        try {
          doc.removeEventListener("mousemove", onMove, true);
          doc.removeEventListener("mouseleave", onLeave, true);
          doc.removeEventListener("click", onClick, true);
          if (hover) hover.removeAttribute("data-lov-hover");
          style.remove();
        } catch {
          /* iframe torn down */
        }
      };
    };

    setup();

    return () => {
      cleanup?.();
    };
  }, [selectMode, isPartial, docReady, id, onPickPart, onUnpickPart]);

  // Forward wheel gestures that land inside the iframe up to the canvas, so
  // zooming/panning keeps working while the cursor is over a generated design.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = iframe.getBoundingClientRect();
      const sx = iframe.clientWidth ? rect.width / iframe.clientWidth : 1;
      const sy = iframe.clientHeight ? rect.height / iframe.clientHeight : 1;
      window.dispatchEvent(
        new CustomEvent("flowstep:wheel", {
          detail: {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaMode: e.deltaMode,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            clientX: rect.left + e.clientX * sx,
            clientY: rect.top + e.clientY * sy,
          },
        }),
      );
    };
    doc.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      try {
        doc.removeEventListener("wheel", onWheel);
      } catch {
        /* iframe torn down */
      }
    };
  }, [docReady]);

  // Reconcile the live doc's data-edit-id tags with the parent-owned selection list.
  // If parent removed an id (e.g. via inspector's remove button), strip it from the DOM.
  useEffect(() => {
    if (isPartial) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const sync = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const wanted = new Set(highlightEditIds ?? []);
      doc.querySelectorAll("[data-edit-id]").forEach((el) => {
        const eid = el.getAttribute("data-edit-id");
        if (eid && !wanted.has(eid)) el.removeAttribute("data-edit-id");
      });
    };
    sync();
  }, [highlightEditIds, docReady, isPartial]);

  // Scroll+pulse when the parent requests focus on a specific edit id.
  useEffect(() => {
    if (!focusRequest || isPartial) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    const escaped = focusRequest.editId.replace(/["\\]/g, "\\$&");
    const el = doc.querySelector<HTMLElement>(`[data-edit-id="${escaped}"]`);
    if (!el) return;

    // Respect the user's reduced-motion preference from either the parent
    // page or the iframe document — skip the pulse and use instant scroll.
    const prefersReducedMotion =
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ||
      iframe.contentWindow?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      false;

    // Inject one-off keyframes for the pulse (idempotent). The keyframe block
    // is wrapped in a media query so reduced-motion users never see it, even
    // if a stale attribute lingers on the element.
    if (!doc.getElementById("lov-focus-anim")) {
      const style = doc.createElement("style");
      style.id = "lov-focus-anim";
      style.textContent = `
        @media (prefers-reduced-motion: no-preference) {
          @keyframes lov-focus-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(43,107,255,0.55); }
            60%  { box-shadow: 0 0 0 14px rgba(43,107,255,0); }
            100% { box-shadow: 0 0 0 0 rgba(43,107,255,0); }
          }
          [data-lov-focus] {
            animation: lov-focus-pulse 900ms ease-out 2;
            border-radius: inherit;
          }
        }
      `;
      doc.head.appendChild(style);
    }

    // Center the element in the iframe viewport while respecting body padding
    // and any fixed/sticky bars pinned to the top or bottom of the page.
    const scrollBehavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";
    try {
      const win = iframe.contentWindow;
      if (!win) throw new Error("no window");
      const vh = win.innerHeight;
      const vw = win.innerWidth;

      let topInset = 0;
      let bottomInset = 0;
      doc.querySelectorAll<HTMLElement>("body *").forEach((node) => {
        if (node === el || node.contains(el)) return;
        const cs = win.getComputedStyle(node);
        if (cs.position !== "fixed" && cs.position !== "sticky") return;
        if (cs.visibility === "hidden" || cs.display === "none") return;
        const r = node.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) return;
        if (r.top <= 8 && r.bottom < vh * 0.5) {
          topInset = Math.max(topInset, r.bottom);
        } else if (r.bottom >= vh - 8 && r.top > vh * 0.5) {
          bottomInset = Math.max(bottomInset, vh - r.top);
        }
      });

      const bodyCs = win.getComputedStyle(doc.body);
      const padTop = parseFloat(bodyCs.paddingTop) || 0;
      const padBottom = parseFloat(bodyCs.paddingBottom) || 0;
      const padLeft = parseFloat(bodyCs.paddingLeft) || 0;
      const padRight = parseFloat(bodyCs.paddingRight) || 0;

      const rect = el.getBoundingClientRect();
      const absTop = rect.top + win.scrollY;
      const absLeft = rect.left + win.scrollX;

      const availH = Math.max(1, vh - topInset - bottomInset);
      const availW = Math.max(1, vw - padLeft - padRight);

      const targetTop = absTop + rect.height / 2 - topInset - availH / 2;
      const targetLeft = absLeft + rect.width / 2 - padLeft - availW / 2;

      const maxTop = Math.max(0, doc.documentElement.scrollHeight - vh);
      const maxLeft = Math.max(0, doc.documentElement.scrollWidth - vw);

      win.scrollTo({
        top: Math.min(maxTop, Math.max(0, targetTop - padTop / 2 + padBottom / 2)),
        left: Math.min(maxLeft, Math.max(0, targetLeft)),
        behavior: scrollBehavior,
      });
    } catch {
      el.scrollIntoView({ block: "center", inline: "center" });
    }
    // Skip the pulse entirely for reduced-motion users.
    if (prefersReducedMotion) return;
    el.setAttribute("data-lov-focus", "");
    const t = window.setTimeout(() => {
      el.removeAttribute("data-lov-focus");
    }, 1900);
    return () => window.clearTimeout(t);
  }, [focusRequest, isPartial]);

  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white">
      <div
        style={{
          width: INNER_W,
          height: innerH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="absolute left-0 top-0"
      >
        <DesignSkeleton />
      </div>
      <iframe
        ref={iframeRef}
        title={id}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: INNER_W,
          height: innerH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          opacity: isPartial && safeHtml.length < 2500 ? 0 : 1,
          transition: "opacity 350ms ease",
          pointerEvents: selectMode && !isPartial ? "auto" : "none",
        }}
        className="relative border-0 bg-transparent"
      />
      {isPartial && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Designing…
        </div>
      )}
    </div>
  );
}
