import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { SessionUser, SessionVariables } from "../lib/session";
import type {
  Artwork,
  ArtworkRepository,
  CreateArtworkInput,
} from "../repositories/artwork-repository";
import { createArtworksRoutes } from "./artworks";

// C2 作品 CRUD ルート（FR-05,07,08,09,10 / SEC-01）。
// repo は in-memory モック、auth はモック。DB / ネットワークに依存しない。

/** id 採番だけ簡易にした in-memory リポジトリ。 */
function createMockRepo(seed: Artwork[] = []): ArtworkRepository {
  const store = new Map<string, Artwork>(seed.map((a) => [a.id, a]));
  let counter = seed.length;

  return {
    async create(input: CreateArtworkInput) {
      counter += 1;
      const now = new Date("2026-06-21T00:00:00Z");
      const row: Artwork = {
        id: `art-${counter}`,
        userId: input.userId,
        artistProfileId: input.artistProfileId,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "draft",
        isPublic: input.isPublic ?? false,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      store.set(row.id, row);
      return row;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async listByUser(userId) {
      return [...store.values()].filter((a) => a.userId === userId);
    },
    async update(id, patch) {
      const cur = store.get(id);
      if (!cur) return null;
      const next: Artwork = { ...cur, ...patch, updatedAt: new Date() };
      store.set(id, next);
      return next;
    },
    async delete(id) {
      return store.delete(id);
    },
  };
}

const OWNER: SessionUser = { id: "user-1", email: "owner@example.com" };
const OTHER: SessionUser = { id: "user-2", email: "other@example.com" };

const PROFILE_OF: Record<string, string> = {
  "user-1": "profile-1",
  "user-2": "profile-2",
};

/**
 * セッション middleware を差し替えるテスト用 app を組む。
 * `user` を直接 context に載せる（getSession の実体には依存しない）。
 */
function buildApp(repo: ArtworkRepository, user: SessionUser | null) {
  const app = new Hono<{ Variables: SessionVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", user ? { id: "s", userId: user.id } : null);
    await next();
  });
  app.route(
    "/artworks",
    createArtworksRoutes({
      repo,
      resolveArtistProfileId: async (userId) => PROFILE_OF[userId] ?? null,
    }),
  );
  return app;
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

describe("createArtworksRoutes — 認証", () => {
  it("未認証は 401（一覧）", async () => {
    const app = buildApp(createMockRepo(), null);
    const res = await app.request("/artworks");
    expect(res.status).toBe(401);
  });

  it("未認証は 401（作成）", async () => {
    const app = buildApp(createMockRepo(), null);
    const res = await app.request("/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /artworks", () => {
  it("認証ありで 201、userId はサーバー付与（リクエストの userId は無視）", async () => {
    const repo = createMockRepo();
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "My Art",
        userId: "attacker",
        artistProfileId: "evil-profile",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Artwork;
    expect(body.title).toBe("My Art");
    expect(body.userId).toBe("user-1");
    expect(body.artistProfileId).toBe("profile-1");
    expect(body.status).toBe("draft");
    expect(body.isPublic).toBe(false);
  });

  it("status / sortOrder / isPublic / description を受け付ける", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Pub",
        description: "desc",
        status: "published",
        isPublic: true,
        sortOrder: 5,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Artwork;
    expect(body.status).toBe("published");
    expect(body.isPublic).toBe(true);
    expect(body.sortOrder).toBe(5);
    expect(body.description).toBe("desc");
  });

  it("title が空なら 400", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("title 欠落なら 400", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "no title" }),
    });
    expect(res.status).toBe(400);
  });

  it("status が不正値なら 400", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", status: "archived" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /artworks", () => {
  it("自分の作品だけ返る", async () => {
    const repo = createMockRepo([
      seedArtwork({ id: "art-1", userId: "user-1", title: "Mine" }),
      seedArtwork({ id: "art-2", userId: "user-2", title: "Theirs" }),
      seedArtwork({ id: "art-3", userId: "user-1", title: "Mine2" }),
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Artwork[];
    expect(body.map((a) => a.id).sort()).toEqual(["art-1", "art-3"]);
  });
});

describe("GET /artworks/:id", () => {
  it("所有していれば 200", async () => {
    const repo = createMockRepo([seedArtwork({ id: "art-1", userId: "user-1" })]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks/art-1");
    expect(res.status).toBe(200);
    expect(((await res.json()) as Artwork).id).toBe("art-1");
  });

  it("他人の作品は 403", async () => {
    const repo = createMockRepo([seedArtwork({ id: "art-1", userId: "user-1" })]);
    const app = buildApp(repo, OTHER);
    const res = await app.request("/artworks/art-1");
    expect(res.status).toBe(403);
  });

  it("存在しなければ 404", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks/missing");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /artworks/:id", () => {
  it("所有していれば更新が反映される（status / sortOrder）", async () => {
    const repo = createMockRepo([
      seedArtwork({ id: "art-1", userId: "user-1", status: "draft", sortOrder: 0 }),
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks/art-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "published", sortOrder: 9, title: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Artwork;
    expect(body.status).toBe("published");
    expect(body.sortOrder).toBe(9);
    expect(body.title).toBe("Renamed");
  });

  it("他人の作品は 403（更新もされない）", async () => {
    const repo = createMockRepo([
      seedArtwork({ id: "art-1", userId: "user-1", title: "Orig" }),
    ]);
    const app = buildApp(repo, OTHER);
    const res = await app.request("/artworks/art-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Hacked" }),
    });
    expect(res.status).toBe(403);
    expect((await repo.findById("art-1"))?.title).toBe("Orig");
  });

  it("存在しなければ 404", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks/missing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("status が不正値なら 400", async () => {
    const repo = createMockRepo([seedArtwork({ id: "art-1", userId: "user-1" })]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks/art-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("title を空文字に更新しようとすると 400", async () => {
    const repo = createMockRepo([seedArtwork({ id: "art-1", userId: "user-1" })]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks/art-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "  " }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /artworks/:id", () => {
  it("所有していれば 204 で削除される", async () => {
    const repo = createMockRepo([seedArtwork({ id: "art-1", userId: "user-1" })]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/artworks/art-1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(await repo.findById("art-1")).toBeNull();
  });

  it("他人の作品は 403（削除もされない）", async () => {
    const repo = createMockRepo([seedArtwork({ id: "art-1", userId: "user-1" })]);
    const app = buildApp(repo, OTHER);
    const res = await app.request("/artworks/art-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(await repo.findById("art-1")).not.toBeNull();
  });

  it("存在しなければ 404", async () => {
    const app = buildApp(createMockRepo(), OWNER);
    const res = await app.request("/artworks/missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
