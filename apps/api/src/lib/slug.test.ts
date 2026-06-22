import { describe, expect, it } from "vitest";
import {
  RESERVED_SLUGS,
  ensureUniqueSlug,
  generateProvisionalSlug,
  isValidSlug,
  normalizeSlug,
} from "./slug";

// B2 slug（FR-03 仮値初期化 / FR-11 公開 URL `/p/{slug}`）。
// 純ロジックのユニットテスト。DB アクセスはせず、重複は注入述語で検証する。
describe("slug", () => {
  describe("isValidSlug", () => {
    it("小文字英数字とハイフンの妥当な slug は true", () => {
      expect(isValidSlug("john")).toBe(true);
      expect(isValidSlug("john-doe")).toBe(true);
      expect(isValidSlug("a1b2-c3")).toBe(true);
      expect(isValidSlug("123")).toBe(true);
      expect(isValidSlug("abc")).toBe(true);
      // 境界長（3 と 30）
      expect(isValidSlug("a".repeat(30))).toBe(true);
    });

    it("大文字を含むと false", () => {
      expect(isValidSlug("John")).toBe(false);
      expect(isValidSlug("ABC")).toBe(false);
    });

    it("記号や空白を含むと false", () => {
      expect(isValidSlug("john_doe")).toBe(false);
      expect(isValidSlug("john doe")).toBe(false);
      expect(isValidSlug("john.doe")).toBe(false);
      expect(isValidSlug("john!")).toBe(false);
    });

    it("短すぎる（2 文字以下）と false", () => {
      expect(isValidSlug("ab")).toBe(false);
      expect(isValidSlug("a")).toBe(false);
      expect(isValidSlug("")).toBe(false);
    });

    it("長すぎる（31 文字以上）と false", () => {
      expect(isValidSlug("a".repeat(31))).toBe(false);
    });

    it("先頭/末尾ハイフンは false", () => {
      expect(isValidSlug("-john")).toBe(false);
      expect(isValidSlug("john-")).toBe(false);
      expect(isValidSlug("-john-")).toBe(false);
    });

    it("連続ハイフンは false", () => {
      expect(isValidSlug("john--doe")).toBe(false);
      expect(isValidSlug("a---b")).toBe(false);
    });

    it("予約語は false", () => {
      for (const reserved of RESERVED_SLUGS) {
        expect(isValidSlug(reserved)).toBe(false);
      }
      expect(isValidSlug("api")).toBe(false);
      expect(isValidSlug("settings")).toBe(false);
      expect(isValidSlug("login")).toBe(false);
      expect(isValidSlug("admin")).toBe(false);
    });

    it("予約語と同形でも大文字小文字を問わず弾く", () => {
      expect(isValidSlug("Admin")).toBe(false);
      expect(isValidSlug("API")).toBe(false);
    });
  });

  describe("normalizeSlug", () => {
    it("大文字を小文字化する", () => {
      expect(normalizeSlug("John")).toBe("john");
      expect(normalizeSlug("ABC")).toBe("abc");
    });

    it("空白を単一ハイフンに変換する", () => {
      expect(normalizeSlug("john doe")).toBe("john-doe");
      expect(normalizeSlug("  hello   world  ")).toBe("hello-world");
    });

    it("不正文字をハイフンに変換し連続ハイフンを圧縮する", () => {
      expect(normalizeSlug("john_doe")).toBe("john-doe");
      expect(normalizeSlug("john.doe!!name")).toBe("john-doe-name");
    });

    it("前後のハイフンを除去する", () => {
      expect(normalizeSlug("-john-")).toBe("john");
      expect(normalizeSlug("__john__")).toBe("john");
    });

    it("非 ASCII（日本語など）は除去され、結果が空文字になり得る", () => {
      expect(normalizeSlug("クロダ")).toBe("");
      expect(normalizeSlug("日本語")).toBe("");
    });

    it("ASCII と非 ASCII の混在は ASCII 部分のみ残す", () => {
      expect(normalizeSlug("john クロダ")).toBe("john");
    });

    it("既に妥当な slug はそのまま返す", () => {
      expect(normalizeSlug("john-doe")).toBe("john-doe");
    });
  });

  describe("generateProvisionalSlug", () => {
    it("同じ seed なら決定的に同じ slug を返す", () => {
      const a = generateProvisionalSlug("user-abc-123");
      const b = generateProvisionalSlug("user-abc-123");
      expect(a).toBe(b);
    });

    it("異なる seed では異なる slug を返す傾向がある", () => {
      const a = generateProvisionalSlug("seed-one");
      const b = generateProvisionalSlug("seed-two");
      expect(a).not.toBe(b);
    });

    it("生成結果は isValidSlug を満たす", () => {
      const seeds = [
        "abc",
        "クロダ",
        "日本語のみ",
        "00000000-0000-0000-0000-000000000000",
        "x",
        "",
        "ADMIN",
        "api",
      ];
      for (const seed of seeds) {
        const slug = generateProvisionalSlug(seed);
        expect(isValidSlug(slug)).toBe(true);
      }
    });

    it("予約語に当たる seed でも予約語にならない", () => {
      expect(isValidSlug(generateProvisionalSlug("admin"))).toBe(true);
    });
  });

  describe("ensureUniqueSlug", () => {
    it("未使用なら候補をそのまま返す", () => {
      const result = ensureUniqueSlug("john-doe", () => false);
      expect(result).toBe("john-doe");
    });

    it("衝突時に接尾辞 -2, -3 ... を付けて回避する", () => {
      const taken = new Set(["john", "john-2", "john-3"]);
      const result = ensureUniqueSlug("john", (s) => taken.has(s));
      expect(result).toBe("john-4");
    });

    it("最初の衝突では -2 を付ける", () => {
      const taken = new Set(["john"]);
      const result = ensureUniqueSlug("john", (s) => taken.has(s));
      expect(result).toBe("john-2");
    });

    it("結果は常に isValidSlug を満たす", () => {
      const taken = new Set(["john", "john-2"]);
      const result = ensureUniqueSlug("john", (s) => taken.has(s));
      expect(isValidSlug(result)).toBe(true);
    });

    it("候補が予約語でも未使用な妥当 slug を返す", () => {
      const result = ensureUniqueSlug("admin", () => false);
      expect(isValidSlug(result)).toBe(true);
    });

    it("候補が空文字でも妥当 slug を返す", () => {
      const result = ensureUniqueSlug("", () => false);
      expect(isValidSlug(result)).toBe(true);
    });

    it("長い候補に接尾辞を付けても 30 文字以内に収める", () => {
      const base = "a".repeat(30);
      const taken = new Set([base]);
      const result = ensureUniqueSlug(base, (s) => taken.has(s));
      expect(isValidSlug(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(30);
    });
  });
});
