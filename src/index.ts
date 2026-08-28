#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { askFrontend, scaffoldFrontend, FRONTEND_DIR, FRONTEND_PORT } from "./steps/frontend.js";
import { askCustomUi, scaffoldCustomUi } from "./steps/ui.js";
import { askBackend, scaffoldBackend, BACKEND_DIR, BACKEND_PORT } from "./steps/backend.js";
import {
  askDatabase,
  scaffoldBackendDatabase,
  databaseLabel,
  offerToStart,
  targetFor,
  askDbCredentials,
  type Database,
} from "./steps/database.js";
import { createLocalDatabases } from "./steps/localdb.js";
import {
  askOidc,
  scaffoldOidcServer,
  scaffoldOidcDatabase,
  scaffoldOidcClient,
  scaffoldOidcFrontend,
  OIDC_DIR,
  OIDC_PORT,
} from "./steps/oidc.js";
import { scaffoldDocker } from "./steps/docker.js";
import { askGithub, pushToGithub } from "./steps/github.js";
import { LOCALES, DEFAULT_LOCALE } from "./steps/i18n.js";
import { resolvePorts, isShifted, type PortName } from "./utils/ports.js";
import { resolveDbCredentials, rememberOidcDb } from "./utils/dbnames.js";
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
  const defaultName = path.basename(projectDir);

  // ---- Vragen -------------------------------------------------------------
  const frontend = await askFrontend();
  const customUi = await askCustomUi(frontend);
  const backend = await askBackend();
  const oidc = await askOidc(defaultName);
  const github = await askGithub(defaultName);
  // De databasevragen komen bewust later, als alles geinstalleerd is.

  // ---- Poorten ------------------------------------------------------------
  // Vast in de code van het gegenereerde project, nooit uit de omgeving. Draait
  // er al een ander project, dan schuiven ze een plek op zodat je ze naast
  // elkaar kan draaien.
  //
  // Alleen wat dit project echt draait wordt geclaimd. Sluit je aan op een
  // bestaande OIDC-hub, dan reserveert dit project geen hub-poort - die hub
  // draait er maar een, gedeeld door al je apps, en blijft dus op 9000.
  // De poorten van de databases komen er later bij, als die vraag gesteld is.
  const needed: PortName[] = [];
  if (frontend === "nextjs") needed.push("frontend");
  if (backend !== "none") needed.push("backend");
  if (oidc.mode === "new") needed.push("oidc");

  let ports = await resolvePorts(projectDir, needed);

  // ---- Controles ----------------------------------------------------------
  if (frontend === "nextjs") {
    assertEmpty(path.join(projectDir, FRONTEND_DIR), FRONTEND_DIR);
  }
  if (backend !== "none") {
    assertEmpty(path.join(projectDir, BACKEND_DIR), BACKEND_DIR);
  }
  if (oidc.mode === "new") {
    assertEmpty(path.join(projectDir, OIDC_DIR), OIDC_DIR);
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
      `${pc.dim("UI      ")}  ${pc.cyan(
        customUi ? "projectx-ui" : "zelfgebouwde componenten",
      )}${pc.dim(customUi ? "  gedeelde layout en componenten" : "  geen shadcn/ui of andere library")}`,
      `${pc.dim("OIDC    ")}  ${pc.cyan(
        oidc.mode === "new"
          ? `nieuwe server${pc.dim(`  -> ./${OIDC_DIR} (poort ${OIDC_PORT})`)}`
          : oidc.mode === "existing"
            ? `${oidc.issuer}${pc.dim(oidc.isAdminPanel ? "  (dit is het beheerpaneel)" : "")}`
            : "geen",
      )}`,
      `${pc.dim("Prettier")}  ${pc.cyan("frontend + backend")}${pc.dim("  zelfde projectsettings")}`,
      `${pc.dim("GitHub  ")}  ${pc.cyan(
        github.useGithub
          ? `${github.projectName}${pc.dim(`  (${github.isPrivate ? "privé" : "openbaar"})`)}`
          : "geen",
      )}`,
      `${pc.dim("Poorten ")}  ${pc.cyan(
        [
          frontend === "nextjs" ? `frontend ${ports.frontend}` : "",
          backend === "none" ? "" : `backend ${ports.backend}`,
          oidc.mode === "new" ? `hub ${ports.oidc}` : "",
        ]
          .filter(Boolean)
          .join(", "),
      )}${pc.dim(isShifted(ports, needed) ? "  opgeschoven: er draait al een ander project" : "")}`,
      `${pc.dim("Manager ")}  ${pc.cyan(PACKAGE_MANAGER)}`,
    ].join("\n"),
    "Overzicht",
  );

  // ---- Genereren ----------------------------------------------------------
  await scaffoldFrontend(frontend, projectDir, PACKAGE_MANAGER, ports.frontend);
  await scaffoldCustomUi(customUi, frontend, projectDir, PACKAGE_MANAGER);
  await scaffoldBackend(backend, projectDir, PACKAGE_MANAGER, ports.backend);
  await scaffoldOidcServer(oidc, projectDir, defaultName, PACKAGE_MANAGER, {
    oidc: ports.oidc,
    backend: ports.backend,
    frontend: ports.frontend,
  });
  await scaffoldOidcClient(oidc, backend, projectDir, PACKAGE_MANAGER, {
    backend: ports.backend,
    frontend: ports.frontend,
  });
  scaffoldOidcFrontend(oidc, frontend, projectDir, ports.backend);

  // ---- Database -----------------------------------------------------------
  // Nu pas: je apps staan er, dus je ziet waar je "ja" tegen zegt. En als het
  // installeren misloopt, heb je die keuze niet voor niets gemaakt.
  const backendDb: Database = backend === "none" ? "none" : await askDatabase("de backend");
  const oidcDb: Database = oidc.mode === "new" ? await askDatabase("de OIDC-hub") : "none";

  // Een database-container voor het hele project, dus ook maar een poort.
  if (backendDb === "docker" || oidcDb === "docker") needed.push("db");
  if (needed.includes("db")) {
    // Opnieuw met de volledige lijst: eerder gekozen poorten blijven staan,
    // alleen de nieuwe komen erbij.
    ports = await resolvePorts(projectDir, needed);
  }

  // Namen en wachtwoord voor dit project: database app01, rol app01. Een tweede
  // project dat je scaffold krijgt app02. Dat moet wel, want draai je PostgreSQL
  // zelf dan zitten al je projecten op dezelfde server.
  //
  // De hub krijgt geen nummer: die database heet gewoon "oidc", want er draait
  // er maar een - net zoals hij op poort 9000 blijft staan.
  const credentials = await askDbCredentials(
    resolveDbCredentials(projectDir, oidcDb !== "none"),
    { app: backendDb !== "none", oidc: oidcDb !== "none" },
  );
  // Koos je zelf een naam voor de hub, dan moet het register die kennen -
  // anders stelt een volgende hub dezelfde naam voor.
  if (oidcDb !== "none") rememberOidcDb(projectDir, credentials.oidcDb);

  await scaffoldBackendDatabase(
    backendDb,
    projectDir,
    BACKEND_DIR,
    backend,
    PACKAGE_MANAGER,
    targetFor(credentials, "app"),
    ports.db,
    ports.backend,
  );
  // Dezelfde poort als de backend: dezelfde container, andere database erin.
  await scaffoldOidcDatabase(
    oidc,
    projectDir,
    PACKAGE_MANAGER,
    oidcDb,
    targetFor(credentials, "oidc"),
    ports.db,
    ports.oidc,
  );

  scaffoldDocker(
    {
      frontend: frontend === "nextjs",
      backend: backend !== "none",
      oidc: oidc.mode === "new",
      database: backendDb === "docker",
      oidcDatabase: oidcDb === "docker",
    },
    projectDir,
    {
      projectName: github.useGithub ? github.projectName : defaultName,
      ports,
      backendDevScript: backend === "nestjs" ? "start:dev" : "dev",
    },
  );
  // ---- Lokale database aanmaken -------------------------------------------
  // In Docker doet het image dit. Draai je PostgreSQL zelf, dan bestaat de rol
  // app01 nog niet en zou de eerste migratie stukgaan op "role does not exist".
  const lokaal = [
    ...(backendDb === "local" ? [credentials.appDb] : []),
    ...(oidcDb === "local" ? [credentials.oidcDb] : []),
  ];

  if (lokaal.length > 0) {
    await createLocalDatabases({
      // pg staat in de app die we net geinstalleerd hebben; de CLI zelf sleept
      // geen databasedriver mee.
      moduleDir: path.join(projectDir, backendDb === "local" ? BACKEND_DIR : OIDC_DIR),
      host: "127.0.0.1",
      port: 5432,
      user: credentials.user,
      password: credentials.password,
      databases: lokaal,
    });
  }

  // ---- Meteen starten? ----------------------------------------------------
  const gestart = await offerToStart(
    [
      { dir: BACKEND_DIR, database: backendDb },
      { dir: OIDC_DIR, database: oidcDb },
    ],
    projectDir,
    PACKAGE_MANAGER,
  );

  await pushToGithub(github, projectDir);

  // ---- Volgende stappen ---------------------------------------------------
  // Commando + bijbehorende URL; de URL's worden onder elkaar uitgelijnd.
  const steps: Array<[command: string, url: string]> = [];
  if (frontend === "nextjs") {
    steps.push([
      `cd ${FRONTEND_DIR} && ${PACKAGE_MANAGER} run dev`,
      `http://localhost:${ports.frontend}`,
    ]);
  }
  // Is de database al gestart, dan hoeft die stap er niet meer bij.
  if (backendDb === "local" && !gestart) {
    steps.push([
      `cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run db:migrate`,
      `database ${credentials.appDb}`,
    ]);
  } else if (backendDb === "docker" && !gestart) {
    steps.push([
      `cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run db:up`,
      "database starten en migreren",
    ]);
  }

  if (backend === "node") {
    steps.push([
      `cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run dev`,
      `http://localhost:${ports.backend}/health`,
    ]);
  } else if (backend === "nestjs") {
    steps.push([
      `cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run start:dev`,
      `http://localhost:${ports.backend}`,
    ]);
  }

  if (oidcDb === "local" && !gestart) {
    steps.push([
      `cd ${OIDC_DIR} && ${PACKAGE_MANAGER} run db:migrate`,
      `database ${credentials.oidcDb}`,
    ]);
  } else if (oidcDb === "docker" && !gestart) {
    steps.push([`cd ${OIDC_DIR} && ${PACKAGE_MANAGER} run db:up`, "database van de hub"]);
  }

  if (oidc.mode === "new") {
    steps.push([
      `cd ${OIDC_DIR} && ${PACKAGE_MANAGER} run dev`,
      `http://localhost:${ports.oidc}/.well-known/openid-configuration`,
    ]);
  }

  const outParts: string[] = [pc.green("Klaar!")];
  if (steps.length) {
    const widest = Math.max(...steps.map(([command]) => command.length));
    const lines = steps.map(
      ([command, url]) => `${command.padEnd(widest)}  ${pc.dim(`# ${url}`)}`,
    );
    outParts.push(pc.dim("Volgende stappen:") + "\n  " + lines.join("\n  "));
  }
  p.outro(outParts.join("\n\n"));
}

main().catch((err: unknown) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
