import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * De templates staan als échte bestanden in ./templates, niet als strings in de
 * code. Zo blijven ze leesbaar en kan je ze gewoon openen en aanpassen.
 *
 * Vanuit dist/utils/template.js is ../../templates de juiste map.
 */
const TEMPLATE_ROOT = path.resolve(fileURLToPath(new URL("../../templates", import.meta.url)));

export type Vars = Record<string, string | number>;

/** Vervangt {{NAAM}} door de waarde uit `vars`. */
export function render(content: string, vars: Vars): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Kopieert een hele template-map naar `target` en vult overal de variabelen in.
 * Een bestand `gitignore` wordt `.gitignore` (npm publiceert geen .gitignore).
 */
export function copyTemplate(templateDir: string, target: string, vars: Vars): void {
  const source = path.join(TEMPLATE_ROOT, templateDir);

  for (const entry of fs.readdirSync(source, { withFileTypes: true, recursive: true })) {
    const from = path.join(entry.parentPath ?? source, entry.name);
    const relative = path.relative(source, from);
    if (entry.isDirectory()) {
      fs.mkdirSync(path.join(target, relative), { recursive: true });
      continue;
    }

    const name = entry.name === "gitignore" ? ".gitignore" : entry.name;
    const to = path.join(target, path.dirname(relative), name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, render(fs.readFileSync(from, "utf8"), vars), "utf8");
  }
}
