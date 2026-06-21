// D4 設定コア（FR-03 プロフィール / slug / 公開設定）。
// api クライアント（D1 の `createApiClient`）を注入し、Hono RPC（GET/PATCH /profile）を
// 呼んで結果を成功/失敗に正規化する。next 非依存・純ロジックなのでユニットテスト対象
//（Server Action / 画面は薄いラッパで非対象）。web は DB に触れず、必ず api 経由（ADR D7）。

/**
 * 設定 UI が扱うプロフィールの最小集合（DTO / ADR D5）。
 * api の `ArtistProfile` から slug/displayName/bio/isPublic のみを取り出す。
 * スキーマ型や id/userId/日付は web の設定画面に不要なので持ち込まない。
 */
export interface Profile {
  slug: string;
  displayName: string;
  bio: string | null;
  isPublic: boolean;
}

/** コアが必要とする RPC 部分集合。`createApiClient()` の戻り値が構造的に適合する。 */
export interface ProfileClient {
  profile: {
    $get: (args?: unknown) => Promise<Response>;
    $patch: (args: { json: ProfilePatch }) => Promise<Response>;
  };
}

/** 更新パッチ（部分更新）。指定したフィールドのみ送る。 */
export interface ProfilePatch {
  displayName?: string;
  slug?: string;
  bio?: string | null;
  isPublic?: boolean;
}

/** 正規化済みの結果。成功は data、失敗は人間可読な error。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}
function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

/** 非 ok レスポンスからエラーメッセージを取り出す（{message} を優先）。 */
async function errorFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown } | null;
    if (body && typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    // ボディ無し/非 JSON は無視。
  }
  return `Request failed (${res.status})`;
}

/** api の ArtistProfile（JSON）から web の最小 DTO へ正規化する。 */
function toProfile(raw: unknown): Profile {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    slug: typeof r.slug === "string" ? r.slug : "",
    displayName: typeof r.displayName === "string" ? r.displayName : "",
    bio: typeof r.bio === "string" ? r.bio : null,
    isPublic: r.isPublic !== false,
  };
}

/** 現在ユーザーのプロフィールを取得する（FR-03 / api 側で lazy init 保証）。 */
export async function getProfile(
  client: ProfileClient,
): Promise<Result<Profile>> {
  try {
    const res = await client.profile.$get();
    if (!res.ok) return fail(await errorFrom(res));
    return ok(toProfile(await res.json()));
  } catch (e) {
    return fail(messageOf(e));
  }
}

/**
 * プロフィールを部分更新する（FR-03）。
 * web は軽い前段チェックのみ（displayName 指定時は非空 / slug 指定時は非空）。
 * slug の詳細な妥当性・他者重複は api が最終判定し、その 400 メッセージを整形して返す。
 */
export async function updateProfile(
  client: ProfileClient,
  patch: ProfilePatch,
): Promise<Result<Profile>> {
  const json: ProfilePatch = {};

  if (patch.displayName !== undefined) {
    const displayName = patch.displayName.trim();
    if (displayName === "") return fail("displayName must not be empty");
    json.displayName = displayName;
  }
  if (patch.slug !== undefined) {
    const slug = patch.slug.trim();
    if (slug === "") return fail("slug must not be empty");
    json.slug = slug;
  }
  if (patch.bio !== undefined) json.bio = patch.bio;
  if (patch.isPublic !== undefined) json.isPublic = patch.isPublic;

  try {
    const res = await client.profile.$patch({ json });
    if (!res.ok) return fail(await errorFrom(res));
    return ok(toProfile(await res.json()));
  } catch (e) {
    return fail(messageOf(e));
  }
}

function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "通信に失敗しました";
}
