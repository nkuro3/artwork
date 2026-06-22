"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { canMove, moveItem } from "../../../lib/reorder";
import {
  selectedArtworkIds,
  type EditableArtwork,
} from "../../../lib/portfolio-edit";
import { savePortfolioAction } from "../actions";

// §6.12 ポートフォリオ編集クライアント（FR-12,13 / ADR D12）。
// - 自分の published 作品を表示順（=ポートフォリオ掲載順 → 未掲載順）で並べる。
// - 各行: サムネ・タイトル・`掲載`チェック・`↑`/`↓`（並び替え）。
// - `保存`で、掲載チェック済みを表示順に並べた artworkIds を Server Action で確定する。
// 純ロジック（選択集合＋順序の組み立て / ↑↓）は lib/portfolio-edit・lib/reorder でテスト。
// 結線（チェック state・並び替え・保存）は型/ビルドで担保。

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export interface PortfolioEditorProps {
  artworks: EditableArtwork[];
  /** 公開ページへのリンク用 slug（取得失敗時は null）。 */
  slug: string | null;
}

/** 掲載中（position 昇順）→ 未掲載（元の順）の初期表示順を組む。 */
function initialOrder(artworks: readonly EditableArtwork[]): string[] {
  const inPortfolio = artworks
    .filter((a) => a.inPortfolio)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const rest = artworks.filter((a) => !a.inPortfolio);
  return [...inPortfolio, ...rest].map((a) => a.id);
}

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: "var(--space-6) 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-4)",
  padding: "var(--space-3)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};

const thumbStyle: CSSProperties = {
  width: "64px",
  height: "64px",
  objectFit: "cover",
  flexShrink: 0,
  borderRadius: "var(--radius-sm)",
};

const thumbPlaceholderStyle: CSSProperties = {
  ...thumbStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--text-xs)",
  color: "var(--color-text-muted)",
  background: "var(--color-disabled-bg)",
};

const titleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const checkLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  flexShrink: 0,
};

const moveGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  flexShrink: 0,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-4)",
  marginTop: "var(--space-6)",
};

const statusTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

const errorTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-error)",
};

const navStyle: CSSProperties = {
  display: "flex",
  gap: "var(--space-4)",
  marginTop: "var(--space-8)",
};

const emptyStyle: CSSProperties = {
  color: "var(--color-text-muted)",
};

export function PortfolioEditor({ artworks, slug }: PortfolioEditorProps) {
  const byId = useMemo(() => {
    const m = new Map<string, EditableArtwork>();
    for (const a of artworks) m.set(a.id, a);
    return m;
  }, [artworks]);

  const [order, setOrder] = useState<string[]>(() => initialOrder(artworks));
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(artworks.filter((a) => a.inPortfolio).map((a) => a.id)),
  );
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSave({ kind: "idle" });
  }

  function move(index: number, direction: "up" | "down") {
    setOrder((prev) => moveItem(prev, index, direction));
    setSave({ kind: "idle" });
  }

  async function onSave() {
    setSave({ kind: "saving" });
    const ids = selectedArtworkIds(artworks, order, checked);
    const result = await savePortfolioAction(ids);
    setSave(
      result.ok
        ? { kind: "saved" }
        : { kind: "error", message: result.error },
    );
  }

  if (artworks.length === 0) {
    return (
      <>
        <p style={emptyStyle}>
          公開作品がありません。作品を公開すると掲載できます。
        </p>
        <p>
          <a href="/artworks">作品管理へ</a>
        </p>
      </>
    );
  }

  return (
    <>
      <ul style={listStyle}>
        {order.map((id, index) => {
          const art = byId.get(id);
          if (!art) return null;
          const checkId = `inc-${id}`;
          return (
            <li key={id} style={rowStyle}>
              {art.thumbnailUrl ? (
                <img
                  src={art.thumbnailUrl}
                  alt={art.title || "（無題）"}
                  style={thumbStyle}
                />
              ) : (
                <span style={thumbPlaceholderStyle}>no image</span>
              )}
              <span style={titleStyle}>{art.title || "（無題）"}</span>

              <span style={checkLabelStyle}>
                <input
                  id={checkId}
                  type="checkbox"
                  checked={checked.has(id)}
                  onChange={() => toggle(id)}
                />
                <label htmlFor={checkId}>掲載</label>
              </span>

              <span style={moveGroupStyle}>
                <button
                  type="button"
                  onClick={() => move(index, "up")}
                  disabled={!canMove(order.length, index, "up")}
                  aria-label={`${art.title || "作品"}を上へ`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, "down")}
                  disabled={!canMove(order.length, index, "down")}
                  aria-label={`${art.title || "作品"}を下へ`}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div style={actionsStyle}>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={save.kind === "saving"}
        >
          保存
        </button>
        {save.kind === "saving" ? (
          <p role="status" aria-live="polite" style={statusTextStyle}>
            保存中…
          </p>
        ) : null}
        {save.kind === "saved" ? (
          <p role="status" aria-live="polite" style={statusTextStyle}>
            保存しました
          </p>
        ) : null}
        {save.kind === "error" ? (
          <p role="alert" style={errorTextStyle}>
            保存に失敗しました: {save.message}
          </p>
        ) : null}
      </div>

      <nav style={navStyle}>
        {slug ? <a href={`/p/${slug}`}>公開ページを見る</a> : null}
        <a href="/settings">設定</a>
      </nav>
    </>
  );
}
