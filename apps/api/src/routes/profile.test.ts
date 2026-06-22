import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { SessionUser, SessionVariables } from "../lib/session";
import { isValidSlug } from "../lib/slug";
import type {
  ArtistProfile,
  ArtistProfileRepository,
  CreateArtistProfileInput,
} from "../repositories/artist-profile-repository";
import { createProfileRoutes } from "./profile";

// C7 プロフィール API（FR-03 lazy init / FR-11 slug / FR-10・SEC-01 所有は自分のみ）。
// repo は in-memory モック、auth はモック。DB / ネットワークに依存しない。

/** id 採番だけ簡易にした in-memory プロフィールリポジトリ。 */
function createMockRepo(seed: ArtistProfile[] = []): ArtistProfileRepository {
  const store = new Map<string, ArtistProfile>(seed.map((p) => [p.userId, p]));
  let counter = seed.length;

  return {
    async getByUserId(userId) {
      return store.get(userId) ?? null;
    },
    async create(input: CreateArtistProfileInput) {
      counter += 1;
      const now = new Date("2026-06-22T00:00:00Z");
      const row: ArtistProfile = {
        id: `profile-${counter}`,
        userId: input.userId,
        slug: input.slug,
        displayName: input.displayName ?? "",
        bio: input.bio ?? null,
        isPublic: true,
        createdAt: now,
        updatedAt: now,
      };
      store.set(row.userId, row);
      return row;
    },
    async updateByUserId(userId, patch) {
      const cur = store.get(userId);
      if (!cur) return null;
      const next: ArtistProfile = {
        ...cur,
        ...patch,
        updatedAt: new Date(),
      };
      store.set(userId, next);
      return next;
    },
    async isSlugTaken(slug, exceptUserId) {
      for (const p of store.values()) {
        if (p.slug === slug && p.userId !== exceptUserId) return true;
      }
      return false;
    },
  };
}

const OWNER: SessionUser = { id: "user-1", email: "owner@example.com" };

function seedProfile(over: Partial<ArtistProfile> = {}): ArtistProfile {
  const now = new Date("2026-06-01T00:00:00Z");
  return {
    id: "profile-1",
    userId: "user-1",
    slug: "alice",
    displayName: "Alice",
    bio: null,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/**
 * セッション middleware を差し替えるテスト用 app を組む。
 * `user` を直接 context に載せる（getSession の実体には依存しない）。
 */
function buildApp(repo: ArtistProfileRepository, user: SessionUser | null) {
  const app = new Hono<{ Variables: SessionVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", user ? { id: "s", userId: user.id } : null);
    await next();
  });
  app.route("/profile", createProfileRoutes({ profileRepo: repo }));
  return app;
}

describe("createProfileRoutes — 認証", () => {
  it("未認証は 401（GET）", async () => {
    const app = buildApp(createMockRepo(), null);
    const res = await app.request("/profile");
    expect(res.status).toBe(401);
  });

  it("未認証は 401（PATCH）", async () => {
    const app = buildApp(createMockRepo(), null);
    const res = await app.request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /profile", () => {
  it("既存プロフィールをそのまま返す", async () => {
    const repo = createMockRepo([seedProfile()]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/profile");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ArtistProfile;
    expect(body.userId).toBe("user-1");
    expect(body.slug).toBe("alice");
  });

  it("無ければ lazy init で仮 slug のプロフィールを作成して返す（FR-03）", async () => {
    const repo = createMockRepo();
    const app = buildApp(repo, OWNER);
    const res = await app.request("/profile");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ArtistProfile;
    expect(body.userId).toBe("user-1");
    // 仮 slug は妥当（B2 isValidSlug を満たす）。
    expect(isValidSlug(body.slug)).toBe(true);
    // 永続化されている（2 回目は同じものを返す＝重複作成しない）。
    const again = await (await buildApp(repo, OWNER).request("/profile")).json();
    expect((again as ArtistProfile).slug).toBe(body.slug);
  });

  it("lazy init の仮 slug が他者と衝突するなら一意化する", async () => {
    // provisional は user.id から決定的なので、別 repo で OWNER の仮 slug を先に求める。
    const probeRes = await buildApp(createMockRepo(), OWNER).request("/profile");
    const probeSlug = ((await probeRes.json()) as ArtistProfile).slug;

    // その slug を user-2 が既に握っている状況を作り、OWNER の lazy init を衝突させる。
    const repo = createMockRepo([
      seedProfile({ id: "profile-2", userId: "user-2", slug: probeSlug }),
    ]);

    const res = await buildApp(repo, OWNER).request("/profile");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ArtistProfile;
    expect(body.userId).toBe("user-1");
    expect(isValidSlug(body.slug)).toBe(true);
    // 衝突回避され、user-2 の slug とは異なる。
    expect(body.slug).not.toBe(probeSlug);
  });
});

describe("PATCH /profile", () => {
  it("displayName 空は 400", async () => {
    const repo = createMockRepo([seedProfile()]);
    const res = await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("slug が不正（予約語）は 400", async () => {
    const repo = createMockRepo([seedProfile()]);
    const res = await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "admin" }),
    });
    expect(res.status).toBe(400);
  });

  it("slug が他者で使用中なら 400（明示指定は一意化せず拒否）", async () => {
    const repo = createMockRepo([
      seedProfile(),
      seedProfile({ id: "profile-2", userId: "user-2", slug: "taken" }),
    ]);
    const res = await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "taken" }),
    });
    expect(res.status).toBe(400);
  });

  it("自分の現在の slug を据え置く更新は通る", async () => {
    const repo = createMockRepo([seedProfile({ slug: "alice" })]);
    const res = await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Alice 2", slug: "alice" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ArtistProfile;
    expect(body.slug).toBe("alice");
    expect(body.displayName).toBe("Alice 2");
  });

  it("正常更新が反映される（displayName/slug/bio/isPublic）", async () => {
    const repo = createMockRepo([seedProfile()]);
    const res = await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Alice New",
        slug: "alice-new",
        bio: "hi",
        isPublic: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ArtistProfile;
    expect(body.displayName).toBe("Alice New");
    expect(body.slug).toBe("alice-new");
    expect(body.bio).toBe("hi");
  });

  it("プロフィール未作成でも PATCH は lazy init してから更新する", async () => {
    const repo = createMockRepo();
    const res = await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Fresh" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ArtistProfile;
    expect(body.userId).toBe("user-1");
    expect(body.displayName).toBe("Fresh");
  });

  it("他者の userId は更新しない（current の userId のみ）", async () => {
    const repo = createMockRepo([
      seedProfile(),
      seedProfile({ id: "profile-2", userId: "user-2", slug: "bob" }),
    ]);
    await buildApp(repo, OWNER).request("/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Hacked" }),
    });
    const other = await repo.getByUserId("user-2");
    expect(other?.displayName).toBe("Alice"); // 変わっていない
  });
});
