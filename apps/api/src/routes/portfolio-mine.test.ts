import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { thumbnailUrl } from "../lib/image/url";
import type { SessionUser, SessionVariables } from "../lib/session";
import type {
  PortfolioEditableArtwork,
  PortfolioItemRepository,
} from "../repositories/portfolio-item-repository";
import { createPortfolioMineRoutes } from "./portfolio-mine";

// §6.12 ポートフォリオ編集 API（要ログイン / FR-12,13 / ADR D12 / SEC-01）。
// repo は in-memory モック。auth はモック。DB / ネットワーク非依存。

const IMAGE_BASE_URL = "https://img.example.com";

const OWNER: SessionUser = { id: "user-1", email: "owner@example.com" };

/**
 * 自分の公開作品集合を保持する in-memory リポジトリ。
 * `replaceForUser` は所有者ごとの掲載 id 配列を保持し、`listPublishedForUser`
 * の `inPortfolio`/`position` に反映する。published 集合外の置換は呼び出し側で弾く前提。
 */
function createMockRepo(
  published: PortfolioEditableArtwork[],
): PortfolioItemRepository & { lastReplace?: { userId: string; ids: string[] } } {
  // 現在の掲載順（id 配列）。seed の position から復元。
  let order: string[] = published
    .filter((a) => a.position !== null)
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((a) => a.id);

  const repo: PortfolioItemRepository & {
    lastReplace?: { userId: string; ids: string[] };
  } = {
    async listPublishedForUser() {
      const items: PortfolioEditableArtwork[] = published.map((a) => {
        const idx = order.indexOf(a.id);
        return {
          id: a.id,
          title: a.title,
          thumbnailR2Key: a.thumbnailR2Key,
          inPortfolio: idx !== -1,
          position: idx === -1 ? null : idx,
        };
      });
      return items.sort((a, b) => {
        if (a.position === null && b.position === null) return 0;
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position;
      });
    },
    async replaceForUser(userId, artworkIds) {
      repo.lastReplace = { userId, ids: artworkIds };
      order = [...artworkIds];
    },
  };
  return repo;
}

function buildApp(
  repo: PortfolioItemRepository,
  user: SessionUser | null,
) {
  const app = new Hono<{ Variables: SessionVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", user);
    c.set("session", user ? { id: "s", userId: user.id } : null);
    await next();
  });
  app.route(
    "/portfolio",
    createPortfolioMineRoutes({ portfolioItemRepo: repo, imageBaseUrl: IMAGE_BASE_URL }),
  );
  return app;
}

function art(over: Partial<PortfolioEditableArtwork> & { id: string }): PortfolioEditableArtwork {
  return {
    title: over.id,
    inPortfolio: false,
    position: null,
    thumbnailR2Key: null,
    ...over,
  };
}

describe("GET /portfolio/mine — 認証", () => {
  it("未認証は 401", async () => {
    const app = buildApp(createMockRepo([]), null);
    const res = await app.request("/portfolio/mine");
    expect(res.status).toBe(401);
  });
});

describe("GET /portfolio/mine", () => {
  it("自分の公開作品を inPortfolio / position 付きで返す", async () => {
    const repo = createMockRepo([
      art({ id: "a", title: "A", position: 1, thumbnailR2Key: "k/a.jpg" }),
      art({ id: "b", title: "B", position: 0 }),
      art({ id: "c", title: "C" }), // 未掲載
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      title: string;
      inPortfolio: boolean;
      position: number | null;
      thumbnailUrl: string | null;
    }[];
    // 掲載中（position 昇順）→ 未掲載。
    expect(body.map((x) => x.id)).toEqual(["b", "a", "c"]);
    const a = body.find((x) => x.id === "a");
    expect(a?.inPortfolio).toBe(true);
    expect(a?.position).toBe(1);
    expect(a?.thumbnailUrl).toBe(thumbnailUrl(IMAGE_BASE_URL, "k/a.jpg"));
    const c = body.find((x) => x.id === "c");
    expect(c?.inPortfolio).toBe(false);
    expect(c?.position).toBeNull();
    expect(c?.thumbnailUrl).toBeNull();
  });

  it("内部キー r2Key は DTO に漏らさない（ADR D5）", async () => {
    const repo = createMockRepo([
      art({ id: "a", title: "A", thumbnailR2Key: "k/a.jpg" }),
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine");
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body[0]).not.toHaveProperty("thumbnailR2Key");
    expect(body[0]).not.toHaveProperty("r2Key");
  });
});

describe("PUT /portfolio/mine — 認証", () => {
  it("未認証は 401", async () => {
    const app = buildApp(createMockRepo([]), null);
    const res = await app.request("/portfolio/mine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artworkIds: [] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("PUT /portfolio/mine", () => {
  it("公開・所有の作品 id 配列で掲載集合を置換する（position=index）", async () => {
    const repo = createMockRepo([
      art({ id: "a", title: "A" }),
      art({ id: "b", title: "B" }),
      art({ id: "c", title: "C" }),
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artworkIds: ["c", "a"] }),
    });
    expect(res.status).toBe(200);
    expect(repo.lastReplace).toEqual({ userId: "user-1", ids: ["c", "a"] });
    // 置換後の状態を返す（position 昇順）。
    const body = (await res.json()) as {
      id: string;
      inPortfolio: boolean;
      position: number | null;
    }[];
    expect(body.filter((x) => x.inPortfolio).map((x) => x.id)).toEqual(["c", "a"]);
    expect(body.find((x) => x.id === "c")?.position).toBe(0);
    expect(body.find((x) => x.id === "a")?.position).toBe(1);
    expect(body.find((x) => x.id === "b")?.inPortfolio).toBe(false);
  });

  it("空配列で全掲載を解除できる", async () => {
    const repo = createMockRepo([
      art({ id: "a", title: "A", position: 0 }),
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artworkIds: [] }),
    });
    expect(res.status).toBe(200);
    expect(repo.lastReplace).toEqual({ userId: "user-1", ids: [] });
  });

  it("自分の公開作品でない id を含むと 400（置換しない）", async () => {
    const repo = createMockRepo([art({ id: "a", title: "A" })]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artworkIds: ["a", "not-mine-or-not-published"] }),
    });
    expect(res.status).toBe(400);
    expect(repo.lastReplace).toBeUndefined();
  });

  it("artworkIds が配列でなければ 400", async () => {
    const repo = createMockRepo([]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artworkIds: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("artworkIds に重複があれば 400（置換しない）", async () => {
    const repo = createMockRepo([
      art({ id: "a", title: "A" }),
      art({ id: "b", title: "B" }),
    ]);
    const app = buildApp(repo, OWNER);
    const res = await app.request("/portfolio/mine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artworkIds: ["a", "a"] }),
    });
    expect(res.status).toBe(400);
    expect(repo.lastReplace).toBeUndefined();
  });
});
