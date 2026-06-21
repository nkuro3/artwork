import { describe, expect, it } from "vitest";
import app from "./index";

// ツールチェーン疎通用のスモークテスト（A1）。
describe("api app", () => {
  it("GET /health が ok を返す", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
