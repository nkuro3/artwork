import { artworkImage, createDb } from "@artwork/database";
import { and, isNull, lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { AppBindings } from "../env";
import { createStorage } from "./storage";

/**
 * 孤児画像のクリーンアップ（cron から呼ぶ）。
 * artwork_id IS NULL（アップロード後未保存 / 編集で外された）かつ
 * 猶予時間を過ぎた行を対象に、R2 オブジェクト → DB 行の順で削除する。
 * 部分インデックス artwork_image_unattached_idx がこのクエリを支える。
 */
export async function cleanupOrphanImages(env: AppBindings, graceHours = 24) {
  const db = createDb(env.DATABASE_URL);
  const storage = createStorage(env);
  const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000);

  const orphans = await db
    .select({ id: artworkImage.id, storageKey: artworkImage.storageKey })
    .from(artworkImage)
    .where(and(isNull(artworkImage.artworkId), lt(artworkImage.createdAt, cutoff)));

  let deleted = 0;
  let failed = 0;
  for (const orphan of orphans) {
    // R2 側を先に消す（行を先に消すとオブジェクトへの参照を失う）。
    // DELETE は対象が無くても 204 を返すため、presigned 未 PUT の行もこの経路で消える。
    const res = await storage.delete(orphan.storageKey);
    if (!res.ok) {
      failed++;
      console.error(`cleanup: R2 delete failed (${res.status}): ${orphan.storageKey}`);
      continue; // 行を残して次回リトライ
    }
    await db.delete(artworkImage).where(eq(artworkImage.id, orphan.id));
    deleted++;
  }

  console.log(
    `cleanup: orphans=${orphans.length} deleted=${deleted} failed=${failed} (grace=${graceHours}h)`,
  );
  return { found: orphans.length, deleted, failed };
}
