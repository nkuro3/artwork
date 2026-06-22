// OpenNext Cloudflare アダプタ設定（ADR D2）。
// 既定の最小構成: R2 インクリメンタルキャッシュ（unstable_cache / revalidateTag の
// 永続化先）。バインディングは wrangler.jsonc の NEXT_INC_CACHE_R2_BUCKET と対応。
// 参照: https://opennext.js.org/cloudflare/get-started, /cloudflare/caching
//       @opennextjs/cloudflare@1.19.11 templates/open-next.config.ts（一次情報）
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
