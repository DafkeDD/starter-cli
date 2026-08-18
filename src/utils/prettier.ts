import fs from "node:fs";
import path from "node:path";
import { runQuiet } from "./exec.js";
import { addDevDeps } from "./install.js";
import type { PackageManager } from "../types.js";

/**
 * Prettier-config voor gegenereerde projecten.
 * Pas dit object aan als je je huisstijl wil wijzigen — het wordt letterlijk
 * als .prettierrc weggeschreven in de doelmap.
 *
 * De tailwind-plugin (voor het sorteren van class-namen) heeft alleen zin in de
 * frontend; een backend krijgt dezelfde stijl zonder die plugin.
 */
function buildConfig(tailwind: boolean): Record<string, unknown> {
  const config: Record<string, unknown> = {
    arrowParens: "avoid",
    singleQuote: true,
    jsxSingleQuote: true,
    tabWidth: 4,
    trailingComma: "none",
    semi: false,
    proseWrap: "always",
    printWidth: 120,
  };

  if (tailwind) {
    config.plugins = ["prettier-plugin-tailwindcss"];
  }

  config.overrides = [
    {
      files: ["*.json", "*.jsonc"],
      options: {
        tabWidth: 4,
        printWidth: 120,
        trailingComma: "none",
      },
    },
  ];

  return config;
}

const PRETTIER_IGNORE = [
  "node_modules",
  ".next",
  "out",
  "build",
  "dist",
  "coverage",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "",
].join("\n");

/** Voegt `format`- en `format:check`-scripts toe aan de package.json. */
function addScripts(targetDir: string): void {
  const pkgPath = path.join(targetDir, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  pkg.scripts = {
    ...pkg.scripts,
    format: "prettier --write .",
    "format:check": "prettier --check .",
  };

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n", "utf8");
}

/**
 * Zet Prettier op in `targetDir`: config + ignore wegschrijven, de packages
 * installeren en de bestaande code meteen formatteren.
 *
 * @param tailwind - installeert en gebruikt prettier-plugin-tailwindcss (frontend).
 */
export async function setupPrettier(
  pm: PackageManager,
  targetDir: string,
  { tailwind = true }: { tailwind?: boolean } = {},
): Promise<void> {
  fs.writeFileSync(
    path.join(targetDir, ".prettierrc"),
    JSON.stringify(buildConfig(tailwind), null, 4) + "\n",
    "utf8",
  );
  fs.writeFileSync(path.join(targetDir, ".prettierignore"), PRETTIER_IGNORE, "utf8");

  addScripts(targetDir);

  const packages = ["prettier@latest"];
  if (tailwind) packages.push("prettier-plugin-tailwindcss@latest");
  await addDevDeps(pm, targetDir, packages);

  // Bestaande code meteen in de juiste stijl zetten.
  await runQuiet("npx", ["--yes", "prettier", "--write", "."], targetDir);
}
