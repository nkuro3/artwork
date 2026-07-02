import { artwork, createDb } from "@artwork/database";
import { and, desc, eq } from "drizzle-orm";
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
  };
}

// 自分の作品の CRUD。一覧・詳細とも所有者のみ（公開ページは別途）。
export const artworksRoute = new Hono<{
  Bindings: AppBindings;
  Variables: AuthVariables;
}>()
  .use(authGuard)
  .get("/", async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const rows = await db
      .select()
      .from(artwork)
      .where(eq(artwork.userId, c.get("userId")))
      .orderBy(desc(artwork.createdAt));
    return c.json({ artworks: rows });
  })
  .post("/", async (c) => {
    const input = parseInput(await c.req.json().catch(() => null));
    if (!input) return c.json({ error: "invalid input" }, 400);
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .insert(artwork)
      .values({ ...input, userId: c.get("userId") })
      .returning();
    return c.json({ artwork: row }, 201);
  })
  .get("/:id", async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .select()
      .from(artwork)
      .where(
        and(
          eq(artwork.id, c.req.param("id")),
          eq(artwork.userId, c.get("userId")),
        ),
      );
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ artwork: row });
  })
  .put("/:id", async (c) => {
    const input = parseInput(await c.req.json().catch(() => null));
    if (!input) return c.json({ error: "invalid input" }, 400);
    const db = createDb(c.env.DATABASE_URL);
    const [row] = await db
      .update(artwork)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(artwork.id, c.req.param("id")),
          eq(artwork.userId, c.get("userId")),
        ),
      )
      .returning();
    if (!row) return c.json({ error: "not found" }, 404);
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
