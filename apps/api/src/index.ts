import { Hono } from "hono";

// api Worker のエントリ。ルートは Phase C で追加する。
// Better Auth は /api/auth/* にマウント、CRUD は /artworks など（NFR-11）。
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
