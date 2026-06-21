import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE } from "./index";
import type { SearchResponseDto } from "./index";

// ツールチェーン疎通用のスモークテスト（A1）。
describe("@artwork/shared", () => {
  it("パッケージマーカーを公開する", () => {
    expect(SHARED_PACKAGE).toBe("@artwork/shared");
  });

  it("検索 DTO 型を公開する（NFR-11 / 型のみ）", () => {
    // 型レベルの公開を検証（実行時の値ではない）。コンパイルが通れば OK。
    const dto: SearchResponseDto = { artworks: [], artists: [] };
    expect(dto.artworks).toEqual([]);
  });
});
