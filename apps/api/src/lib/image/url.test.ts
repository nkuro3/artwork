import { describe, expect, it } from "vitest";

import {
  buildImageUrl,
  IMAGE_WIDTHS,
  largeUrl,
  thumbnailUrl,
} from "./url";

const BASE = "https://img.example.com";
const KEY = "artworks/abc/original.jpg";

describe("buildImageUrl", () => {
  it("emits only the width option when only width is given", () => {
    expect(buildImageUrl(BASE, KEY, { width: 400 })).toBe(
      `${BASE}/cdn-cgi/image/width=400/${KEY}`,
    );
  });

  it("joins multiple options with commas", () => {
    expect(
      buildImageUrl(BASE, KEY, {
        width: 800,
        quality: 80,
        format: "webp",
        fit: "cover",
      }),
    ).toBe(`${BASE}/cdn-cgi/image/width=800,quality=80,format=webp,fit=cover/${KEY}`);
  });

  it("omits keys that are not specified", () => {
    const url = buildImageUrl(BASE, KEY, { width: 400 });
    expect(url).not.toContain("height");
    expect(url).not.toContain("quality");
    expect(url).not.toContain("fit");
  });

  it("includes height when specified", () => {
    expect(buildImageUrl(BASE, KEY, { height: 300 })).toBe(
      `${BASE}/cdn-cgi/image/height=300/${KEY}`,
    );
  });

  it("normalizes a trailing slash on baseUrl (no double slash)", () => {
    expect(buildImageUrl(`${BASE}/`, KEY, { width: 400 })).toBe(
      `${BASE}/cdn-cgi/image/width=400/${KEY}`,
    );
  });

  it("normalizes a leading slash on r2Key (no double slash)", () => {
    expect(buildImageUrl(BASE, `/${KEY}`, { width: 400 })).toBe(
      `${BASE}/cdn-cgi/image/width=400/${KEY}`,
    );
  });

  it("normalizes both trailing baseUrl slash and leading key slash", () => {
    expect(buildImageUrl(`${BASE}/`, `/${KEY}`, { width: 400 })).toBe(
      `${BASE}/cdn-cgi/image/width=400/${KEY}`,
    );
  });

  it("does not produce double slashes anywhere after the scheme", () => {
    const url = buildImageUrl(`${BASE}/`, `/${KEY}`, { width: 400 });
    expect(url.replace("https://", "")).not.toContain("//");
  });
});

describe("thumbnailUrl", () => {
  it("builds a thumbnail-width URL", () => {
    expect(thumbnailUrl(BASE, KEY)).toBe(
      `${BASE}/cdn-cgi/image/width=${IMAGE_WIDTHS.thumbnail},format=auto/${KEY}`,
    );
  });

  it("uses the thumbnail width constant", () => {
    expect(IMAGE_WIDTHS.thumbnail).toBe(400);
  });
});

describe("largeUrl", () => {
  it("builds a large-width URL", () => {
    expect(largeUrl(BASE, KEY)).toBe(
      `${BASE}/cdn-cgi/image/width=${IMAGE_WIDTHS.large},format=auto/${KEY}`,
    );
  });

  it("uses the large width constant", () => {
    expect(IMAGE_WIDTHS.large).toBe(1600);
  });
});
