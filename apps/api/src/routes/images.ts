import { artworkImage, createDb } from "@artwork/database";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { authGuard, type AuthVariables } from "../lib/auth-guard";
import { createStorage } from "../lib/storage";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB（ワイヤーフレーム段階の上限）

// 画像のアップロード（未紐付けで作成）と配信。紐付けは artworks ルートの保存時に行う。
export const imagesRoute = new Hono<{
  Bindings: AppBindings;
  Variables: AuthVariables;
}>()
  .use(authGuard)
  // presigned アップロード。行を未紐付けで作成し、ブラウザが R2 へ直接 PUT する。
  // body: { contentType, size, width?, height? }
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      contentType?: unknown;
      size?: unknown;
      width?: unknown;
      height?: unknown;
    } | null;
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    if (!ALLOWED_TYPES.has(contentType)) {
      return c.json({ error: "unsupported content-type" }, 400);
    }
    const size = typeof body?.size === "number" ? body.size : 0;
    if (!Number.isInteger(size) || size <= 0 || size > MAX_BYTES) {
      return c.json({ error: "invalid size" }, 400);
    }

    const userId = c.get("userId");
    const ext = (contentType.split("/")[1] ?? "bin").replace("jpeg", "jpg");
    const storageKey = `images/${userId}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await createStorage(c.env).presignPut(storageKey);

    const toInt = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .insert(artworkImage)
      .values({
        userId,
        storageKey,
        // artworkId は NULL のまま = 未紐付け。作品保存時に attach。
        // PUT されなかった場合も孤児クリーンアップ（artwork_id IS NULL）が回収する。
        width: toInt(body?.width),
        height: toInt(body?.height),
      })
      .returning();
    return c.json({ image: row, uploadUrl }, 201);
  })
  // 所有者のみ配信（ワイヤーフレーム段階は公開ページ無しのためこれで十分）。
  .get("/:id/file", async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .select()
      .from(artworkImage)
      .where(
        and(
          eq(artworkImage.id, c.req.param("id")),
          eq(artworkImage.userId, c.get("userId")),
        ),
      );
    if (!row) return c.json({ error: "not found" }, 404);

    const obj = await createStorage(c.env).get(row.storageKey);
    if (!obj.ok) return c.json({ error: "object missing" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
