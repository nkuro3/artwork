import { describe, expect, it } from "vitest";
import app from "./index";

// Ec: ローカル dev CORS（SEC-03 / D2 申し送り）。
// web(:3000) → api(:8787) のクロスオリジン（Better Auth クライアント / 画像署名等）に CORS が必要。
// 許可オリジンは WEB_ORIGIN で切替。未設定なら CORS ヘッダを付けない（本番同一オリジンで無害 / ADR D4）。

const WEB_ORIGIN = "http://localhost:3000";

// app.request の第3引数で env を注入する。CORS 判定に必要なものだけ与える。
const envWith = (overrides: Record<string, unknown>) =>
  ({
    WEB_ORIGIN,
    ...overrides,
  }) as never;

describe("CORS (Ec)", () => {
  it("WEB_ORIGIN 設定時、プリフライト OPTIONS に許可ヘッダを返す", async () => {
    const res = await app.request(
      "/api/auth/sign-in/email",
      {
        method: "OPTIONS",
        headers: {
          Origin: WEB_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      },
      envWith({}),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("WEB_ORIGIN 設定時、実リクエストにも許可ヘッダが付く", async () => {
    const res = await app.request(
      "/health",
      {
        method: "GET",
        headers: { Origin: WEB_ORIGIN },
      },
      envWith({}),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("WEB_ORIGIN 未設定時は CORS 許可ヘッダを付けない（本番デフォルト安全）", async () => {
    const res = await app.request(
      "/health",
      {
        method: "GET",
        headers: { Origin: WEB_ORIGIN },
      },
      {} as never,
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("WEB_ORIGIN と異なる Origin には許可を与えない", async () => {
    const res = await app.request(
      "/health",
      {
        method: "GET",
        headers: { Origin: "https://evil.example.com" },
      },
      envWith({}),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe(
      "https://evil.example.com",
    );
  });

  it("既存の /health が壊れていない（200）", async () => {
    const res = await app.request("/health", {}, envWith({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
