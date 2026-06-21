import { describe, expect, it, vi } from "vitest";
import { getProfile, updateProfile } from "./profile";
import type { ProfileClient } from "./profile";

// D4 設定コア（FR-03）。api クライアントを注入し、RPC（GET/PATCH /profile）を呼んで
// 結果を成功/失敗に正規化する。next 非依存・純ロジックなのでユニットテスト対象
// （Server Action / 画面は薄いラッパで非対象）。web は DB に触れず、必ず api 経由（ADR D7）。

/** Response 風オブジェクト（hono RPC の $get/$patch の戻りに合わせた最小形）。 */
function res(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// api の ArtistProfile DTO（JSON 化後＝日付は string）。web は最小集合だけ使う。
const SAMPLE = {
  id: "p1",
  userId: "u1",
  slug: "yoru",
  displayName: "夜のアーティスト",
  bio: null,
  isPublic: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

/** profile コアが使う RPC 部分集合のモックを作る。 */
function mockClient(overrides: Partial<MockShape> = {}) {
  const get = vi.fn().mockResolvedValue(res(SAMPLE));
  const patch = vi.fn().mockResolvedValue(res({ ...SAMPLE, displayName: "朝" }));

  const client = {
    profile: {
      $get: overrides.get ?? get,
      $patch: overrides.patch ?? patch,
    },
  } as unknown as ProfileClient;

  return { client, get, patch };
}

interface MockShape {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
}

describe("getProfile", () => {
  it("RPC を呼び、最小集合に正規化して返す", async () => {
    const { client, get } = mockClient();
    const result = await getProfile(client);

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        slug: "yoru",
        displayName: "夜のアーティスト",
        bio: null,
        isPublic: true,
      });
    }
  });

  it("非 ok レスポンスは失敗に正規化する", async () => {
    const { client } = mockClient({
      get: vi.fn().mockResolvedValue(res({ message: "boom" }, false, 500)),
    });
    const result = await getProfile(client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("boom");
  });

  it("RPC 例外を失敗に倒す", async () => {
    const { client } = mockClient({
      get: vi.fn().mockRejectedValue(new Error("network")),
    });
    const result = await getProfile(client);
    expect(result.ok).toBe(false);
  });
});

describe("updateProfile", () => {
  it("patch を json に渡し、結果を最小集合に正規化する", async () => {
    const { client, patch } = mockClient();
    const result = await updateProfile(client, { displayName: "朝" });

    expect(patch).toHaveBeenCalledWith({ json: { displayName: "朝" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.displayName).toBe("朝");
  });

  it("displayName をトリムして渡す", async () => {
    const { client, patch } = mockClient();
    await updateProfile(client, { displayName: "  朝  " });
    expect(patch).toHaveBeenCalledWith({ json: { displayName: "朝" } });
  });

  it("slug をトリムして渡す", async () => {
    const { client, patch } = mockClient();
    await updateProfile(client, { slug: "  my-slug  " });
    expect(patch).toHaveBeenCalledWith({ json: { slug: "my-slug" } });
  });

  it("bio / isPublic を指定すれば json に載せる（bio は null も）", async () => {
    const { client, patch } = mockClient();
    await updateProfile(client, { bio: null, isPublic: false });
    expect(patch).toHaveBeenCalledWith({ json: { bio: null, isPublic: false } });
  });

  it("displayName 指定時の空文字はバリデーションエラー（RPC を呼ばない）", async () => {
    const { client, patch } = mockClient();
    const result = await updateProfile(client, { displayName: "   " });

    expect(patch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/displayName/i);
  });

  it("slug 指定時の空文字はバリデーションエラー（RPC を呼ばない）", async () => {
    const { client, patch } = mockClient();
    const result = await updateProfile(client, { slug: "  " });

    expect(patch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/slug/i);
  });

  it("未指定フィールドは json に含めない（部分更新）", async () => {
    const { client, patch } = mockClient();
    await updateProfile(client, { isPublic: true });
    expect(patch).toHaveBeenCalledWith({ json: { isPublic: true } });
  });

  it("サーバー 400（slug 重複）はメッセージを整形して失敗に倒す", async () => {
    const { client } = mockClient({
      patch: vi
        .fn()
        .mockResolvedValue(res({ message: "slug is already taken" }, false, 400)),
    });
    const result = await updateProfile(client, { slug: "taken" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("slug is already taken");
  });

  it("RPC 例外を失敗に倒す", async () => {
    const { client } = mockClient({
      patch: vi.fn().mockRejectedValue(new Error("network")),
    });
    const result = await updateProfile(client, { displayName: "朝" });
    expect(result.ok).toBe(false);
  });
});
