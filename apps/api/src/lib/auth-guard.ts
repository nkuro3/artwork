import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";
import { createAuth } from "./auth";

export type AuthVariables = {
  userId: string;
};

// セッション必須のルートに付けるガード。未認証は 401。
// 認可（所有チェック）は各ルートで userId を使って行う。
export const authGuard = createMiddleware<{
  Bindings: AppBindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("userId", session.user.id);
  await next();
});
