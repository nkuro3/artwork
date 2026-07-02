import { Hono } from "hono";

// 再設計中の最小スケルトン。ルートは仕様確定後にここへ追加する。
const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
