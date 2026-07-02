import { artwork, artworkImage, createDb } from "@artwork/database";
import { and, asc, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { authGuard, type AuthVariables } from "../lib/auth-guard";

const PUBLIC_STATUSES = ["draft", "public", "archived"] as const;
type PublicStatus = (typeof PUBLIC_STATUSES)[number];

const STATUSES = ["in_progress", "available", "sold"] as const;
type Status = (typeof STATUSES)[number];

// 作成・更新の入力。ワイヤーフレーム段階の手検証（zod 等は未導入）。
type ArtworkInput = {
  title: string;
  description: string | null;
  status: Status | null;
  publicStatus: PublicStatus;
  medium: string | null;
  artType: string | null;
  condition: string | null;
  heightMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  weightG: number | null;
  /** 保存時に紐付ける画像 id（表示順）。リスト外の紐付け済み画像は外す（孤児化）。 */
  imageIds: string[];
};

function parseInput(body: unknown): ArtworkInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || b.title.trim() === "") return null;

  const optText = (v: unknown) =>
    typeof v === "string" && v.trim() !== "" ? v : null;
  const optInt = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
  const publicStatus = PUBLIC_STATUSES.includes(b.publicStatus as PublicStatus)
    ? (b.publicStatus as PublicStatus)
    : "draft";

  return {
    title: b.title.trim(),
    description: optText(b.description),
    status: STATUSES.includes(b.status as Status) ? (b.status as Status) : null,
    publicStatus,
    medium: optText(b.medium),
    artType: optText(b.artType),
    condition: optText(b.condition),
    heightMm: optInt(b.heightMm),
    widthMm: optInt(b.widthMm),
    depthMm: optInt(b.depthMm),
    weightG: optInt(b.weightG),
    imageIds: Array.isArray(b.imageIds)
      ? b.imageIds.filter((v): v is string => typeof v === "string")
      : [],
  };
}

type Db = ReturnType<typeof createDb>;

// 保存時の画像同期。imageIds（表示順）を紐付け、リスト外は外して孤児に戻す。
// 対象は自分の画像のみ（未紐付け or この作品に紐付け済み）。
async function syncImages(
  db: Db,
  userId: string,
  artworkId: string,
  imageIds: string[],
) {
  const detachWhere = and(
    eq(artworkImage.userId, userId),
    eq(artworkImage.artworkId, artworkId),
    ...(imageIds.length > 0 ? [notInArray(artworkImage.id, imageIds)] : []),
  );
  await db
    .update(artworkImage)
    .set({ artworkId: null, updatedAt: new Date() })
    .where(detachWhere);

  for (const [i, id] of imageIds.entries()) {
    await db
      .update(artworkImage)
      .set({ artworkId, sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(artworkImage.id, id),
          eq(artworkImage.userId, userId),
          or(isNull(artworkImage.artworkId), eq(artworkImage.artworkId, artworkId)),
        ),
      );
  }
}

function listImages(db: Db, userId: string, artworkId: string) {
  return db
    .select()
    .from(artworkImage)
    .where(
      and(
        eq(artworkImage.userId, userId),
        eq(artworkImage.artworkId, artworkId),
      ),
    )
    .orderBy(asc(artworkImage.sortOrder));
}

// 自分の作品の CRUD。一覧・詳細とも所有者のみ（公開ページは別途）。
export const artworksRoute = new Hono<{
  Bindings: AppBindings;
  Variables: AuthVariables;
}>()
  .use(authGuard)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const db = createDb(c.env.DATABASE_URL);
    const rows = await db
      .select()
      .from(artwork)
      .where(eq(artwork.userId, userId))
      .orderBy(desc(artwork.createdAt));

    // 一覧サムネイル用に各作品の先頭画像（sort_order 最小）を付ける。
    const images =
      rows.length > 0
        ? await db
            .select()
            .from(artworkImage)
            .where(
              and(
                eq(artworkImage.userId, userId),
                inArray(
                  artworkImage.artworkId,
                  rows.map((r) => r.id),
                ),
              ),
            )
            .orderBy(asc(artworkImage.sortOrder))
        : [];
    const thumbnailByArtwork = new Map<string, (typeof images)[number]>();
    for (const img of images) {
      if (img.artworkId && !thumbnailByArtwork.has(img.artworkId)) {
        thumbnailByArtwork.set(img.artworkId, img);
      }
    }
    return c.json({
      artworks: rows.map((r) => ({
        ...r,
        thumbnail: thumbnailByArtwork.get(r.id) ?? null,
      })),
    });
  })
  .post("/", async (c) => {
    const input = parseInput(await c.req.json().catch(() => null));
    if (!input) return c.json({ error: "invalid input" }, 400);
    const { imageIds, ...values } = input;
    const userId = c.get("userId");
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .insert(artwork)
      .values({ ...values, userId })
      .returning();
    if (!row) return c.json({ error: "insert failed" }, 500);
    await syncImages(db, userId, row.id, imageIds);
    return c.json({ artwork: row }, 201);
  })
  .get("/:id", async (c) => {
    const userId = c.get("userId");
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .select()
      .from(artwork)
      .where(and(eq(artwork.id, c.req.param("id")), eq(artwork.userId, userId)));
    if (!row) return c.json({ error: "not found" }, 404);
    const images = await listImages(db, userId, row.id);
    return c.json({ artwork: row, images });
  })
  .put("/:id", async (c) => {
    const input = parseInput(await c.req.json().catch(() => null));
    if (!input) return c.json({ error: "invalid input" }, 400);
    const { imageIds, ...values } = input;
    const userId = c.get("userId");
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .update(artwork)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(artwork.id, c.req.param("id")), eq(artwork.userId, userId)))
      .returning();
    if (!row) return c.json({ error: "not found" }, 404);
    await syncImages(db, userId, row.id, imageIds);
    return c.json({ artwork: row });
  })
  .delete("/:id", async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .delete(artwork)
      .where(
        and(
          eq(artwork.id, c.req.param("id")),
          eq(artwork.userId, c.get("userId")),
        ),
      )
      .returning({ id: artwork.id });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });
