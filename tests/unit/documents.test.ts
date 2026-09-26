import { describe, expect, it } from "vitest";
import { chunkPages } from "@/lib/documents/chunk";
import { extractText } from "@/lib/documents/extract";
import { sanitizeFilename, validateUpload } from "@/lib/documents/validate";
import { reciprocalRankFusion, rewriteQuery } from "@/lib/search/retrieval";
import JSZip from "jszip";

describe("Chunking", () => {
  it("erhält Seiteninformationen und überlappt", () => {
    const para = "Kirchhoffsche Regeln beschreiben Ströme und Spannungen. ".repeat(20);
    const chunks = chunkPages([{ page: 1, text: `${para}\n\n${para}` }, { page: 2, text: "Ohmsches Gesetz: U = R · I" }], 600, 100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.content.length <= 700)).toBe(true);
    expect(chunks.at(-1)!.metadata.page).toBe(2);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("ignoriert leere Seiten", () => {
    expect(chunkPages([{ text: "   \n\n " }])).toEqual([]);
  });
});

describe("Upload-Validierung", () => {
  it("akzeptiert passende Magic Bytes", () => {
    expect(validateUpload("a.pdf", Buffer.from("%PDF-1.7 ..."), 1e6).kind).toBe("pdf");
    expect(validateUpload("notiz.md", Buffer.from("# Hallo"), 1e6).kind).toBe("text");
  });

  it("lehnt getarnte Dateien, leere und zu große Dateien sowie unbekannte Typen ab", () => {
    expect(() => validateUpload("a.pdf", Buffer.from("MZ\x90\x00"), 1e6)).toThrow(/passt nicht/);
    expect(() => validateUpload("a.txt", Buffer.from([0x00, 0x01, 0x02]), 1e6)).toThrow(/passt nicht/);
    expect(() => validateUpload("a.exe", Buffer.from("x"), 1e6)).toThrow(/nicht unterstützt/);
    expect(() => validateUpload("a.txt", Buffer.alloc(0), 1e6)).toThrow(/leer/);
    expect(() => validateUpload("a.txt", Buffer.from("x".repeat(20)), 10)).toThrow(/größer/);
  });

  it("bereinigt Dateinamen (Pfade, Sonderzeichen)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\Lernplan<1>.pdf")).toBe("Lernplan_1_.pdf");
    expect(sanitizeFilename("Prüfung Übersicht.docx")).toBe("Prüfung Übersicht.docx");
  });
});

describe("Text-Extraktion", () => {
  it("liest PPTX-Folien", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:p><a:r><a:t>Kirchhoff</a:t></a:r></a:p><a:p><a:r><a:t>Knotenregel &amp; Maschenregel</a:t></a:r></a:p></p:sld>");
    zip.file("ppt/slides/slide2.xml", "<p:sld><a:p><a:r><a:t>Ohm</a:t></a:r></a:p></p:sld>");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const res = await extractText(buf, { kind: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    expect(res.pages.map((p) => p.text)).toEqual(["Kirchhoff\nKnotenregel & Maschenregel", "Ohm"]);
  });

  it("Bilder ohne KI-Provider → klarer Konfigurationsfehler statt Fake-OCR", async () => {
    await expect(extractText(Buffer.from([0x89, 0x50, 0x4e, 0x47]), { kind: "image", mime: "image/png" })).rejects.toThrow(/KI-Provider/);
  });
});

describe("Retrieval-Helfer", () => {
  it("Query-Rewriting entfernt Stoppwörter und baut Präfix-Suche", () => {
    const r = rewriteQuery("Was habe ich zu Kirchhoff notiert?");
    expect(r.keywords).toEqual(["kirchhoff"]);
    expect(r.tsquery).toBe("kirchhoff:*");
  });

  it("entschärft tsquery-Sonderzeichen", () => {
    expect(rewriteQuery("a&b | c!d (x)").tsquery).not.toMatch(/[&!()]/);
  });

  it("Reciprocal Rank Fusion bevorzugt Treffer in beiden Listen", () => {
    const s = reciprocalRankFusion([["a", "b", "c"], ["c", "d"]]);
    expect([...s.entries()].sort((x, y) => y[1] - x[1])[0][0]).toBe("c");
  });
});
