import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { SessionUser, SessionVariables } from "../lib/session";
import type {
  Artwork,
  ArtworkRepository,
} from "../repositories/artwork-repository";
import type {
  ArtworkImage,
  ArtworkImageRepository,
  CreateArtworkImageInput,
} from "../repositories/image-repository";
import { type ImageRoutesDeps, createImageRoutes } from "./images";

// C3 画像ルート（FR-06 アップロード/並び替え / FR-07 R2 削除 / NFR-02 署名 URL / SEC-06）。
// repo / storage / auth は全てモック。DB / R2 / ネットワークに依存しない。

const OWNER: SessionUser = { id: "user-1", email: "owner@example.com" };
const OTHER: SessionUser = { id: "user-2", email: "other@example.com" };

/** in-memory な artwork リポジトリ（findById のみ使われる）。 */
function createMockArtworkRepo(seed: Artwork[] = []): ArtworkRepository {
  const store = new Map<string, Artwork>(seed.map((a) => [a.id, a]));
  return {
    create: async () => {
      throw new Error("not used");
    },
    findById: async (id) => store.get(id) ?? null,
    listByUser: async (userId) =>
      [...store.values()].filter((a) => a.userId === userId),
    update: async () => null,
    delete: async () => false,
  };
}

/** in-memory な画像リポジトリ。 */
function createMockImageRepo(seed: ArtworkImage[] = []): ArtworkImageRepository {
  const store = new Map<string, ArtworkImage>(seed.map((i) => [i.id, i]));
  let counter = seed.length;
  return {
    async create(input: CreateArtworkImageInput) {
      counter += 1;
      const row: ArtworkImage = {
        id: `img-${counter}`,
        artworkId: input.artworkId,
        userId: input.userId,
        r2Key: input.r2Key,
        width: input.width ?? null,
        height: input.height ?? null,
        sortOrder: input.sortOrder,
        createdAt: new Date("2026-06-21T00:00:00Z"),
      };
      store.set(row.id, row);
      return row;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async listByArtwork(artworkId) {
      return [...store.values()]
        .filter((i) => i.artworkId === artworkId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async delete(id) {
      return store.delete(id);
    },
    async updateSortOrders(updates) {
      for (const u of updates) {
        const cur = store.get(u.id);
        if (cur) store.set(u.id, { ...cur, sortOrder: u.sortOrder });
      }
    },
  };
}

function seedArtwork(over: Partial<Artwork> = {}): Artwork {
  const now = new Date("2026-06-01T00:00:00Z");
  return {
    id: "art-1",
    userId: "user-1",
    artistProfileId: "profile-1",
    title: "Existing",
    description: null,
    status: "draft",
    isPublic: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function seedImage(over: Partial<ArtworkImage> = {}): ArtworkImage {
  return {
    id: "img-1",
    artworkId: "art-1",
    userId: "user-1",
    r2Key: "artworks/seed.jpg",
    width: null,
    height: null,
    sortOrder: 0,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

interface MockStorage {
  presignPutUrl: ReturnType<typeof vi.fn>;
  deleteObject: ReturnType<typeof vi.fn>;
  objectEndpoint: ReturnType<typeof vi.fn>;
}

function createMockStorage(): MockStorage {
  return {
    presignPutUrl: vi.fn(
      async (key: string) => `https://signed.example/${key}?sig=abc`,
    ),
    deleteObject: vi.fn(async () => {}),
    objectEndpoint: vi.fn((key: string) => `https://r2.example/${key}`),
  };
}

/** 決定的な generateId（連番）。 */
function createSeqId(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `rand-${n}`;
  };
}

function buildApp(
  user: SessionUser | null,
  deps: {
    imageRepo: ArtworkImageRepository;
    artworkRepo: ArtworkRepository;
    storage: MockStorage;
    generateId?: () => string;
  },
) {
  const app = new Hono<{ Variables: SessionVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", user ? { id: "s", userId: user.id } : null);
    await next();
  });
  app.route(
    "/",
    createImageRoutes({
      imageRepo: deps.imageRepo,
      artworkRepo: deps.artworkRepo,
      // モック storage は StorageClient の利用部分（presignPutUrl/deleteObject）のみ満たす。
      storage: deps.storage as unknown as ImageRoutesDeps["storage"],
      generateId: deps.generateId ?? createSeqId(),
    }),
  );
  return app;
}

describe("createImageRoutes — 認証", () => {
  it("未認証は 401（uploads/sign）", async () => {
    const app = buildApp(null, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage: createMockStorage(),
    });
    const res = await app.request("/uploads/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ext: "jpg" }),
    });
    expect(res.status).toBe(401);
  });

  it("未認証は 401（画像メタ作成）", async () => {
    const app = buildApp(null, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo([seedArtwork()]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ r2Key: "artworks/x.jpg" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /uploads/sign", () => {
  it("artworks/ 形のキーで presignPutUrl を呼び uploadUrl を返す", async () => {
    const storage = createMockStorage();
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage,
      generateId: () => "fixed-id",
    });
    const res = await app.request("/uploads/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ext: "jpg", contentType: "image/jpeg" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { uploadUrl: string; r2Key: string };
    expect(body.r2Key).toBe("artworks/fixed-id.jpg");
    expect(body.uploadUrl).toContain("artworks/fixed-id.jpg");
    expect(storage.presignPutUrl).toHaveBeenCalledWith("artworks/fixed-id.jpg", {
      contentType: "image/jpeg",
    });
  });

  it("contentType 省略時も r2Key を返す", async () => {
    const storage = createMockStorage();
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage,
      generateId: () => "fixed-id",
    });
    const res = await app.request("/uploads/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ext: "png" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { r2Key: string };
    expect(body.r2Key).toBe("artworks/fixed-id.png");
  });

  it("ext が欠落なら 400", async () => {
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage: createMockStorage(),
    });
    const res = await app.request("/uploads/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /artworks/:id/images", () => {
  it("所有者なら 201・sortOrder 連番・userId サーバー付与", async () => {
    const imageRepo = createMockImageRepo([
      seedImage({ id: "img-1", sortOrder: 0 }),
      seedImage({ id: "img-2", sortOrder: 1 }),
    ]);
    const app = buildApp(OWNER, {
      imageRepo,
      artworkRepo: createMockArtworkRepo([seedArtwork()]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        r2Key: "artworks/new.jpg",
        width: 800,
        height: 600,
        userId: "attacker",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ArtworkImage;
    expect(body.r2Key).toBe("artworks/new.jpg");
    expect(body.sortOrder).toBe(2);
    expect(body.userId).toBe("user-1");
    expect(body.width).toBe(800);
    expect(body.height).toBe(600);
    expect(body.artworkId).toBe("art-1");
  });

  it("画像が無い artwork では sortOrder 0 始まり", async () => {
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo([seedArtwork()]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ r2Key: "artworks/first.jpg" }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as ArtworkImage).sortOrder).toBe(0);
  });

  it("他人の artwork は 403", async () => {
    const app = buildApp(OTHER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo([seedArtwork({ userId: "user-1" })]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ r2Key: "artworks/x.jpg" }),
    });
    expect(res.status).toBe(403);
  });

  it("存在しない artwork は 404", async () => {
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/missing/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ r2Key: "artworks/x.jpg" }),
    });
    expect(res.status).toBe(404);
  });

  it("r2Key が欠落なら 400", async () => {
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo([seedArtwork()]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ width: 100 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /images/:id", () => {
  it("所有者なら storage.deleteObject を呼び DB から消して 204", async () => {
    const storage = createMockStorage();
    const imageRepo = createMockImageRepo([
      seedImage({ id: "img-1", r2Key: "artworks/del.jpg", userId: "user-1" }),
    ]);
    const app = buildApp(OWNER, {
      imageRepo,
      artworkRepo: createMockArtworkRepo(),
      storage,
    });
    const res = await app.request("/images/img-1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(storage.deleteObject).toHaveBeenCalledWith("artworks/del.jpg");
    expect(await imageRepo.findById("img-1")).toBeNull();
  });

  it("他人の画像は 403（R2 も DB も消さない）", async () => {
    const storage = createMockStorage();
    const imageRepo = createMockImageRepo([
      seedImage({ id: "img-1", userId: "user-1" }),
    ]);
    const app = buildApp(OTHER, {
      imageRepo,
      artworkRepo: createMockArtworkRepo(),
      storage,
    });
    const res = await app.request("/images/img-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(await imageRepo.findById("img-1")).not.toBeNull();
  });

  it("存在しない画像は 404", async () => {
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage: createMockStorage(),
    });
    const res = await app.request("/images/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /artworks/:id/images/order", () => {
  it("所有者なら正しい差分で updateSortOrders を呼ぶ", async () => {
    const imageRepo = createMockImageRepo([
      seedImage({ id: "img-1", sortOrder: 0 }),
      seedImage({ id: "img-2", sortOrder: 1 }),
      seedImage({ id: "img-3", sortOrder: 2 }),
    ]);
    const spy = vi.spyOn(imageRepo, "updateSortOrders");
    const app = buildApp(OWNER, {
      imageRepo,
      artworkRepo: createMockArtworkRepo([seedArtwork()]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // 逆順に並び替え。
      body: JSON.stringify({ orderedIds: ["img-3", "img-2", "img-1"] }),
    });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const updates = spy.mock.calls[0]![0];
    // img-3 -> 0, img-1 -> 2 が変化（img-2 は 1 のまま => 差分外）。
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.sortOrder]));
    expect(byId["img-3"]).toBe(0);
    expect(byId["img-1"]).toBe(2);
    expect(byId["img-2"]).toBeUndefined();
    // 反映後の並び。
    const after = await imageRepo.listByArtwork("art-1");
    expect(after.map((i) => i.id)).toEqual(["img-3", "img-2", "img-1"]);
  });

  it("他人の artwork は 403", async () => {
    const app = buildApp(OTHER, {
      imageRepo: createMockImageRepo([seedImage({ id: "img-1" })]),
      artworkRepo: createMockArtworkRepo([seedArtwork({ userId: "user-1" })]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: ["img-1"] }),
    });
    expect(res.status).toBe(403);
  });

  it("存在しない artwork は 404", async () => {
    const app = buildApp(OWNER, {
      imageRepo: createMockImageRepo(),
      artworkRepo: createMockArtworkRepo(),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/missing/images/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("当該 artwork に属さない画像 id は弾く（差分から除外）", async () => {
    const imageRepo = createMockImageRepo([
      seedImage({ id: "img-1", artworkId: "art-1", sortOrder: 0 }),
      seedImage({ id: "img-2", artworkId: "art-1", sortOrder: 1 }),
    ]);
    const spy = vi.spyOn(imageRepo, "updateSortOrders");
    const app = buildApp(OWNER, {
      imageRepo,
      artworkRepo: createMockArtworkRepo([seedArtwork()]),
      storage: createMockStorage(),
    });
    const res = await app.request("/artworks/art-1/images/order", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // foreign-x は別 artwork（あるいは存在しない）想定。img-2, img-1 のみ有効。
      body: JSON.stringify({ orderedIds: ["foreign-x", "img-2", "img-1"] }),
    });
    expect(res.status).toBe(200);
    const updates = spy.mock.calls[0]![0];
    const ids = updates.map((u) => u.id);
    expect(ids).not.toContain("foreign-x");
    // 有効な並びは [img-2, img-1] として正規化される。
    const after = await imageRepo.listByArtwork("art-1");
    expect(after.map((i) => i.id)).toEqual(["img-2", "img-1"]);
  });
});
