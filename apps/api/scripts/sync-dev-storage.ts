// dev 環境の storage を Neon フォークに追従させるツール。
//
// 背景: R2 には Neon のようなブランチ機能が無い。dev DB を Production からフォーク/リセットすると、
// dev の artwork_image 行は Production バケットのオブジェクトを指す r2_key を持つ。dev は専用バケット
// （artwork-images-dev）を使うため、そのままだと画像が dev バケットに存在せず壊れる。
// このスクリプトは「dev DB が参照する r2_key」を Production バケットから dev バケットへ S3 CopyObject で
// コピーし、DB フォークと storage を整合させる。フォーク/リセット直後に流す。
//
// 実行: cd apps/api && bun run sync-dev-storage   （.dev.vars を読む。dev ブランチ DATABASE_URL 前提）
// 安全: dev → Production 方向への書き込みは一切しない（コピー元 Production は読み取りのみ）。
import { createDb } from "@artwork/database";
import { sql } from "drizzle-orm";
import { AwsClient } from "aws4fetch";

const accountId = required("R2_ACCOUNT_ID");
const destBucket = required("R2_BUCKET_NAME"); // dev バケット（.dev.vars）
const sourceBucket = process.env.R2_SYNC_SOURCE_BUCKET ?? "artwork-images"; // Production バケット

if (destBucket === sourceBucket) {
  throw new Error(
    `R2_BUCKET_NAME (${destBucket}) が source (${sourceBucket}) と同一です。dev バケットを指していません。中止します。`,
  );
}

const client = new AwsClient({
  accessKeyId: required("R2_ACCESS_KEY_ID"),
  secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  region: "auto",
  service: "s3",
});
const objectUrl = (bucket: string, key: string) =>
  `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURI(key)}`;

const db = createDb(required("DATABASE_URL"));
const rows = await db.execute(sql`select distinct r2_key from "artwork_image"`);
const keys = ((rows.rows ?? rows) as { r2_key: string }[]).map((r) => r.r2_key);
console.log(`dev DB が参照する r2_key: ${keys.length} 件（${sourceBucket} → ${destBucket}）`);

let copied = 0;
let skipped = 0;
let missing = 0;
for (const key of keys) {
  // 既に dev バケットにあればスキップ（冪等）。
  const head = await client.fetch(objectUrl(destBucket, key), { method: "HEAD" });
  if (head.ok) {
    skipped++;
    continue;
  }
  const copy = await client.fetch(objectUrl(destBucket, key), {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${sourceBucket}/${key}` },
  });
  if (copy.ok) {
    copied++;
  } else if (copy.status === 404) {
    // Production バケットにも存在しない（孤児 r2_key）。スキップして報告。
    missing++;
    console.warn(`  missing in ${sourceBucket}: ${key}`);
  } else {
    console.error(`  copy failed (${copy.status}): ${key}`);
  }
}

console.log(`完了: copied=${copied} skipped=${skipped} missing=${missing}`);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env ${name} が未設定です`);
  return v;
}
