import path from "node:path";
import * as p from "@clack/prompts";
import { runQuiet } from "../utils/exec.js";
import { withProgress } from "../utils/progress.js";
import { setupPrettier } from "../utils/prettier.js";
import { addDeps } from "../utils/install.js";
import { setupNextIntl, LOCALES, DEFAULT_LOCALE } from "./i18n.js";
import { setupTheme } from "./theme.js";
import { setupRules } from "./rules.js";
import type { PackageManager } from "../types.js";

/** Submap binnen het project waarin de frontend wordt geïnstalleerd. */
export const FRONTEND_DIR = "frontend";

export type Frontend = "nextjs" | "none";

/**
 * Vraag 1: welke frontend?
 * Voorlopig enkel Next.js (altijd de laatste versie).
 */
export async function askFrontend(): Promise<Frontend> {
  const choice = await p.select({
    message: "Welke frontend wil je gebruiken?",
    initialValue: "nextjs" as Frontend,
    options: [
      {
        value: "nextjs" as const,
        label: `Next.js (laatste versie + TypeScript + Tailwind + next-intl: ${LOCALES.join("/")})`,
        hint: "aanbevolen",
      },
      { value: "none" as const, label: "Geen frontend" },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return choice;
}

/**
 * Genereert een Next.js-project met create-next-app@latest in ./frontend.
 * Stil uitgevoerd, met een eigen progress-bar erboven.
 */
export async function scaffoldFrontend(
  frontend: Frontend,
  projectDir: string,
  pm: PackageManager,
): Promise<void> {
  if (frontend === "none") {
    p.log.info("Geen frontend gekozen — overgeslagen.");
    return;
  }

  const target = path.join(projectDir, FRONTEND_DIR);
  p.log.step(
    `Next.js + next-intl (${LOCALES.join(", ")}, standaard ${DEFAULT_LOCALE}) + Prettier opzetten in ./${FRONTEND_DIR} ...`,
  );

  const pmFlag = pm === "pnpm" ? "--use-pnpm" : pm === "yarn" ? "--use-yarn" : "--use-npm";

  await withProgress(
    "Next.js installeren (laatste versie)",
    async () => {
      await runQuiet(
        "npx",
        [
          "--yes",
          "create-next-app@latest",
          target,
          "--typescript",
          "--tailwind",
          "--eslint",
          "--app",
          "--src-dir",
          "--import-alias",
          "@/*",
          pmFlag,
          "--yes",
        ],
        projectDir,
      );
    },
    45000,
  );

  await withProgress(
    "next-intl + light/dark mode opzetten",
    async () => {
      // Bestanden eerst wegschrijven, daarna de packages installeren.
      setupTheme(target);
      setupNextIntl(target);
      setupRules(target);
      await addDeps(pm, target, ["next-intl@latest", "react-icons@latest"]);
    },
    25000,
  );

  await withProgress(
    "Prettier + tailwind-plugin installeren",
    async () => {
      await setupPrettier(pm, target);
    },
    20000,
  );

  p.log.success(
    `Next.js + next-intl + light/dark + Prettier aangemaakt in ./${FRONTEND_DIR} (talen: ${LOCALES.join(", ")}, standaard: ${DEFAULT_LOCALE}).`,
  );
}
