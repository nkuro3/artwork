import { AwsClient } from "aws4fetch";
import type { AppBindings } from "../env";

// R2 との入出力を S3 API (aws4fetch) に閉じ込める。
export function createStorage(env: AppBindings) {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
  });
  const objectUrl = (key: string) =>
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${encodeURI(key)}`;

  return {
    // ブラウザが R2 へ直接 PUT するための presigned URL（既定 15 分）。
    async presignPut(key: string, expiresSec = 900) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(expiresSec));
      const signed = await client.sign(
        new Request(url, { method: "PUT" }),
        { aws: { signQuery: true } },
      );
      return signed.url;
    },
    get(key: string) {
      return client.fetch(objectUrl(key));
    },
    delete(key: string) {
      return client.fetch(objectUrl(key), { method: "DELETE" });
    },
  };
}
