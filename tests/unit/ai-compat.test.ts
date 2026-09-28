import { describe, expect, it } from "vitest";
import { fitDimensions } from "@/lib/ai/openai";

const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i]!, 0);
  return dot / (Math.hypot(...a) * Math.hypot(...b));
};

describe("Embeddings lokaler Modelle", () => {
  it("füllt kürzere Vektoren auf, ohne die Kosinus-Ähnlichkeit zu ändern", () => {
    const a = [0.1, 0.5, -0.3];
    const b = [0.4, -0.2, 0.9];
    const pa = fitDimensions(a, 8);
    const pb = fitDimensions(b, 8);
    expect(pa).toHaveLength(8);
    expect(cosine(pa, pb)).toBeCloseTo(cosine(a, b), 12);
  });

  it("lässt passende Vektoren unverändert und lehnt zu große ab", () => {
    const v = [1, 2, 3];
    expect(fitDimensions(v, 3)).toBe(v);
    expect(() => fitDimensions([1, 2, 3, 4], 3)).toThrow(/Dimensionen/);
  });
});
