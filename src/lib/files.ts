"use client";

import { shrinkFile } from "./image";

/** Where pictures (product photos, the company logo) are stored. Returns the URL to save on the product or in Settings. */
export type PictureStore = (file: File, kind: "product" | "logo") => Promise<string>;

/** Default: a small copy kept inside the record itself, so it works with no storage service at all. */
let store: PictureStore = (file, kind) => shrinkFile(file, kind === "logo" ? 600 : 640, 0.85);

export function setPictureStore(s: PictureStore) {
  store = s;
}

export const savePicture: PictureStore = (file, kind) => store(file, kind);
