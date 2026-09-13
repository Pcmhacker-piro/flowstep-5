import JSZip from "jszip";
import html2canvas from "html2canvas";

// Strip editor-only attributes so exported HTML is clean.
function stripEditorAttrs(html: string): string {
  return html
    .replace(/\s+data-edit-id="[^"]*"/g, "")
    .replace(/\s+data-lov-[a-z-]+(?:="[^"]*")?/g, "");
}

function safeFilename(name: string): string {
  return (name || "design").toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "design";
}

function extFromContentType(ct: string | null, fallback = "bin"): string {
  if (!ct) return fallback;
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "image/x-icon": "ico",
    "font/woff": "woff",
    "font/woff2": "woff2",
    "font/ttf": "ttf",
    "font/otf": "otf",
    "text/css": "css",
    "application/javascript": "js",
    "text/javascript": "js",
  };
  const key = ct.split(";")[0].trim().toLowerCase();
  return map[key] ?? fallback;
}

async function fetchAsset(url: string): Promise<{ blob: Blob; ext: string } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const ct = res.headers.get("content-type");
    const urlExt = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() ?? "";
    const knownExt = /^[a-z0-9]{2,5}$/.test(urlExt) ? urlExt : "";
    return { blob, ext: knownExt || extFromContentType(ct) };
  } catch {
    return null;
  }
}

// Walk the HTML, download any http(s) assets referenced by <img src>,
// <link href>, or <script src>, and rewrite the references to local paths.
async function bundleAssets(html: string): Promise<{ html: string; files: Map<string, Blob> }> {
  const files = new Map<string, Blob>();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const targets: { el: Element; attr: string }[] = [];
  doc.querySelectorAll("img[src]").forEach((el) => targets.push({ el, attr: "src" }));
  doc.querySelectorAll("source[src]").forEach((el) => targets.push({ el, attr: "src" }));
  doc.querySelectorAll("link[href]").forEach((el) => targets.push({ el, attr: "href" }));
  doc.querySelectorAll("script[src]").forEach((el) => targets.push({ el, attr: "src" }));

  const seen = new Map<string, string>(); // remote URL → local path

  await Promise.all(
    targets.map(async ({ el, attr }) => {
      const url = el.getAttribute(attr);
      if (!url || !/^https?:\/\//i.test(url)) return;

      if (seen.has(url)) {
        el.setAttribute(attr, seen.get(url)!);
        return;
      }
      const got = await fetchAsset(url);
      if (!got) return; // leave the remote URL in place on CORS failure

      const baseName =
        (url.split("?")[0].split("#")[0].split("/").pop() || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) ||
        "asset";
      let name = baseName.includes(".") ? baseName : `${baseName}.${got.ext}`;
      let n = 1;
      while (files.has(`assets/${name}`)) {
        const dot = name.lastIndexOf(".");
        const stem = dot >= 0 ? name.slice(0, dot) : name;
        const ext = dot >= 0 ? name.slice(dot) : "";
        name = `${stem}-${n++}${ext}`;
      }
      const localPath = `assets/${name}`;
      files.set(localPath, got.blob);
      seen.set(url, localPath);
      el.setAttribute(attr, localPath);
    }),
  );

  const serialized = "<!doctype html>\n" + doc.documentElement.outerHTML;
  return { html: serialized, files };
}

export async function exportDesignZip(rawHtml: string, promptText: string): Promise<void> {
  const cleaned = stripEditorAttrs(rawHtml);
  const { html, files } = await bundleAssets(cleaned);

  const zip = new JSZip();
  zip.file("index.html", html);
  for (const [path, blob] of files) zip.file(path, blob);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  zip.file(
    "README.txt",
    `Exported from Flowstep on ${stamp}.\n\nPrompt: ${promptText || "(none)"}\n\nOpen index.html in a browser. External CDN links (e.g. Tailwind, fonts) load at runtime; assets that resolved with CORS are bundled under /assets.\n`,
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(promptText)}-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function safeName(name: string): string {
  return (name || "design").toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "design";
}

// Render the design HTML into a hidden iframe and capture it as a PNG.
export async function exportDesignImage(rawHtml: string, promptText: string): Promise<void> {
  const cleaned = stripEditorAttrs(rawHtml);
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-20000px;top:0;width:1440px;height:960px;border:0;visibility:hidden;";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Could not prepare the image preview");
    doc.open();
    doc.write(cleaned);
    doc.close();

    await new Promise((r) => setTimeout(r, 800)); // let fonts/images settle

    const body = doc.body;
    const height = Math.min(Math.max(body.scrollHeight, 480), 24000);
    iframe.style.height = `${height}px`;
    await new Promise((r) => setTimeout(r, 200));

    const canvas = await html2canvas(body, {
      width: 1440,
      height,
      windowWidth: 1440,
      windowHeight: height,
      scale: 1,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image capture failed"))), "image/png");
    });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(promptText)}-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  } finally {
    iframe.remove();
  }
}
