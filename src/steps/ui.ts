import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { FRONTEND_DIR } from "./frontend.js";
import type { Frontend } from "./frontend.js";
import type { PackageManager } from "../types.js";

/**
 * De eigen componentenbibliotheek. Eén plek voor layout, knoppen, dropdowns —
 * zodat elke app er hetzelfde uitziet.
 */
export const UI_PACKAGE = "github:DafkeDD/projectx-ui";

/**
 * Waar in het package de stylesheet mag staan. De eerste die bestaat wint.
 * Zet je hem ergens anders neer, voeg het pad hier toe.
 */
const STYLESHEET_CANDIDATES = [
  "globals.css",
  "dist/globals.css",
  "styles/globals.css",
  "src/globals.css",
  "src/app/globals.css",
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
 * Installeert de UI-bibliotheek in de frontend en neemt haar globals.css over.
 *
 * Mislukt de installatie — repo privé, geen toegang, geen netwerk — dan stopt
 * de CLI niet: je project is verder gewoon bruikbaar en je krijgt het commando
 * om het later zelf te doen.
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
    await withProgress(
      "Custom UI installeren",
      async (update) => {
        // Voor en na vergelijken: npm herschrijft de spec (een file:-pad wordt
        // relatief, een github:-spec kan een commit-hash krijgen), dus de naam
        // afleiden uit de spec is onbetrouwbaar. De nieuwe sleutel is de naam.
        const before = dependencyNames(target);
        await addDeps(pm, target, [pkg]);
        const added = dependencyNames(target).filter(name => !before.includes(name));

        update("globals.css overnemen uit de custom UI");
        copyStylesheet(target, added);
      },
      20000,
    );
    p.log.success(`Custom UI geïnstalleerd (${pkg}).`);
  } catch (err) {
    p.log.warn(
      `Custom UI installeren is niet gelukt: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}\n` +
        "Is de repo privé, log dan in met 'gh auth login' of zet een SSH-sleutel klaar.\n" +
        `Later alsnog installeren:\n  cd ${FRONTEND_DIR} && ${pm} install ${pkg}`,
    );
  }
}

/**
 * Zet de globals.css van het package over die van de app.
 *
 * De tokens komen dus uit de custom UI — één plek voor kleuren, radius en
 * typografie. Wil je per app iets anders, pas dan achteraf `globals.css` aan;
 * die wordt niet meer overschreven zolang je de CLI niet opnieuw draait.
 */
function copyStylesheet(target: string, added: string[]): void {
  const name = added[0];
  if (!name) {
    p.log.warn(
      "Custom UI geïnstalleerd, maar er kwam geen nieuwe dependency bij — globals.css is niet overgenomen.\n" +
        "Stond het package er al in? Dan is dit gewoon niets nieuws.",
    );
    return;
  }

  const root = path.join(target, "node_modules", ...name.split("/"));
  const source = STYLESHEET_CANDIDATES.map((candidate) => path.join(root, candidate)).find((file) =>
    fs.existsSync(file),
  );

  if (!source) {
    p.log.warn(
      `Custom UI geïnstalleerd, maar geen globals.css gevonden in "${name}".\n` +
        `Gezocht op: ${STYLESHEET_CANDIDATES.join(", ")}\n` +
        "De frontend houdt zijn eigen tokens. Voeg het juiste pad toe aan STYLESHEET_CANDIDATES in src/steps/ui.ts.",
    );
    return;
  }

  fs.writeFileSync(
    path.join(target, "src", "app", "globals.css"),
    fs.readFileSync(source, "utf8"),
    "utf8",
  );

  p.log.info(`globals.css overgenomen uit ${name}/${path.relative(root, source)}.`);
}

/** De namen van alle dependencies in de package.json van de frontend. */
function dependencyNames(target: string): string[] {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return [];

  const { dependencies = {} } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    dependencies?: Record<string, string>;
  };

  return Object.keys(dependencies);
}
