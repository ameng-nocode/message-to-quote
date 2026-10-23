"use client";

async function load(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const i = new Image();
    // pictures from another site (a shop's image link) can only be copied when loaded this way
    if (/^https?:/.test(src)) i.crossOrigin = "anonymous";
    i.onload = () => ok(i);
    i.onerror = bad;
    i.src = src;
  });
}

function draw(img: HTMLImageElement, max: number, quality: number): string {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

/** Shrink a photo in the browser so the upload stays small (longest side `max` px, JPEG). */
export async function shrinkFile(file: File, max = 1024, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return draw(await load(url), max, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink an image that is already a data URL, e.g. to keep a small copy of a customer's screenshot with the quotation. */
export async function shrinkDataUrl(src: string, max = 640, quality = 0.72): Promise<string> {
  return draw(await load(src), max, quality);
}

export const imageFiles = (files: FileList | File[] | null | undefined) => Array.from(files || []).filter((f) => f.type.startsWith("image/"));

/** Small copies of product pictures for the AI to compare a customer's photo with. Made once per picture, kept in memory. */
const thumbCache = new Map<string, Promise<string | null>>();
/** Small product pictures for the AI, up to `budget` characters in all (hosts like Vercel refuse requests over 4.5 MB). */
export async function productThumbs(list: { id: string; photo: string }[], budget = Infinity): Promise<{ id: string; src: string }[]> {
  const out = await Promise.all(
    list
      .filter((p) => p.photo)
      .map(async (p) => {
        let job = thumbCache.get(p.photo);
        if (!job) {
          job = load(p.photo)
            .then((img) => draw(img, 192, 0.7))
            .catch(() => null);
          thumbCache.set(p.photo, job);
        }
        const src = await job;
        return src ? { id: p.id, src } : null;
      }),
  );
  const kept: { id: string; src: string }[] = [];
  let used = 0;
  for (const t of out) {
    if (!t || used + t.src.length > budget) continue;
    used += t.src.length;
    kept.push(t);
  }
  return kept;
}
