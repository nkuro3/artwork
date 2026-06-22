/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

// OpenNext Cloudflare（ADR D2）: `next dev` 中も getCloudflareContext() 経由で
// Cloudflare バインディング（R2 キャッシュ等）へアクセスできるようにする。
// OpenNext build には影響しない開発専用フック。
// 参照: https://opennext.js.org/cloudflare/get-started
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
