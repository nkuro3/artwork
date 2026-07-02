"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiFetch, type Artwork, type ArtworkInput } from "../lib/api";

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
} as const;

// 作成・編集共通のワイヤーフレームフォーム。
export function ArtworkForm({ initial }: { initial?: Artwork }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const text = (name: string) => {
      const v = String(form.get(name) ?? "").trim();
      return v === "" ? null : v;
    };
    const int = (name: string) => {
      const v = String(form.get(name) ?? "").trim();
      if (v === "") return null;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 ? n : null;
    };

    const input: ArtworkInput = {
      title: String(form.get("title") ?? "").trim(),
      description: text("description"),
      status: (text("status") ?? null) as ArtworkInput["status"],
      publicStatus: String(
        form.get("publicStatus") ?? "draft",
      ) as ArtworkInput["publicStatus"],
      medium: text("medium"),
      artType: text("artType"),
      condition: text("condition"),
      heightMm: int("heightMm"),
      widthMm: int("widthMm"),
      depthMm: int("depthMm"),
      weightG: int("weightG"),
    };

    const res = await apiFetch(
      initial ? `/api/artworks/${initial.id}` : "/api/artworks",
      { method: initial ? "PUT" : "POST", body: JSON.stringify(input) },
    );

    setSubmitting(false);
    if (!res.ok) {
      setError(`保存に失敗しました (${res.status})`);
      return;
    }
    const body = (await res.json()) as { artwork: Artwork };
    router.push(`/artworks/${body.artwork.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}
    >
      <label style={fieldStyle}>
        タイトル（必須）
        <input name="title" type="text" required defaultValue={initial?.title} />
      </label>
      <label style={fieldStyle}>
        説明
        <textarea name="description" rows={4} defaultValue={initial?.description ?? ""} />
      </label>
      <label style={fieldStyle}>
        ステータス
        <select name="status" defaultValue={initial?.status ?? ""}>
          <option value="">未設定</option>
          <option value="in_progress">in progress（制作中）</option>
          <option value="available">available（販売可）</option>
          <option value="sold">sold（売約済）</option>
        </select>
      </label>
      <label style={fieldStyle}>
        公開状態
        <select name="publicStatus" defaultValue={initial?.publicStatus ?? "draft"}>
          <option value="draft">draft（下書き）</option>
          <option value="public">public（公開）</option>
          <option value="archived">archived（アーカイブ）</option>
        </select>
      </label>

      <fieldset style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <legend>カタログ属性（任意）</legend>
        <label style={fieldStyle}>
          画材・素材（Medium）
          <input name="medium" type="text" defaultValue={initial?.medium ?? ""} />
        </label>
        <label style={fieldStyle}>
          作品種別（Type of art）
          <input name="artType" type="text" defaultValue={initial?.artType ?? ""} />
        </label>
        <label style={fieldStyle}>
          状態（Condition）
          <input name="condition" type="text" defaultValue={initial?.condition ?? ""} />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={fieldStyle}>
            高さ (mm)
            <input name="heightMm" type="number" min={0} defaultValue={initial?.heightMm ?? ""} />
          </label>
          <label style={fieldStyle}>
            幅 (mm)
            <input name="widthMm" type="number" min={0} defaultValue={initial?.widthMm ?? ""} />
          </label>
          <label style={fieldStyle}>
            奥行 (mm)
            <input name="depthMm" type="number" min={0} defaultValue={initial?.depthMm ?? ""} />
          </label>
        </div>
        <label style={fieldStyle}>
          重量 (g)
          <input name="weightG" type="number" min={0} defaultValue={initial?.weightG ?? ""} />
        </label>
      </fieldset>

      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {initial ? "更新" : "作成"}
      </button>
    </form>
  );
}
