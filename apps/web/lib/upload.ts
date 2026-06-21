// D3 画像アップロード orchestration（FR-06 / NFR-02 / C3）。
// ブラウザで実行する 3 段の手順を 1 関数に集約する:
//   1) api `POST /uploads/sign`        → { uploadUrl, r2Key }（短命 presigned PUT / SEC-06）
//   2) fetch `PUT uploadUrl`（R2 直）  → body=file・Content-Type 指定で R2 へ直接転送
//   3) api `POST /artworks/:id/images` → メタ作成（r2Key / width? / height?）
// client/fetchImpl を注入して純ロジックとしてテストする（next 非依存）。
// web は DB に触れず、署名と メタ作成は必ず api 経由（ADR D7）。R2 直 PUT のみ例外。

/** orchestration が使う RPC 部分集合。`createApiClient()` の戻り値が構造的に適合する。 */
export interface UploadClient {
  uploads: {
    sign: {
      $post: (args: {
        json: { ext: string; contentType: string };
      }) => Promise<Response>;
    };
  };
  artworks: {
    ":id": {
      images: {
        $post: (args: {
          param: { id: string };
          json: { r2Key: string; width?: number; height?: number };
        }) => Promise<Response>;
      };
    };
  };
}

export interface UploadDeps {
  client: UploadClient;
  /** R2 直 PUT 用。既定はグローバル fetch（テストでは注入してネットワーク非依存）。 */
  fetchImpl?: typeof fetch;
}

export interface UploadInput {
  artworkId: string;
  file: File;
  /** 任意。画像の実寸（一覧/詳細の出し分けや CLS 防止に使う / FR-15）。 */
  width?: number;
  height?: number;
}

export type UploadResult =
  | { ok: true; image: unknown }
  | { ok: false; error: string };

/** よくある画像 MIME → 拡張子。R2 キー採番（api 側）に渡す ext を決める。 */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** MIME から ext を決める。不明なら "bin"。Content-Type は元の type を保持する。 */
function extOf(file: File): string {
  return EXT_BY_MIME[file.type] ?? "bin";
}

/** 非 ok レスポンスからエラーメッセージを取り出す（{message} 優先）。 */
async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown } | null;
    if (body && typeof body.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    // ボディ無し/非 JSON は無視。
  }
  return `${fallback} (${res.status})`;
}

/**
 * 画像 1 枚をアップロードする。各段の失敗は `{ ok:false, error }` に正規化し、
 * 後続段は実行しない（sign 失敗なら PUT もメタ作成も行わない）。
 */
export async function uploadArtworkImage(
  deps: UploadDeps,
  input: UploadInput,
): Promise<UploadResult> {
  const { client } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const contentType = input.file.type || "application/octet-stream";

  try {
    // 1) 署名 URL 発行。
    const signRes = await client.uploads.sign.$post({
      json: { ext: extOf(input.file), contentType },
    });
    if (!signRes.ok) {
      return { ok: false, error: await errorFrom(signRes, "署名 URL の取得に失敗") };
    }
    const { uploadUrl, r2Key } = (await signRes.json()) as {
      uploadUrl: string;
      r2Key: string;
    };

    // 2) R2 へ直 PUT（api を経由しない / NFR-02）。
    const putRes = await fetchImpl(uploadUrl, {
      method: "PUT",
      body: input.file,
      headers: { "content-type": contentType },
    });
    if (!putRes.ok) {
      return {
        ok: false,
        error: `画像のアップロードに失敗しました (${putRes.status})`,
      };
    }

    // 3) メタ作成。
    const metaJson: { r2Key: string; width?: number; height?: number } = {
      r2Key,
    };
    if (input.width !== undefined) metaJson.width = input.width;
    if (input.height !== undefined) metaJson.height = input.height;

    const metaRes = await client.artworks[":id"].images.$post({
      param: { id: input.artworkId },
      json: metaJson,
    });
    if (!metaRes.ok) {
      return { ok: false, error: await errorFrom(metaRes, "画像メタの作成に失敗") };
    }

    return { ok: true, image: await metaRes.json() };
  } catch (e) {
    const message =
      e instanceof Error && e.message ? e.message : "通信に失敗しました";
    return { ok: false, error: message };
  }
}
