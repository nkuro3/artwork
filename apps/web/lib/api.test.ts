import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBaseUrl, createApiClient } from "./api";

// D1 RPC クライアント（ADR D6 / D4 / NFR-11）。
// 実 fetch は呼ばず、hc に注入したカスタム fetch でリクエスト内容を検証する。

describe("apiBaseUrl", () => {
  const original = process.env.API_URL;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = original;
    }
  });

  it("API_URL 未設定なら相対ベース（空文字 = 同一オリジン本番）", () => {
    delete process.env.API_URL;
    expect(apiBaseUrl()).toBe("");
  });

  it("API_URL 設定時はそれを使う（ローカル別ポート）", () => {
    process.env.API_URL = "http://localhost:8787";
    expect(apiBaseUrl()).toBe("http://localhost:8787");
  });
});

describe("createApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  function lastCall(): { url: string; headers: Headers } {
    const [input, init] = fetchMock.mock.calls.at(-1) ?? [];
    const url = input instanceof Request ? input.url : String(input);
    const headers =
      input instanceof Request
        ? input.headers
        : new Headers((init as RequestInit | undefined)?.headers);
    return { url, headers };
  }

  it("cookie を渡すと cookie ヘッダを載せる（Cookie 転送 / ADR D6）", async () => {
    const client = createApiClient({
      cookie: "better-auth.session_token=abc",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.api.health.$get();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastCall().headers.get("cookie")).toBe(
      "better-auth.session_token=abc",
    );
  });

  it("cookie 未指定なら cookie ヘッダを載せない", async () => {
    const client = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.api.health.$get();

    expect(lastCall().headers.get("cookie")).toBeNull();
  });

  it("API_URL 未設定時は相対パスへリクエストする", async () => {
    const original = process.env.API_URL;
    delete process.env.API_URL;
    try {
      const client = createApiClient({
        fetch: fetchMock as unknown as typeof fetch,
      });
      await client.api.health.$get();
      // 相対ベース（空）→ hc は origin 無しの URL を組む。
      expect(lastCall().url).toContain("/api/health");
    } finally {
      if (original !== undefined) process.env.API_URL = original;
    }
  });

  it("API_URL 設定時はそのオリジンへリクエストする", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:8787",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.api.health.$get();
    expect(lastCall().url).toBe("http://localhost:8787/api/health");
  });
});
