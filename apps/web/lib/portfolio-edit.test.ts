import { describe, expect, it, vi } from "vitest";
import {
  getPortfolioMine,
  putPortfolioMine,
  selectedArtworkIds,
  type EditableArtwork,
} from "./portfolio-edit";
import type { PortfolioMineClient } from "./portfolio-edit";

// §6.12 ポートフォリオ編集の純ロジック（ADR D12 / FR-12,13）。
// - getPortfolioMine / putPortfolioMine: RPC 呼び出しと結果正規化（api 注入・モック）。
// - selectedArtworkIds: 表示中の作品リスト（表示順）と「掲載」選択集合から、
//   掲載チェック済みを表示順に並べた artworkIds を組む純関数。

function res(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE: EditableArtwork[] = [
  {
    id: "a1",
    title: "夜",
    inPortfolio: true,
    position: 0,
    thumbnailUrl: "https://img.example/a1/thumb",
  },
  {
    id: "a2",
    title: "朝",
    inPortfolio: false,
    position: null,
    thumbnailUrl: null,
  },
];

function mockClient(overrides: Partial<MockShape> = {}) {
  const get = vi.fn().mockResolvedValue(res(SAMPLE));
  const put = vi.fn().mockResolvedValue(res(SAMPLE));
  const client = {
    api: {
      portfolio: {
        mine: {
          $get: overrides.get ?? get,
          $put: overrides.put ?? put,
        },
      },
    },
  } as unknown as PortfolioMineClient;
  return { client, get, put };
}

interface MockShape {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

describe("selectedArtworkIds", () => {
  const list: EditableArtwork[] = [
    { id: "a", title: "A", inPortfolio: false, position: null, thumbnailUrl: null },
    { id: "b", title: "B", inPortfolio: false, position: null, thumbnailUrl: null },
    { id: "c", title: "C", inPortfolio: false, position: null, thumbnailUrl: null },
  ];

  it("掲載チェック済みを表示順に並べた id 配列を返す", () => {
    const checked = new Set(["c", "a"]);
    // order = 表示順（b, c, a に並び替えた状態を想定）
    expect(selectedArtworkIds(list, ["b", "c", "a"], checked)).toEqual([
      "c",
      "a",
    ]);
  });

  it("チェックなしは空配列", () => {
    expect(selectedArtworkIds(list, ["a", "b", "c"], new Set())).toEqual([]);
  });

  it("order に無い id は無視する（防御）", () => {
    const checked = new Set(["a", "zzz"]);
    expect(selectedArtworkIds(list, ["a", "b", "c"], checked)).toEqual(["a"]);
  });
});

describe("getPortfolioMine", () => {
  it("RPC を呼び、編集用作品配列を返す", async () => {
    const { client, get } = mockClient();
    const result = await getPortfolioMine(client);

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((a) => a.id)).toEqual(["a1", "a2"]);
      expect(result.data[0]?.inPortfolio).toBe(true);
    }
  });

  it("非 ok は失敗に正規化する", async () => {
    const { client } = mockClient({
      get: vi.fn().mockResolvedValue(res({ message: "boom" }, false, 500)),
    });
    const result = await getPortfolioMine(client);
    expect(result.ok).toBe(false);
  });

  it("RPC 例外を失敗に倒す", async () => {
    const { client } = mockClient({
      get: vi.fn().mockRejectedValue(new Error("network")),
    });
    const result = await getPortfolioMine(client);
    expect(result.ok).toBe(false);
  });
});

describe("putPortfolioMine", () => {
  it("artworkIds を json に載せて RPC を呼ぶ", async () => {
    const { client, put } = mockClient();
    const result = await putPortfolioMine(client, ["a1"]);

    expect(put).toHaveBeenCalledWith({ json: { artworkIds: ["a1"] } });
    expect(result.ok).toBe(true);
  });

  it("非 ok（400 など）は失敗に正規化する", async () => {
    const { client } = mockClient({
      put: vi
        .fn()
        .mockResolvedValue(res({ message: "not your published" }, false, 400)),
    });
    const result = await putPortfolioMine(client, ["x"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not your published");
  });
});
