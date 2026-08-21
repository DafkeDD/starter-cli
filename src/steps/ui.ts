import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDevDeps } from "../utils/install.js";
import { runQuiet } from "../utils/exec.js";
import { withProgress } from "../utils/progress.js";
import { FRONTEND_DIR } from "./frontend.js";
import { writeUiGlobals } from "./theme.js";
import type { Frontend } from "./frontend.js";
import type { PackageManager } from "../types.js";

/**
 * De eigen componentenbibliotheek: één plek voor layout, knoppen, dropdowns —
 * zodat elke app er hetzelfde uitziet.
 *
 * Belangrijk: dit is géén runtime-dependency. De repo is een monorepo met een
 * registry (zoals de shadcn-CLI): de componenten worden als broncode in je
 * project gekopieerd, zodat je ze zelf kan aanpassen. Het package blijft enkel
 * als devDependency staan om later `add` opnieuw te kunnen draaien.
 */
export const UI_PACKAGE = "github:DafkeDD/projectx-ui";

/** Waar de gekopieerde componenten terechtkomen. */
const COMPONENTS_DIR = "src/components/ui";
/** Verzamel-CSS die alle component-CSS importeert. */
const CSS_ENTRY = "src/components/ui/ui.css";
/** Import-alias, zodat je `@/components/ui/button` kan importeren. */
const IMPORT_ALIAS = "@/components/ui";

/** Configuratiebestand dat de projectx-ui CLI leest. */
const CONFIG_FILE = "projectx-ui.json";

/** Mogelijke locaties van de CLI binnen het geïnstalleerde package. */
const BIN_CANDIDATES = [
  path.join("packages", "cli", "bin", "projectx-ui.mjs"),
  path.join("bin", "projectx-ui.mjs"),
];

/** Mogelijke locaties van de registry binnen het geïnstalleerde package. */
const REGISTRY_CANDIDATES = [
  path.join("registry", "index.json"),
  path.join("packages", "cli", "registry", "index.json"),
];

/**
 * Vraag 2: de eigen UI-bibliotheek installeren?
 * Wordt alleen gesteld als er een frontend is.
 */
export async function askCustomUi(frontend: Frontend): Promise<boolean> {
  if (frontend === "none") return false;

  const answer = await p.confirm({
    message: "Wil je onze custom UI installeren?",
    initialValue: true,
  });
  if (p.isCancel(answer)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return answer;
}

/**
 * Kopieert de UI-componenten in de frontend en neemt de design tokens over in
 * globals.css.
 *
 * Mislukt het — geen netwerk, repo verplaatst — dan stopt de CLI niet: je
 * project is verder gewoon bruikbaar en je krijgt de commando's om het later
 * zelf te doen.
 */
export async function scaffoldCustomUi(
  wanted: boolean,
  frontend: Frontend,
  projectDir: string,
  pm: PackageManager,
  pkg: string = UI_PACKAGE,
): Promise<void> {
  if (!wanted || frontend === "none") return;

  const target = path.join(projectDir, FRONTEND_DIR);
  p.log.step(`Custom UI installeren in ./${FRONTEND_DIR} ...`);

  try {
    let count = 0;

    await withProgress(
      "Custom UI ophalen",
      async (update) => {
        // Voor en na vergelijken: npm herschrijft de spec (een github:-spec
        // krijgt een commit-hash), dus de naam afleiden uit de spec is
        // onbetrouwbaar. De nieuwe sleutel is de naam.
        const before = devDependencyNames(target);
        await addDevDeps(pm, target, [pkg]);
        const added = devDependencyNames(target).filter((name) => !before.includes(name));

        const name = added[0] ?? "projectx-ui-monorepo";
        const root = path.join(target, "node_modules", ...name.split("/"));
        const bin = firstExisting(root, BIN_CANDIDATES);
        const registry = firstExisting(root, REGISTRY_CANDIDATES);

        if (!bin || !registry) {
          throw new Error(
            `In "${name}" zit geen projectx-ui CLI (${BIN_CANDIDATES[0]}) of registry (${REGISTRY_CANDIDATES[0]}).`,
          );
        }

        // Config vooraf schrijven: `init --force` zou hem overschrijven met de
        // standaardpaden (components/ui in plaats van src/components/ui).
        writeConfig(target);

        update("Basisbestanden en design tokens kopiëren");
        await runQuiet("node", [bin, "init", "--yes", "--registry", registry], target);

        update("Alle componenten kopiëren");
        await runQuiet("node", [bin, "add", "--all", "--registry", registry], target);

        update("globals.css overnemen uit de custom UI");
        writeUiGlobals(target, path.posix.join("..", "components", "ui", "ui.css"));

        count = countComponents(registry);
      },
      45000,
    );

    p.log.success(
      `Custom UI geïnstalleerd: ${count || "alle"} componenten in ./${FRONTEND_DIR}/${COMPONENTS_DIR}.`,
    );
    p.log.info(
      `Design tokens komen nu uit de custom UI — globals.css is overgenomen.\n` +
        `Importeren doe je zo:  import { Button } from '${IMPORT_ALIAS}/button'\n` +
        `Later bijwerken:       cd ${FRONTEND_DIR} && npx projectx-ui add --all --force`,
    );
  } catch (err) {
    p.log.warn(
      `Custom UI installeren is niet gelukt: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}\n` +
        "De frontend houdt zijn eigen tokens en componenten — verder werkt alles.\n" +
        `Later alsnog:\n  cd ${FRONTEND_DIR} && ${pm} install --save-dev ${pkg}\n` +
        `  npx projectx-ui init --yes && npx projectx-ui add --all`,
    );
  }
}

/** Schrijft projectx-ui.json met onze paden (src-dir, alias @/components/ui). */
function writeConfig(target: string): void {
  const config = {
    componentsDir: COMPONENTS_DIR,
    cssEntry: CSS_ENTRY,
    importAlias: IMPORT_ALIAS,
  };

  fs.writeFileSync(
    path.join(target, CONFIG_FILE),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
}

/** Het eerste pad uit `candidates` dat binnen `root` bestaat. */
function firstExisting(root: string, candidates: string[]): string | undefined {
  return candidates.map((c) => path.join(root, c)).find((file) => fs.existsSync(file));
}

/** Hoeveel componenten de registry aanbiedt (puur voor de melding). */
function countComponents(registry: string): number {
  try {
    const { components } = JSON.parse(fs.readFileSync(registry, "utf8")) as {
      components?: unknown[];
    };
    return components?.length ?? 0;
  } catch {
    return 0;
  }
}

/** De namen van alle devDependencies in de package.json van de frontend. */
function devDependencyNames(target: string): string[] {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return [];

  const { devDependencies = {} } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    devDependencies?: Record<string, string>;
  };

  return Object.keys(devDependencies);
}
