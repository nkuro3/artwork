import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSession } from "./session";

// D1 セッション取得（ADR D6）。受信 Cookie を api の get-session に転送し、
// user を返す/無ければ null。fetchImpl 注入で next/headers 非依存に検証する。

const ENDPOINT_RE = /\/api\/auth\/get-session$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function callOf(mock: ReturnType<typeof vi.fn>): {
  url: string;
  headers: Headers;
} {
  const [input, init] = mock.mock.calls.at(-1) ?? [];
  const url = input instanceof Request ? input.url : String(input);
  const headers =
    input instanceof Request
      ? input.headers
      : new Headers((init as RequestInit | undefined)?.headers);
  return { url, headers };
}

describe("fetchSession", () => {
  const original = process.env.API_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.API_URL;
    else process.env.API_URL = original;
  });

  it("cookie を get-session に転送し、200+session なら user を返す", async () => {
    process.env.API_URL = "http://localhost:8787";
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        session: { id: "s1", userId: "u1" },
        user: { id: "u1", email: "a@example.com", name: "A" },
      }),
    );

    const user = await fetchSession(
      "better-auth.session_token=tok",
      fetchImpl as unknown as typeof fetch,
    );

    expect(user).toEqual({ id: "u1", email: "a@example.com" });
    const call = callOf(fetchImpl);
    expect(call.url).toMatch(ENDPOINT_RE);
    expect(call.url.startsWith("http://localhost:8787")).toBe(true);
    expect(call.headers.get("cookie")).toBe("better-auth.session_token=tok");
  });

  it("レスポンスが null（未認証）なら null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null));
    expect(
      await fetchSession("c=1", fetchImpl as unknown as typeof fetch),
    ).toBeNull();
  });

  it("401 なら null", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401));
    expect(
      await fetchSession("c=1", fetchImpl as unknown as typeof fetch),
    ).toBeNull();
  });

  it("空ボディなら null", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    expect(
      await fetchSession("c=1", fetchImpl as unknown as typeof fetch),
    ).toBeNull();
  });

  it("session はあるが user が無いレスポンスなら null", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ session: { id: "s1" }, user: null }));
    expect(
      await fetchSession("c=1", fetchImpl as unknown as typeof fetch),
    ).toBeNull();
  });

  it("cookie が undefined でも呼べて、cookie ヘッダを載せない", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null));
    await fetchSession(undefined, fetchImpl as unknown as typeof fetch);
    expect(callOf(fetchImpl).headers.get("cookie")).toBeNull();
  });
});
