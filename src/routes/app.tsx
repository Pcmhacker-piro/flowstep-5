import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import logoAsset from "@/assets/logo.png";
import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { DESIGN_MODELS, DEFAULT_DESIGN_MODEL, type DesignModelId } from "@/lib/designModels";
import { flushSync } from "react-dom";
import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MousePointer2,
  Hand,
  Type as TypeIcon,
  Square as SquareIcon,
  Shapes,
  Loader2,

  Sparkles,
  Trash2,
  Plus,
  Minus,
  Pencil,
  Eraser,
  Square,
  MousePointerClick,
  Mic,
  ArrowUp,
  X,
  Undo2,
  Redo2,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
} from "lucide-react";

import { DesignFrame, type PartSelection } from "@/components/DesignFrame";
import {
  firstElementOf,
  pathOfEditId,
  readSnippetAtPath,
  resolveElementPath,
  spliceAtPath,
} from "@/lib/htmlSplice";
import { Inspector } from "@/components/Inspector";
import { exportDesignZip, exportDesignImage } from "@/lib/exportDesign";





export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "AI Design Canvas — Flowstep" },
      { name: "description", content: "Create polished, coordinated product screens on an intelligent design canvas." },
      { property: "og:title", content: "AI Design Canvas — Flowstep" },
      { property: "og:description", content: "Create polished, coordinated product screens on an intelligent design canvas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppHome,
});

type Tool = "select" | "hand" | "text" | "rect" | "shapes" | "pen" | "eraser";

type Point = { x: number; y: number };

type CanvasItem =
  | { id: string; type: "design"; x: number; y: number; w: number; h: number; html: string; prompt: string; isFinal?: boolean; screenName?: string }
  | { id: string; type: "text"; x: number; y: number; w: number; h: number; text: string }
  | { id: string; type: "rect"; x: number; y: number; w: number; h: number }
  | { id: string; type: "image"; x: number; y: number; w: number; h: number; src: string; name: string }
  | { id: string; type: "stroke"; points: Point[]; color: string; size: number };

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; imageUrl?: string };

const uid = () => Math.random().toString(36).slice(2, 10);

function AppHome() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [level, setLevel] = useState<"v1" | "v2" | "polished" | "industry">("industry");
  const [model, setModel] = useState<DesignModelId>(DEFAULT_DESIGN_MODEL);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: uid(), role: "assistant", text: "Describe any UI or design and I'll generate it on your canvas." },
  ]);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);

  const [exporting, setExporting] = useState<"zip" | "image" | false>(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close the export menu when clicking outside of it.
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [exportMenuOpen]);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      setIsNarrow(mq.matches);
      if (mq.matches) setSidebarOpen(false);
      setSidebarWidth((w) => Math.min(w, Math.max(240, window.innerWidth - 220)));
    };
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  const [designName, setDesignName] = useState("Untitled design");
  const resizeState = useRef<{ startX: number; startW: number } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Rotate art directions rather than trusting model randomness. Starting at a
  // random offset keeps a fresh session surprising; incrementing guarantees
  // consecutive runs do not reuse the same direction.
  const variationSequenceRef = useRef(Math.floor(Math.random() * 12));

  // Multi-select part-edit mode.
  const [selectMode, setSelectMode] = useState(false);
  const [editTargets, setEditTargets] = useState<PartSelection[]>([]);

  // Uploaded reference images attached to the next prompt.
  const [refImages, setRefImages] = useState<{ id: string; name: string; src: string }[]>([]);

  // Undo/redo history — snapshot-based so add, move, delete, upload, and
  // html edits all undo through the same mechanism.
  type HistoryEntry = { label: string; prevItems: CanvasItem[]; nextItems: CanvasItem[] };
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const HISTORY_LIMIT = 100;

  // Live ref of items — used to capture snapshots at the exact moment an
  // interaction starts (e.g. a drag) so undo restores that pre-state.
  const itemsRef = useRef<CanvasItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const pushHistoryEntry = useCallback(
    (label: string, prevItems: CanvasItem[], nextItems: CanvasItem[]) => {
      if (prevItems === nextItems) return;
      setUndoStack((s) => [...s.slice(-(HISTORY_LIMIT - 1)), { label, prevItems, nextItems }]);
      setRedoStack([]);
    },
    [],
  );

  // Preferred mutation helper: records a history entry automatically.
  const mutateItems = useCallback(
    (label: string, updater: (prev: CanvasItem[]) => CanvasItem[]) => {
      setItems((prev) => {
        const next = updater(prev);
        if (next !== prev) {
          setUndoStack((s) => [
            ...s.slice(-(HISTORY_LIMIT - 1)),
            { label, prevItems: prev, nextItems: next },
          ]);
          setRedoStack([]);
        }
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const entry = s[s.length - 1];
      setItems(entry.prevItems);
      setRedoStack((r) => [...r, entry]);
      setEditTargets([]);
      setSelectedId(null);
      return s.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const entry = r[r.length - 1];
      setItems(entry.nextItems);
      setUndoStack((s) => [...s, entry]);
      setEditTargets([]);
      setSelectedId(null);
      return r.slice(0, -1);
    });
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;


  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  const onPickPart = useCallback((sel: PartSelection) => {
    // Read the element's snippet straight out of the stored HTML at its
    // structural path, so the editor model sees the real source markup
    // (not the browser's re-serialized version of it).
    let enriched = sel;
    const design = itemsRef.current.find(
      (i) => i.id === sel.designId && i.type === "design",
    );
    if (design && design.type === "design") {
      // The click path comes from the live iframe DOM; re-verify it against the
      // stored HTML so the edit can never land on a neighbouring element.
      const truePath = resolveElementPath(design.html, sel.path, sel.preSnippet);
      if (truePath) {
        const source = readSnippetAtPath(design.html, truePath, sel.editId);
        if (source) enriched = { ...sel, path: truePath, snippet: source, preSnippet: source };
      }
    }
    setEditTargets((prev) =>
      prev.some((t) => t.editId === enriched.editId) ? prev : [...prev, enriched],
    );
  }, []);

  const onUnpickPart = useCallback((_designId: string, editId: string) => {
    setEditTargets((prev) => prev.filter((t) => t.editId !== editId));
  }, []);

  // Grow a design card so the full generated page is visible, not just the fold.
  const onContentHeight = useCallback((designId: string, innerHeight: number) => {
    setItems((it) =>
      it.map((i) => {
        if (i.id !== designId || i.type !== "design") return i;
        const nextH = Math.round((i.w / 1440) * innerHeight);
        return Math.abs(nextH - i.h) < 4 ? i : { ...i, h: nextH };
      }),
    );
  }, []);

  const removeEditTarget = (editId: string) =>
    setEditTargets((prev) => prev.filter((t) => t.editId !== editId));

  const clearEditTargets = () => setEditTargets([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const focusPrompt = () => promptRef.current?.focus();

  // Focus request: when Inspector clicks an item, scroll+pulse that element inside its iframe.
  const [focusRequest, setFocusRequest] = useState<{
    designId: string;
    editId: string;
    nonce: number;
  } | null>(null);
  const focusPart = useCallback((sel: PartSelection) => {
    setFocusRequest({ designId: sel.designId, editId: sel.editId, nonce: Date.now() });
  }, []);


  // Splice a new snippet (from the inspector's direct edits) into the design's html.
  // Only used when exactly one target is selected.
  const applyInspectorSnippet = useCallback(
    (nextSnippet: string) => {
      setEditTargets((prev) => {
        if (prev.length !== 1) return prev;
        const target = prev[0];
        mutateItems(`Edit ${target.label}`, (it) =>
          it.map((i) => {
            if (i.id !== target.designId || i.type !== "design") return i;
            const path = resolveElementPath(i.html, target.path, target.snippet);
            if (!path) return i;
            const nextHtml = spliceAtPath(i.html, path, nextSnippet);
            if (!nextHtml) return i;
            return { ...i, html: nextHtml };
          }),
        );
        return [{ ...target, snippet: nextSnippet }];
      });
    },
    [mutateItems],
  );




  const onResizeDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    resizeState.current = { startX: e.clientX, startW: sidebarWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent) => {
    if (!resizeState.current) return;
    const next = resizeState.current.startW + (e.clientX - resizeState.current.startX);
    const maxW = Math.max(240, Math.min(600, window.innerWidth - 220));
    setSidebarWidth(Math.min(maxW, Math.max(240, next)));
  };
  const onResizeUp = (e: ReactPointerEvent) => {
    resizeState.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    viewRef.current = { zoom, pan };
  }, [zoom, pan]);

  const applyView = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    viewRef.current = { zoom: nextZoom, pan: nextPan };
    setZoom(nextZoom);
    setPan(nextPan);
  }, []);

  const zoomAtCenter = useCallback((mult: number) => {
    const el = canvasRef.current;
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    const current = viewRef.current;
    const next = Math.min(3, Math.max(0.15, current.zoom * mult));
    const k = next / current.zoom;
    applyView(next, {
      x: cx - (cx - current.pan.x) * k,
      y: cy - (cy - current.pan.y) * k,
    });
  }, [applyView]);

  const fitCanvas = useCallback(() => {
    const el = canvasRef.current;
    const currentItems = itemsRef.current;
    if (!el || currentItems.length === 0) {
      applyView(1, { x: 0, y: 0 });
      return;
    }
    const bounds = currentItems.reduce(
      (acc, item) => {
        if (item.type === "stroke") {
          for (const point of item.points) {
            acc.minX = Math.min(acc.minX, point.x);
            acc.minY = Math.min(acc.minY, point.y);
            acc.maxX = Math.max(acc.maxX, point.x);
            acc.maxY = Math.max(acc.maxY, point.y);
          }
        } else {
          acc.minX = Math.min(acc.minX, item.x);
          acc.minY = Math.min(acc.minY, item.y);
          acc.maxX = Math.max(acc.maxX, item.x + item.w);
          acc.maxY = Math.max(acc.maxY, item.y + item.h);
        }
        return acc;
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    if (!Number.isFinite(bounds.minX)) return;
    const margin = 72;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const next = Math.min(1.5, Math.max(0.15, Math.min((el.clientWidth - margin * 2) / width, (el.clientHeight - margin * 2) / height)));
    applyView(next, {
      x: (el.clientWidth - width * next) / 2 - bounds.minX * next,
      y: (el.clientHeight - height * next) / 2 - bounds.minY * next,
    });
  }, [applyView]);

  const addImageToCanvas = useCallback((src: string, name: string) => {
    const el = canvasRef.current;
    const rect = el?.getBoundingClientRect();
    const vw = rect?.width ?? 800;
    const vh = rect?.height ?? 600;
    const img = new Image();
    img.onload = () => {
      const maxW = 480;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const cx = (-pan.x + vw / 2) / zoom - w / 2;
      const cy = (-pan.y + vh / 2) / zoom - h / 2;
      const id = uid();
      mutateItems(`Add image ${name}`, (it) => [...it, { id, type: "image", x: cx, y: cy, w, h, src, name }]);
      setSelectedId(id);
    };
    img.src = src;
  }, [pan.x, pan.y, zoom, mutateItems]);

  // Shrink an uploaded photo to something the model can accept quickly.
  const toReferenceDataUrl = useCallback(async (src: string) => {
    return await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }, []);

  const onPickFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} isn't an image file.`);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 20MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => toast.error(`Couldn't read ${file.name}.`);
      reader.onload = async () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) {
          toast.error(`Couldn't read ${file.name}.`);
          return;
        }
        addImageToCanvas(src, file.name);
        const reference = await toReferenceDataUrl(src);
        setRefImages((prev) =>
          prev.length >= 4 ? prev : [...prev, { id: uid(), name: file.name, src: reference }],
        );
        toast.success(`${file.name} attached as a reference`);
      };
      reader.readAsDataURL(file);
    });
  }, [addImageToCanvas, toReferenceDataUrl]);


  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Panning state
  const panState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  // Drag state for items
  const dragState = useRef<{ id: string; startX: number; startY: number; itemX: number; itemY: number } | null>(null);

  const strokeState = useRef<{ id: string } | null>(null);
  // Snapshot captured at the start of a drag/pen/eraser gesture. Pushed as
  // one undo entry on pointer-up so the whole gesture undoes in a single step.
  const gestureStartRef = useRef<{ label: string; prevItems: CanvasItem[] } | null>(null);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  const eraseAt = (clientX: number, clientY: number) => {
    const { x, y } = toCanvasCoords(clientX, clientY);
    const hitR = 12 / zoom;
    setItems((it) =>
      it.filter((i) => {
        if (i.type === "stroke") {
          return !i.points.some((p) => Math.hypot(p.x - x, p.y - y) < hitR + i.size);
        }
        return !(x >= i.x && x <= i.x + i.w && y >= i.y && y <= i.y + i.h);
      }),
    );
  };

  const onCanvasPointerDown = (e: ReactPointerEvent) => {
    if (tool === "hand" || spaceHeld || e.button === 1 || (e.button === 0 && e.altKey)) {
      panState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === "select") {
      setSelectedId(null);
    } else if (tool === "pen") {
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      const id = uid();
      strokeState.current = { id };
      gestureStartRef.current = { label: "Draw stroke", prevItems: itemsRef.current };
      setItems((it) => [...it, { id, type: "stroke", points: [{ x, y }], color: "#0b1220", size: 2.5 }]);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === "eraser") {
      strokeState.current = { id: "__erase__" };
      gestureStartRef.current = { label: "Erase", prevItems: itemsRef.current };
      eraseAt(e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === "rect" || tool === "shapes") {
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      mutateItems("Add rectangle", (it) => [...it, { id: uid(), type: "rect", x, y, w: 200, h: 140 }]);
      setTool("select");

    } else if (tool === "text") {
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      const text = window.prompt("Enter text") ?? "";
      if (text) mutateItems("Add text", (it) => [...it, { id: uid(), type: "text", x, y, w: 240, h: 40, text }]);
      setTool("select");
    }
  };

  const onCanvasPointerMove = (e: ReactPointerEvent) => {
    if (panState.current) {
      const dx = e.clientX - panState.current.startX;
      const dy = e.clientY - panState.current.startY;
      setPan({ x: panState.current.panX + dx, y: panState.current.panY + dy });
    } else if (strokeState.current && tool === "pen") {
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      const id = strokeState.current.id;
      setItems((it) =>
        it.map((i) => (i.id === id && i.type === "stroke" ? { ...i, points: [...i.points, { x, y }] } : i)),
      );
    } else if (strokeState.current && tool === "eraser") {
      eraseAt(e.clientX, e.clientY);
    } else if (dragState.current) {
      const dx = (e.clientX - dragState.current.startX) / zoom;
      const dy = (e.clientY - dragState.current.startY) / zoom;
      const id = dragState.current.id;
      const nx = dragState.current.itemX + dx;
      const ny = dragState.current.itemY + dy;
      setItems((it) =>
        it.map((i) => (i.id === id && i.type !== "stroke" ? { ...i, x: nx, y: ny } : i)),
      );
    }
  };

  const onCanvasPointerUp = (e: ReactPointerEvent) => {
    panState.current = null;
    dragState.current = null;
    strokeState.current = null;
    // Commit any in-progress gesture as a single undo step.
    const gesture = gestureStartRef.current;
    gestureStartRef.current = null;
    if (gesture) {
      const next = itemsRef.current;
      if (next !== gesture.prevItems) {
        pushHistoryEntry(gesture.label, gesture.prevItems, next);
      }
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };


  // Native non-passive wheel listener so we can preventDefault the browser's
  // pinch/ctrl+wheel page zoom and apply it to the canvas instead. Zoom is
  // cursor-anchored and accumulated into one animation-frame update so high
  // resolution trackpads remain controlled instead of jumping between scales.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let frame = 0;
    let queuedX = 0;
    let queuedY = 0;
    let zoomDelta = 0;
    let anchorX = 0;
    let anchorY = 0;
    let zooming = false;

    const flushWheel = () => {
      frame = 0;
      const current = viewRef.current;
      if (zooming) {
        // Delta-scaled exponential zoom → identical feel at every scale and no
        // runaway jumps from high-resolution trackpads.
        const next = Math.min(3, Math.max(0.15, current.zoom * Math.exp(-zoomDelta * 0.0015)));
        const k = next / current.zoom;
        applyView(next, {
          x: anchorX - (anchorX - current.pan.x) * k,
          y: anchorY - (anchorY - current.pan.y) * k,
        });
      } else {
        applyView(current.zoom, { x: current.pan.x - queuedX, y: current.pan.y - queuedY });
      }
      queuedX = 0;
      queuedY = 0;
      zoomDelta = 0;
      zooming = false;
    };

    type WheelLike = {
      deltaX: number;
      deltaY: number;
      deltaMode: number;
      ctrlKey: boolean;
      metaKey: boolean;
      clientX: number;
      clientY: number;
    };

    const process = (e: WheelLike) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zooming = true;
        zoomDelta += e.deltaY * unit;
        anchorX = e.clientX - rect.left;
        anchorY = e.clientY - rect.top;
      } else {
        queuedX += e.deltaX * unit;
        queuedY += e.deltaY * unit;
      }
      if (!frame) frame = requestAnimationFrame(flushWheel);
    };

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      process(e);
    };
    const forwarded = (e: Event) => {
      const detail = (e as CustomEvent<WheelLike>).detail;
      if (detail) process(detail);
    };
    el.addEventListener("wheel", handler, { passive: false });
    window.addEventListener("flowstep:wheel", forwarded);
    return () => {
      el.removeEventListener("wheel", handler);
      window.removeEventListener("flowstep:wheel", forwarded);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [applyView]);




  const startDragItem = (e: ReactPointerEvent, item: CanvasItem) => {
    if (tool !== "select" || item.type === "stroke") return;
    e.stopPropagation();
    setSelectedId(item.id);
    dragState.current = { id: item.id, startX: e.clientX, startY: e.clientY, itemX: item.x, itemY: item.y };
    gestureStartRef.current = { label: `Move ${item.type}`, prevItems: itemsRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };


  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    mutateItems("Delete item", (it) => it.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, mutateItems]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inEditable =
        t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if (e.code === "Space" && !inEditable) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !inEditable) {
        deleteSelected();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        if (inEditable) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        if (inEditable) return;
        e.preventDefault();
        redo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedId, deleteSelected, undo, redo]);

  const extractHtml = (raw: string) => {
    let s = raw.replace(/^```(?:html)?\s*/i, "");
    s = s.replace(/```\s*$/i, "");
    const idx = s.toLowerCase().indexOf("<!doctype");
    if (idx > 0) s = s.slice(idx);
    return s;
  };

  const extractSnippet = (raw: string) => {
    let s = raw.replace(/^```(?:html)?\s*/i, "");
    s = s.replace(/```\s*$/i, "");
    return s.trim();
  };

  async function editSinglePart(
    p: string,
    target: PartSelection,
    signal: AbortSignal,
  ): Promise<{ target: PartSelection; newSnippet: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const bearer = sessionData.session?.access_token;
    const res = await fetch("/api/edit-part", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ snippet: target.snippet, prompt: p, model }),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error((await res.text().catch(() => "")) || `Edit failed (${res.status})`);
    }

    let accumulated = "";
    let streamError: string | undefined;
    const parser = createParser({
      onEvent(event) {
        if (event.data === "[DONE]") return;
        let payload:
          | { choices?: { delta?: { content?: string } }[]; error?: { message?: string } }
          | undefined;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (payload?.error) { streamError = payload.error.message ?? "Edit failed"; return; }
        const delta = payload?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length) accumulated += delta;
      },
    });

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    if (streamError) throw new Error(streamError);
    const newSnippet = extractSnippet(accumulated);
    if (!newSnippet) throw new Error("Empty response from editor");
    return { target, newSnippet };
  }

  async function handleEditPart(p: string, targets: PartSelection[]) {
    if (loading || targets.length === 0) return;
    setPrompt("");
    const summary =
      targets.length === 1
        ? `Edit ${targets[0].label}: ${p}`
        : `Edit ${targets.length} sections: ${p}`;
    setMessages((m) => [...m, { id: uid(), role: "user", text: summary }]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const results = await Promise.allSettled(
        targets.map((t) => editSinglePart(p, t, controller.signal)),
      );

      // Splice successful edits into each design's html.
      const nextHtmlByDesign = new Map<string, string>();
      const ensureEditId = (snippet: string, editId: string): string => {
        if (
          snippet.includes(`data-edit-id="${editId}"`) ||
          snippet.includes(`data-edit-id='${editId}'`)
        ) {
          return snippet;
        }
        return snippet.replace(
          /^<([a-zA-Z][\w-]*)(\s|>)/,
          (_m, tag: string, sep: string) =>
            `<${tag} data-edit-id="${editId}"${sep === ">" ? ">" : sep}`,
        );
      };
      const label =
        targets.length === 1
          ? `Edit ${targets[0].label}: ${p.slice(0, 40)}`
          : `Edit ${targets.length} sections: ${p.slice(0, 40)}`;
      mutateItems(label, (it) =>
        it.map((i) => {
          if (i.type !== "design") return i;
          let html = i.html;
          for (const r of results) {
            if (r.status !== "fulfilled") continue;
            const { target, newSnippet: rawSnippet } = r.value;
            if (target.designId !== i.id) continue;
            const newSnippet = ensureEditId(rawSnippet, target.editId);
            // Refuse anything that is not a single same-tag element: a full
            // document coming back from the model must never overwrite the page.
            const replacementRoot = firstElementOf(newSnippet);
            const originalRoot = firstElementOf(target.snippet);
            if (
              !replacementRoot ||
              !originalRoot ||
              replacementRoot.tagName === "HTML" ||
              replacementRoot.tagName !== originalRoot.tagName
            ) {
              continue;
            }
            // Re-locate the element in the CURRENT html before replacing it.
            const path = resolveElementPath(html, target.path, target.snippet);
            if (!path) continue;
            const byPath = spliceAtPath(html, path, newSnippet);
            if (byPath) html = byPath;
          }
          if (html === i.html) return i;
          nextHtmlByDesign.set(i.id, html);
          return { ...i, html };
        }),
      );


      // Refresh selection snippets against the freshly-updated html so the
      // Inspector shows current classes/text and future edits splice cleanly.
      if (nextHtmlByDesign.size > 0) {
        setEditTargets((prev) =>
          prev.map((t) => {
            const html = nextHtmlByDesign.get(t.designId);
            if (!html) return t;
            // After splicing, the element carries its data-edit-id in the stored
            // HTML, so re-address it by id and refresh both path and snippet.
            const path = pathOfEditId(html, t.editId) ?? t.path;
            const fresh = readSnippetAtPath(html, path, t.editId);
            if (!fresh) return t;
            return { ...t, path, snippet: fresh, preSnippet: fresh };
          }),
        );
      }

      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - okCount;
      const isAbort =
        controller.signal.aborted &&
        results.every((r) => r.status === "rejected");
      const reply = isAbort
        ? "Edit stopped."
        : failCount === 0
          ? `Updated ${okCount} section${okCount === 1 ? "" : "s"}.`
          : `Updated ${okCount} · ${failCount} failed.`;
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: reply }]);
      // Re-pulse the first still-selected target after the iframe re-renders
      // so the user can see the change land on the element they were editing.
      if (okCount > 0) {
        const survivor = targets.find((t) =>
          results.some(
            (r) => r.status === "fulfilled" && r.value.target.editId === t.editId,
          ),
        );
        if (survivor) {
          setTimeout(() => {
            setFocusRequest({
              designId: survivor.designId,
              editId: survivor.editId,
              nonce: Date.now(),
            });
          }, 80);
        }
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const msg = isAbort ? "Edit stopped." : err instanceof Error ? err.message : "Edit failed";
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: msg }]);
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }


  async function handleSend() {
    const p = prompt.trim();
    if (!p || loading) return;
    setPrompt("");
    const userMsg: ChatMsg = { id: uid(), role: "user", text: p };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    setProgressStep(1);


    const cw = canvasRef.current?.clientWidth ?? 800;
    const ch = canvasRef.current?.clientHeight ?? 600;
    const GAP = 96;
    const ROW_GAP = 160;
    const FRAME_W = 960;
    const FRAME_H = 640;
    const existingDesigns = itemsRef.current.filter((it) => it.type === "design");
    let centerX: number;
    let centerY: number;
    if (existingDesigns.length > 0) {
      // Each new prompt starts a fresh row below everything already on the canvas.
      const leftmost = Math.min(...existingDesigns.map((d) => d.x));
      const bottom = Math.max(...existingDesigns.map((d) => d.y + d.h));
      centerX = leftmost;
      centerY = bottom + ROW_GAP;
    } else {
      centerX = (-pan.x + cw / 2) / zoom - FRAME_W / 2;
      centerY = (-pan.y + ch / 2) / zoom - FRAME_H / 2;
    }

    const preGenSnapshot = itemsRef.current;
    const screenIds = new Map<string, string>();
    const htmlByScreen = new Map<string, string>();
    const pendingFlushes = new Map<string, number>();
    let manifested = false;
    let completedCount = 0;
    let failedCount = 0;
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${uid()}`;
    const variationIndex = variationSequenceRef.current;
    variationSequenceRef.current += 1;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const bearer = sessionData.session?.access_token;
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify({
          prompt: p,
          level,
          model,
          images: refImages.map((r) => r.src),
          runId,
          variationIndex,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text().catch(() => "")) || `Generation failed (${res.status})`);
      }

      let streamError: string | undefined;
      const placeholderHtml = (name: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#f7f7f5;font-family:system-ui,sans-serif}body{padding:48px;color:#18181b}.shell{display:grid;grid-template-columns:236px 1fr;gap:24px;height:864px}.block{border-radius:8px;background:#e8e8e5;animation:p 1.4s ease-in-out infinite}.main{display:grid;grid-template-rows:72px 1fr;gap:24px}.rows{display:grid;gap:16px;grid-template-columns:repeat(3,1fr)}.rows .block{min-height:180px}@keyframes p{50%{opacity:.45}}</style></head><body><div class="shell"><div class="block"></div><main class="main"><div><strong>${name}</strong><p>Building this screen…</p></div><div class="rows"><div class="block"></div><div class="block"></div><div class="block"></div><div class="block"></div><div class="block"></div><div class="block"></div></div></main></div></body></html>`;

      const errorHtml = (name: string, message: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:grid;place-items:center;height:960px;background:#fafafa;color:#18181b;font:14px system-ui}.box{width:520px;padding:32px;border:1px solid #e4e4e7;border-radius:8px;background:white}.label{color:#dc2626;font-size:12px;font-weight:700}.message{color:#71717a;line-height:1.6}</style></head><body><div class="box"><div class="label">SCREEN NEEDS ATTENTION</div><h1>${name}</h1><p class="message">${message.replace(/[<>&]/g, "")}</p></div></body></html>`;

      const flushScreen = (screenId: string, isFinal: boolean) => {
        const designId = screenIds.get(screenId);
        const html = extractHtml(htmlByScreen.get(screenId) ?? "");
        if (!designId || !html) return;
        flushSync(() => {
          setItems((it) =>
            it.map((item) =>
              item.id === designId && item.type === "design" ? { ...item, html, isFinal } : item,
            ),
          );
        });
      };

      const scheduleScreenFlush = (screenId: string) => {
        if (pendingFlushes.has(screenId)) return;
        const timer = window.setTimeout(() => {
          pendingFlushes.delete(screenId);
          flushScreen(screenId, false);
        }, 180);
        pendingFlushes.set(screenId, timer);
      };

      const parser = createParser({
        onEvent(event) {
          let payload:
            | { type: "manifest"; screens: Array<{ id: string; name: string }> }
            | { type: "screen-start"; screenId: string }
            | { type: "screen-delta"; screenId: string; delta: string }
            | { type: "screen-complete"; screenId: string }
            | { type: "screen-error"; screenId: string; message: string }
            | { type: "complete"; completed: number; failed: number }
            | { type: "error"; message: string };
          try { payload = JSON.parse(event.data); } catch { return; }
          if (payload.type === "manifest") {
            manifested = true;
            const nextItems: CanvasItem[] = payload.screens.map((screen, index) => {
              const designId = uid();
              screenIds.set(screen.id, designId);
              return {
                id: designId,
                type: "design",
                x: centerX + index * (FRAME_W + GAP),
                y: centerY,
                w: FRAME_W,
                h: FRAME_H,
                html: placeholderHtml(screen.name),
                prompt: p,
                isFinal: false,
                screenName: screen.name,
              };
            });
            flushSync(() => {
              setItems((items) => [...items, ...nextItems]);
              setSelectedId(nextItems[0]?.id ?? null);
            });
            setProgressStep(2);
          } else if (payload.type === "screen-start") {
            setProgressStep(3);
          } else if (payload.type === "screen-delta") {
            htmlByScreen.set(payload.screenId, (htmlByScreen.get(payload.screenId) ?? "") + payload.delta);
            if ((htmlByScreen.get(payload.screenId)?.length ?? 0) > 1800) scheduleScreenFlush(payload.screenId);
            setProgressStep(4);
          } else if (payload.type === "screen-complete") {
            const timer = pendingFlushes.get(payload.screenId);
            if (timer !== undefined) window.clearTimeout(timer);
            pendingFlushes.delete(payload.screenId);
            flushScreen(payload.screenId, true);
          } else if (payload.type === "screen-error") {
            failedCount += 1;
            const designId = screenIds.get(payload.screenId);
            if (designId) {
              setItems((items) => items.map((item) => item.id === designId && item.type === "design"
                ? { ...item, html: errorHtml(item.screenName ?? "Screen", payload.message), isFinal: true }
                : item));
            }
          } else if (payload.type === "complete") {
            completedCount = payload.completed;
            failedCount = payload.failed;
            setProgressStep(5);
          } else if (payload.type === "error") {
            streamError = payload.message;
          }
        },
      });

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(value);
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      pendingFlushes.forEach((timer) => window.clearTimeout(timer));
      pendingFlushes.clear();
      if (streamError) throw new Error(streamError);
      if (!manifested) throw new Error("Design stream ended without a screen plan");
      setItems((current) => {
        pushHistoryEntry(`Generate product: ${p.slice(0, 40)}`, preGenSnapshot, current);
        return current;
      });

      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          text: failedCount > 0
            ? `${completedCount} screens completed · ${failedCount} need attention.`
            : `${completedCount} production-ready screen${completedCount === 1 ? "" : "s"} rendered on the canvas.`,
        },
      ]);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort) {
        const generatedIds = new Set(screenIds.values());
        setItems((items) => items.map((item) => generatedIds.has(item.id) && item.type === "design" ? { ...item, isFinal: true } : item));
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", text: manifested ? "Generation stopped. Completed and partial screens remain on the canvas." : "Generation stopped." },
        ]);
      } else {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setMessages((m) => [...m, { id: uid(), role: "assistant", text: `Error: ${msg}` }]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setProgressStep(0);
      setRefImages([]);
      // Auto-fit so the whole row of generated screens is visible.
      window.setTimeout(() => fitCanvas(), 80);
    }

  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f8f2ff]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2" aria-label="Go to home">
            <img src={logoAsset} alt="Flowstep" className="h-7 w-7 rounded-lg" />
            <span className="text-base font-semibold tracking-tight text-[#0b1220]">flowstep</span>
          </Link>
          <input
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            placeholder="Untitled design"
            aria-label="Design name"
            className="ml-3 min-w-0 max-w-[240px] rounded-md bg-transparent px-1.5 py-0.5 text-sm text-[#0b1220]/70 outline-none hover:bg-black/5 focus:bg-black/5 focus:text-[#0b1220]"
          />
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/account"
            className="hidden items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm text-[#0b1220]/80 hover:bg-black/5 hover:text-[#0b1220] sm:inline-flex"
            title="Account settings"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0b1220] text-[10px] font-semibold uppercase text-white">
              {(email ?? "?").charAt(0)}
            </span>
            <span className="max-w-[160px] truncate">{email}</span>
          </Link>
          <button
            onClick={signOut}
            className="rounded-full bg-[#0b1220] px-4 py-1.5 text-sm font-medium text-white hover:bg-black"
          >
            Sign out
          </button>
        </div>
      </header>


      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        {/* Left sidebar: chat / prompt */}
        {sidebarOpen && isNarrow && (
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-30 cursor-default bg-black/30"
          />
        )}
        {sidebarOpen && (
        <aside
          style={{ width: isNarrow ? "min(20rem, 88vw)" : sidebarWidth }}
          className={`flex shrink-0 flex-col border-r border-black/5 bg-white ${
            isNarrow ? "absolute inset-y-0 left-0 z-40 shadow-2xl" : "relative"
          }`}
        >

          <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
            <Sparkles className="h-4 w-4 text-[#2b6bff]" />
            <span className="text-sm font-semibold text-[#0b1220]">AI Chat</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
              aria-label="Hide chat"
              title="Hide chat"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#0b1220] px-3 py-2 text-sm text-white"
                    : "max-w-[90%] text-sm text-[#0b1220]/80"
                }
              >
                {m.text}
                {m.imageUrl && (
                  <img src={m.imageUrl} alt="" className="mt-2 rounded-lg border border-black/10" />
                )}
              </div>
            ))}
            {loading && (
              <div className="space-y-2 rounded-xl border border-black/5 bg-[#f8f2ff] px-3 py-3 text-sm text-[#0b1220]/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-[#0b1220]">
                    <Sparkles className="h-4 w-4 text-[#2b6bff]" /> Designing…
                  </span>
                  <button
                    onClick={stopGeneration}
                    className="flex items-center gap-1 rounded-full bg-[#0b1220] px-2.5 py-1 text-xs font-medium text-white hover:bg-black"
                  >
                    <Square className="h-3 w-3 fill-white" /> Stop
                  </button>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {[
                    "Analyzing your brief",
                    "Composing layout structure",
                    "Applying visual system",
                    "Filling content & details",
                    "Finalizing design",
                  ].map((label, i) => {
                    const idx = i + 1;
                    const done = progressStep > idx;
                    const active = progressStep === idx;
                    return (
                      <li
                        key={label}
                        className={`flex items-center gap-2 text-[13px] transition-colors ${
                          done ? "text-[#0b1220]/60" : active ? "text-[#0b1220]" : "text-[#0b1220]/35"
                        }`}
                      >
                        <span className="flex h-4 w-4 items-center justify-center">
                          {done ? (
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#12a150]" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5l3.2 3L13 4.5" />
                            </svg>
                          ) : active ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2b6bff]" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0b1220]/25" />
                          )}
                        </span>
                        <span>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

          </div>
          <div className="max-h-[70%] shrink-0 overflow-y-auto border-t border-black/5 p-3">
            {editTargets.length > 0 && (
              <div className="mb-2 space-y-1.5">
                <div className="flex items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-[#0b1220]/50">
                  <MousePointerClick className="h-3 w-3 text-[#2b6bff]" />
                  Editing {editTargets.length} section{editTargets.length === 1 ? "" : "s"}
                  <button
                    onClick={clearEditTargets}
                    className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {editTargets.map((t) => (
                    <span
                      key={t.editId}
                      className="inline-flex items-center gap-1 rounded-full border border-[#2b6bff]/30 bg-[#2b6bff]/10 px-2 py-0.5 text-xs text-[#0b1220]"
                    >
                      <span className="max-w-[140px] truncate font-mono text-[11px]">{t.label}</span>
                      <button
                        onClick={() => removeEditTarget(t.editId)}
                        className="rounded-full p-0.5 text-[#0b1220]/60 hover:bg-black/10 hover:text-[#0b1220]"
                        aria-label={`Remove ${t.label} from selection`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {items.length === 0 && editTargets.length === 0 && !prompt.trim() && !loading ? (
              <div className="mb-2">
                <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-[#0b1220]/40">
                  Try a sample
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Todo app with quick-add and filters",
                    "Sign in and sign up pages",
                    "Analytics dashboard for a SaaS",
                    "Pricing page with 3 tiers",
                    "Kanban board with 4 columns",
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setPrompt(sample);
                        promptRef.current?.focus();
                      }}
                      className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] text-[#0b1220]/70 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#0b1220]/30 hover:bg-neutral-50 hover:text-[#0b1220]"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {refImages.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {refImages.map((ref) => (
                  <span
                    key={ref.id}
                    className="group relative h-16 w-16 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm"
                    title={ref.name}
                  >
                    <img src={ref.src} alt={ref.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setRefImages((prev) => prev.filter((r) => r.id !== ref.id))}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Remove ${ref.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm transition-colors focus-within:border-[#0b1220]/30">
              <textarea
                ref={promptRef}
                value={prompt}

                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const p = prompt.trim();
                    if (!p || loading) return;
                    if (editTargets.length > 0) handleEditPart(p, editTargets);
                    else handleSend();
                  }
                }}
                placeholder={
                  editTargets.length > 0
                    ? `Change ${editTargets.length === 1 ? `this ${editTargets[0].label}` : `these ${editTargets.length} sections`}…`
                    : "Imagine, then type…"
                }
                rows={3}
                className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-[#0b1220] outline-none placeholder:text-[#0b1220]/40"
              />
              <div className="mt-2 grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
                  aria-label="Upload image to canvas"
                  title="Upload image to canvas"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((v) => {
                      const next = !v;
                      if (!next) clearEditTargets();
                      return next;
                    });
                  }}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    selectMode
                      ? "bg-[#2b6bff] text-white"
                      : "text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
                  }`}
                  aria-label="Select design sections to edit"
                  title="Select one or more sections of a design to edit"
                >
                  <MousePointerClick className="h-4 w-4" />
                </button>
                <div className="relative col-span-full row-start-2 mt-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setModelPickerOpen((v) => !v)}
                      className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 text-[11px] font-medium text-[#0b1220] hover:bg-black/[0.03]"
                      title="Model — pick which AI generates the design"
                      aria-haspopup="listbox"
                      aria-expanded={modelPickerOpen}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#2b6bff]" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {DESIGN_MODELS.find((m) => m.id === model)?.label ?? "Model"}
                      </span>
                      <svg viewBox="0 0 20 20" className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {modelPickerOpen ? (
                      <>
                        <button
                          type="button"
                          aria-label="Close model picker"
                          className="fixed inset-0 z-40 cursor-default"
                          onClick={() => setModelPickerOpen(false)}
                        />
                        <div
                          role="listbox"
                          aria-label="Choose model"
                          className="absolute bottom-full right-0 z-50 mb-2 max-h-[60vh] w-[min(22rem,calc(100vw-2rem))] max-w-[80vw] overflow-y-auto rounded-xl border border-black/10 bg-white shadow-2xl divide-y divide-black/5"
                        >
                          <div className="sticky top-0 flex items-center justify-between border-b border-black/5 bg-white/95 px-4 py-3 backdrop-blur">
                            <span className="text-[13px] font-semibold text-neutral-900">Choose model</span>
                            <button
                              type="button"
                              onClick={() => setModelPickerOpen(false)}
                              className="rounded-full px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 sm:hidden"
                            >
                              Close
                            </button>
                          </div>
                          {DESIGN_MODELS.map((m) => {
                            const active = m.id === model;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setModel(m.id);
                                  setModelPickerOpen(false);
                                }}
                                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-left transition-colors ${
                                  active ? "bg-[#2b6bff]/[0.08]" : "hover:bg-neutral-100"
                                }`}
                              >
                                <span
                                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${
                                    active ? "bg-[#2b6bff]" : "bg-neutral-300"
                                  }`}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-[14px] font-semibold leading-tight text-neutral-900">
                                    {m.label}
                                  </span>
                                  <span className="mt-0.5 block text-[12.5px] leading-snug text-neutral-600 break-words">
                                    {m.hint}
                                  </span>
                                </span>
                                {active ? (
                                  <span className="mt-0.5 shrink-0 rounded-full bg-[#2b6bff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                    Active
                                  </span>
                                ) : (
                                  <span className="w-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                      </>
                    ) : null}
                </div>

                <button
                  type="button"
                  className="col-start-4 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#0b1220]/60 hover:bg-black/5 hover:text-[#0b1220]"
                  aria-label="Voice input"
                  title="Voice input"
                >
                  <Mic className="h-4 w-4" />
                </button>
                {loading ? (
                  <button
                    onClick={stopGeneration}
                    className="col-start-5 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b1220] text-white hover:bg-black"
                    aria-label="Stop generating"
                  >
                    <Square className="h-3.5 w-3.5 fill-white" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const p = prompt.trim();
                      if (!p) return;
                      if (editTargets.length > 0) handleEditPart(p, editTargets);
                      else handleSend();
                    }}
                    disabled={!prompt.trim()}
                    className="col-start-5 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b1220] text-white transition-opacity hover:bg-black disabled:cursor-not-allowed disabled:bg-[#0b1220]/10 disabled:text-[#0b1220]/40"
                    aria-label={editTargets.length > 0 ? "Apply edit" : "Send prompt"}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}

                <div
                    className="col-span-full row-start-3 mt-1 grid min-w-0 grid-cols-[0.7fr_0.7fr_1.3fr_1.3fr] rounded-full border border-black/10 bg-white p-0.5"
                    role="radiogroup"
                    aria-label="Generation level"
                    title="Generation level — controls how polished the output is"
                  >
                    {(
                      [
                        { id: "v1", label: "v1", hint: "Simple mid-fidelity first pass" },
                        { id: "v2", label: "v2", hint: "More complete, still restrained" },
                        { id: "polished", label: "Polished", hint: "High-fidelity, refined details" },
                        { id: "industry", label: "Industry", hint: "Full industry-grade, pixel-perfect" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={level === opt.id}
                        onClick={() => setLevel(opt.id)}
                        title={opt.hint}
                        className={`min-w-0 truncate rounded-full px-1.5 py-1 text-[11px] font-medium transition-colors ${
                          level === opt.id
                            ? "bg-[#0b1220] text-white"
                            : "text-[#0b1220]/60 hover:text-[#0b1220]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {!isNarrow && (
          <div
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            className="absolute right-0 top-0 z-10 h-full w-1.5 -mr-[3px] cursor-col-resize hover:bg-[#2b6bff]/30 active:bg-[#2b6bff]/50"
          />
          )}
        </aside>
        )}
        {!sidebarOpen && (
          <button
            onClick={() => {
              setSidebarWidth((width) => Math.max(280, width));
              setSidebarOpen(true);
            }}
            className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#0b1220] shadow-md hover:bg-[#f8f2ff]"
            aria-label="Show chat"
            title="Show chat"
          >
            <PanelLeftOpen className="h-4 w-4 text-[#2b6bff]" />
            Show chat
          </button>
        )}

        {/* Canvas */}

        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#f4eefc]">

          <div
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(e) => {
              if (e.dataTransfer?.files?.length) {
                e.preventDefault();
                onPickFiles(e.dataTransfer.files);
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && files.length) {
                e.preventDefault();
                onPickFiles(files);
              }
            }}
            
            style={{
              cursor: tool === "hand" || spaceHeld ? "grab" : tool === "text" ? "text" : tool === "rect" ? "crosshair" : tool === "pen" || tool === "eraser" ? "crosshair" : "default",
              backgroundImage:
                "radial-gradient(circle, rgba(11,18,32,0.08) 1px, transparent 1px)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
            className="absolute inset-0 touch-none select-none"
          >
            <div
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: "transform",
              }}
              className="absolute left-0 top-0"
            >
              {items.map((item) => {
                const selected = selectedId === item.id;
                const commonCls = `absolute ${selected ? "outline outline-2 outline-[#2b6bff]" : ""}`;
                if (item.type === "design") {
                  const isPartial = item.isFinal === false;
                  const designTargets = editTargets.filter((t) => t.designId === item.id);
                  const isEditTarget = designTargets.length > 0;
                  return (
                    <div
                      key={item.id}
                      onPointerDown={(e) => {
                        if (selectMode && !isPartial) return;
                        startDragItem(e, item);
                      }}
                      style={{ position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h }}
                      className={`${commonCls} group rounded-2xl bg-white shadow-2xl ${
                        selectMode && !isPartial ? "cursor-crosshair" : "cursor-move"
                      } ${isPartial ? "animated-rainbow-border" : ""} ${
                        isEditTarget ? "ring-2 ring-[#2b6bff] ring-offset-2 ring-offset-[#f4eefc]" : ""
                      }`}
                    >
                      {item.screenName ? (
                        <div className="pointer-events-none absolute -top-7 left-0 z-10 max-w-full truncate text-[12px] font-semibold text-[#0b1220]/60">
                          {item.screenName}
                        </div>
                      ) : null}
                      <DesignFrame
                        id={item.id}
                        html={item.html}
                        isPartial={isPartial}
                        width={item.w}
                        height={item.h}
                        selectMode={selectMode && !isPartial}
                        highlightEditIds={designTargets.map((t) => t.editId)}
                        focusRequest={
                          focusRequest && focusRequest.designId === item.id
                            ? { editId: focusRequest.editId, nonce: focusRequest.nonce }
                            : null
                        }
                        onPickPart={onPickPart}
                        onUnpickPart={onUnpickPart}
                        onContentHeight={onContentHeight}
                      />

                    </div>
                  );
                }

                if (item.type === "text") {
                  return (
                    <div
                      key={item.id}
                      onPointerDown={(e) => startDragItem(e, item)}
                      style={{ left: item.x, top: item.y, minWidth: item.w }}
                      className={`${commonCls} cursor-move whitespace-pre px-2 py-1 text-xl font-medium text-[#0b1220]`}
                    >
                      {item.text}
                    </div>
                  );
                }
                if (item.type === "stroke") {
                  if (item.points.length === 0) return null;
                  const d = item.points
                    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                    .join(" ");
                  const xs = item.points.map((p) => p.x);
                  const ys = item.points.map((p) => p.y);
                  const minX = Math.min(...xs) - item.size;
                  const minY = Math.min(...ys) - item.size;
                  const maxX = Math.max(...xs) + item.size;
                  const maxY = Math.max(...ys) + item.size;
                  return (
                    <svg
                      key={item.id}
                      className="pointer-events-none absolute overflow-visible"
                      style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}
                      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
                    >
                      <path
                        d={d}
                        stroke={item.color}
                        strokeWidth={item.size}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  );
                }
              if (item.type === "image") {
                  return (
                    <img
                      key={item.id}
                      src={item.src}
                      alt={item.name}
                      draggable={false}
                      onPointerDown={(e) => startDragItem(e, item)}
                      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                      className={`${commonCls} cursor-move select-none rounded-lg bg-white shadow-lg`}
                    />
                  );
                }
                return (
                  <div
                    key={item.id}
                    onPointerDown={(e) => startDragItem(e, item)}
                    style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                    className={`${commonCls} cursor-move rounded-lg border-2 border-[#0b1220] bg-white/60`}
                  />
                );
              })}
            </div>

            {items.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Sparkles className="h-6 w-6 text-[#2b6bff]" />
                  </div>
                  <p className="text-sm font-medium text-[#0b1220]">Your infinite canvas</p>
                  <p className="mt-1 text-xs text-[#0b1220]/50">Type a prompt on the left to generate a design</p>
                </div>
              </div>
            )}
          </div>

          {/* Selected item actions */}
          {selectedId && (() => {
            const sel = items.find((i) => i.id === selectedId);
            const isDesign = sel?.type === "design";
            return (
              <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-md">
                {isDesign && sel?.type === "design" && (
                  <div className="relative" ref={exportMenuRef}>
                    <button
                      onClick={() => setExportMenuOpen((o) => !o)}
                      disabled={exporting !== false}
                      className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[#0b1220] hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Download this design"
                    >
                      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {exporting === "zip" ? "Packing…" : exporting === "image" ? "Capturing…" : "Export"}
                    </button>
                    {exportMenuOpen && (
                      <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-lg">
                        <button
                          onClick={async () => {
                            setExportMenuOpen(false);
                            try {
                              setExporting("image");
                              await exportDesignImage(sel.html, sel.prompt);
                            } catch (err) {
                              const msg = err instanceof Error ? err.message : "Image export failed";
                              setMessages((m) => [...m, { id: uid(), role: "assistant", text: `Export failed: ${msg}` }]);
                            } finally {
                              setExporting(false);
                            }
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#0b1220] hover:bg-black/5"
                        >
                          <Download className="h-3.5 w-3.5 text-[#2b6bff]" />
                          Image (PNG)
                        </button>
                        <button
                          onClick={async () => {
                            setExportMenuOpen(false);
                            try {
                              setExporting("zip");
                              await exportDesignZip(sel.html, sel.prompt);
                            } catch (err) {
                              const msg = err instanceof Error ? err.message : "Export failed";
                              setMessages((m) => [...m, { id: uid(), role: "assistant", text: `Export failed: ${msg}` }]);
                            } finally {
                              setExporting(false);
                            }
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#0b1220] hover:bg-black/5"
                        >
                          <Download className="h-3.5 w-3.5 text-[#2b6bff]" />
                          Code (ZIP)
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            );
          })()}

          {/* Bottom floating toolbar */}
          <div className="absolute bottom-6 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full bg-white px-2 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            <ToolBtn active={tool === "select"} onClick={() => setTool("select")}>
              <MousePointer2 className="h-4 w-4 text-[#2b6bff]" />
            </ToolBtn>
            <ToolBtn active={tool === "hand"} onClick={() => setTool("hand")}>
              <Hand className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")}>
              <Pencil className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")}>
              <Eraser className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "text"} onClick={() => setTool("text")}>
              <TypeIcon className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")}>
              <SquareIcon className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn active={tool === "shapes"} onClick={() => setTool("shapes")}>
              <Shapes className="h-4 w-4" />
            </ToolBtn>
            <div className="mx-1 h-5 w-px bg-black/10" />
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <div className="mx-1 flex items-center gap-0.5 rounded-full px-1">
              <button
                onClick={fitCanvas}
                className="rounded-full p-1 hover:bg-black/5"
                aria-label="Fit canvas to view"
                title="Fit to view"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => zoomAtCenter(1 / 1.12)}
                className="rounded-full p-1 hover:bg-black/5"
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[42px] text-center text-sm font-semibold text-[#0b1220]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => zoomAtCenter(1.12)}
                className="rounded-full p-1 hover:bg-black/5"
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => navigate({ to: "/", hash: "pricing" })}
              className="ml-1 rounded-full bg-[#2b6bff] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1e57e6]"
            >
              Upgrade
            </button>

          </div>
        </div>
        {editTargets.length > 0 && (
          <Inspector
            targets={editTargets}
            onClose={clearEditTargets}
            onRemove={removeEditTarget}
            onApply={applyInspectorSnippet}
            onAiEdit={focusPrompt}
            onFocus={focusPart}
          />
        )}
      </div>

    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
        active ? "bg-[#e8efff]" : "hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}
