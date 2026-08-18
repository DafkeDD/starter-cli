#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { askFrontend, scaffoldFrontend, FRONTEND_DIR } from "./steps/frontend.js";
import { askBackend, scaffoldBackend, BACKEND_DIR, BACKEND_PORT } from "./steps/backend.js";
import { LOCALES, DEFAULT_LOCALE } from "./steps/i18n.js";
import type { PackageManager } from "./types.js";

/** Package manager voor de gegenereerde projecten. */
const PACKAGE_MANAGER: PackageManager = "npm";

/** Stopt als een doelmap al bestaat en niet leeg is. */
function assertEmpty(dir: string, label: string): void {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    p.cancel(`De map "./${label}" bestaat al en is niet leeg.`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.clear();
  p.intro(pc.bgCyan(pc.black(" starter-cli ")));

  // Installeert in de huidige map (waar het commando gedraaid wordt).
  const projectDir = process.cwd();

  // ---- Vragen -------------------------------------------------------------
  const frontend = await askFrontend();
  const backend = await askBackend();
  // Volgende vragen komen hier (database, ...).

  // ---- Controles ----------------------------------------------------------
  if (frontend === "nextjs") {
    assertEmpty(path.join(projectDir, FRONTEND_DIR), FRONTEND_DIR);
  }
  if (backend !== "none") {
    assertEmpty(path.join(projectDir, BACKEND_DIR), BACKEND_DIR);
  }

  // ---- Overzicht ----------------------------------------------------------
  const backendLabel =
    backend === "node"
      ? `Node.js + Express${pc.dim(`  -> ./${BACKEND_DIR} (poort ${BACKEND_PORT})`)}`
      : backend === "nestjs"
        ? `NestJS${pc.dim(`  -> ./${BACKEND_DIR} (poort ${BACKEND_PORT})`)}`
        : "geen";

  p.note(
    [
      `${pc.dim("Locatie ")}  ${pc.cyan(projectDir)}`,
      `${pc.dim("Frontend")}  ${pc.cyan(frontend)}${
        frontend === "nextjs" ? pc.dim(`  -> ./${FRONTEND_DIR}`) : ""
      }`,
      `${pc.dim("Backend ")}  ${pc.cyan(backendLabel)}`,
      `${pc.dim("i18n    ")}  ${pc.cyan(`next-intl (${LOCALES.join(", ")})`)}${pc.dim(
        `  standaard: ${DEFAULT_LOCALE}`,
      )}`,
      `${pc.dim("Thema   ")}  ${pc.cyan("light / dark / system")}${pc.dim("  cookie-based, geen flits")}`,
      `${pc.dim("UI      ")}  ${pc.cyan("zelfgebouwde componenten")}${pc.dim("  geen shadcn/ui of andere library")}`,
      `${pc.dim("Prettier")}  ${pc.cyan("frontend + backend")}${pc.dim("  zelfde projectsettings")}`,
      `${pc.dim("Manager ")}  ${pc.cyan(PACKAGE_MANAGER)}`,
    ].join("\n"),
    "Overzicht",
  );

  // ---- Genereren ----------------------------------------------------------
  await scaffoldFrontend(frontend, projectDir, PACKAGE_MANAGER);
  await scaffoldBackend(backend, projectDir, PACKAGE_MANAGER);

  // ---- Volgende stappen ---------------------------------------------------
  const steps: string[] = [];
  if (frontend === "nextjs") {
    steps.push(`cd ${FRONTEND_DIR} && ${PACKAGE_MANAGER} run dev`);
  }
  if (backend === "node") {
    steps.push(`cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run dev        # http://localhost:${BACKEND_PORT}/health`);
  } else if (backend === "nestjs") {
    steps.push(`cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run start:dev  # http://localhost:${BACKEND_PORT}`);
  }

  const outParts: string[] = [pc.green("Klaar!")];
  if (steps.length) {
    outParts.push(pc.dim("Volgende stappen:") + "\n  " + steps.join("\n  "));
  }
  p.outro(outParts.join("\n\n"));
}

main().catch((err: unknown) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
