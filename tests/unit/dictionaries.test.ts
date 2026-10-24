import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { eu } from "@/i18n/dictionaries/eu";
import { fr } from "@/i18n/dictionaries/fr";
import { ru } from "@/i18n/dictionaries/ru";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort().join(",");

describe("dictionaries", () => {
  const source = leaves(en as unknown as Tree);
  for (const [lang, dict] of Object.entries({ es, eu, fr, ru })) {
    it(`${lang} has the same keys and placeholders as en`, () => {
      const other = leaves(dict as unknown as Tree);
      expect([...other.keys()].sort()).toEqual([...source.keys()].sort());
      for (const [key, value] of source) expect(placeholders(other.get(key) ?? ""), key).toBe(placeholders(value));
    });
  }
});
