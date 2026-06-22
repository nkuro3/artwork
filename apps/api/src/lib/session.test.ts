import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import {
  type AuthLike,
  type SessionUser,
  type SessionVariables,
  createSessionMiddleware,
  getCurrentUser,
  requireAuth,
} from "./session";

// C1 セッション middleware + 認可ヘルパ（ADR D6 / FR-01,02 / SEC-03）。
// getSession はモックし、DB / ネットワークに依存しない純ロジックのテスト。

const sampleUser: SessionUser = {
  id: "user-1",
  email: "owner@example.com",
};

const sampleSession = {
  id: "session-1",
  userId: "user-1",
};

/**
 * `auth.api.getSession` が指定の結果を返すモック auth を作る。
 */
function mockAuth(result: unknown): AuthLike {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(result),
    },
  };
}

function buildApp(auth: AuthLike) {
  return new Hono<{ Variables: SessionVariables }>().use(
    "*",
    createSessionMiddleware(auth),
  );
}

describe("createSessionMiddleware", () => {
  it("getSession が session を返すとき user / session を context に載せる", async () => {
    const auth = mockAuth({ user: sampleUser, session: sampleSession });
    const app = buildApp(auth).get("/whoami", (c) =>
      c.json({ user: c.get("user"), session: c.get("session") }),
    );

    const res = await app.request("/whoami", {
      headers: { cookie: "better-auth.session_token=abc" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: sampleUser,
      session: sampleSession,
    });
  });

  it("getSession に raw リクエストの headers を渡す", async () => {
    const auth = mockAuth({ user: sampleUser, session: sampleSession });
    const app = buildApp(auth).get("/whoami", (c) => c.text("ok"));

    await app.request("/whoami", {
      headers: { cookie: "better-auth.session_token=abc" },
    });

    const getSession = auth.api.getSession as ReturnType<typeof vi.fn>;
    expect(getSession).toHaveBeenCalledTimes(1);
    const arg = getSession.mock.calls[0]?.[0] as { headers: Headers };
    expect(arg.headers).toBeInstanceOf(Headers);
    expect(arg.headers.get("cookie")).toBe("better-auth.session_token=abc");
  });

  it("getSession が null を返すとき user / session は null", async () => {
    const auth = mockAuth(null);
    const app = buildApp(auth).get("/whoami", (c) =>
      c.json({ user: c.get("user"), session: c.get("session") }),
    );

    const res = await app.request("/whoami");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null, session: null });
  });
});

describe("requireAuth", () => {
  it("user が居れば後続ハンドラを通過する", async () => {
    const auth = mockAuth({ user: sampleUser, session: sampleSession });
    const app = buildApp(auth)
      .use("/secret", requireAuth)
      .get("/secret", (c) => c.json({ id: c.get("user")?.id }));

    const res = await app.request("/secret");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "user-1" });
  });

  it("user が居なければ 401 を返す", async () => {
    const auth = mockAuth(null);
    const app = buildApp(auth)
      .use("/secret", requireAuth)
      .get("/secret", (c) => c.text("should not reach"));

    const res = await app.request("/secret");

    expect(res.status).toBe(401);
  });
});

describe("getCurrentUser", () => {
  it("user が居れば user を返す", async () => {
    const auth = mockAuth({ user: sampleUser, session: sampleSession });
    const app = buildApp(auth).get("/me", (c) =>
      c.json(getCurrentUser(c)),
    );

    const res = await app.request("/me");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sampleUser);
  });

  it("user が居なければ HTTPException(401) を投げる", async () => {
    const auth = mockAuth(null);
    let thrown: unknown;
    const app = buildApp(auth).get("/me", (c) => {
      try {
        getCurrentUser(c);
      } catch (e) {
        thrown = e;
      }
      return c.text("done");
    });

    await app.request("/me");

    expect(thrown).toBeInstanceOf(HTTPException);
    expect((thrown as HTTPException).status).toBe(401);
  });
});
