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
  askHub,
  registerWithHub,
  scaffoldHubAppClient,
  rewireBackendAuth,
  HUB_MOUNT,
  APP_DIR,
  OIDC_DIR,
  OIDC_PORT,
} from "./steps/oidc.js";
import { scaffoldDocker } from "./steps/docker.js";
import { askAppShell, scaffoldAppShell, installDesign } from "./steps/shell.js";
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
  // Alleen relevant als dit project de hub bouwt; wie aansluit erft de schermen.
  const hub = oidc.mode === "new" ? await askHub(frontend === "nextjs") : { mode: "standalone" as const, server: "express" as const };
  const appShell = await askAppShell(frontend);
  const github = await askGithub(defaultName);

  /**
   * Bouwt dit project de hub én draait die in dezelfde app?
   *
   * Dan is er geen aparte ./frontend en ./backend: alles zit in ./app, in één
   * proces op één poort. De hub hangt daar op /oidc, de rest van de paden is
   * van je eigen schermen.
   */
  const hubApp = oidc.mode === "new" && hub.mode === "inapp";
  const appDir = hubApp ? APP_DIR : FRONTEND_DIR;
  /** Waar de hub staat. Bij een hub-app is dat ./app en niet ./oidc. */
  const hubDir = hubApp ? APP_DIR : OIDC_DIR;
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
  // Een hub-app draait op één poort: die van de hub. De frontend zit erin.
  if (frontend === "nextjs" && !hubApp) needed.push("frontend");
  if (backend !== "none" && !hubApp) needed.push("backend");
  if (oidc.mode === "new") needed.push("oidc");
  // De interne poort van de hub telt mee, anders botsen twee hub-apps erop.
  if (hubApp) needed.push("hubApi");

  let ports = await resolvePorts(projectDir, needed);

  // De issuer pas nu vastleggen: hij hangt aan de poort die we net gekozen
  // hebben en aan het mountpad van de hub. Deed askOidc dit, dan stond er
  // http://localhost:9000 in je clients terwijl de hub op 9001 draait.
  if (oidc.mode === "new") {
    oidc.issuer = `http://localhost:${ports.oidc}${hub.mode === "inapp" ? HUB_MOUNT : ""}`;
  }

  // ---- Controles ----------------------------------------------------------
  if (hubApp) {
    assertEmpty(path.join(projectDir, APP_DIR), APP_DIR);

    // Resten van een eerdere run met andere antwoorden. Ze worden niet
    // gebruikt, maar ze staan er wel - en dan draai je zo een commando in de
    // verkeerde map en vraag je je af waarom er niets klopt.
    const oud = [FRONTEND_DIR, BACKEND_DIR, OIDC_DIR].filter((dir) =>
      fs.existsSync(path.join(projectDir, dir)),
    );
    if (oud.length > 0) {
      p.log.warn(
        `Deze mappen staan er nog van een eerdere run: ${oud.map((d) => `./${d}`).join(", ")}.\n` +
          `Een hub-app zet alles in ./${APP_DIR}; die andere doen niet meer mee.\n` +
          "Gooi ze weg als je van nul wil testen.",
      );
    }
  } else {
    if (frontend === "nextjs") {
      assertEmpty(path.join(projectDir, FRONTEND_DIR), FRONTEND_DIR);
    }
    if (backend !== "none") {
      assertEmpty(path.join(projectDir, BACKEND_DIR), BACKEND_DIR);
    }
    if (oidc.mode === "new") {
  assertEmpty(path.join(projectDir, OIDC_DIR), OIDC_DIR);
    }
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
        frontend === "nextjs" ? pc.dim(`  -> ./${appDir}`) : ""
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
          ? `nieuwe server${pc.dim(`  -> ./${hubDir} (poort ${ports.oidc})`)}`
          : oidc.mode === "existing"
            ? `${oidc.issuer}${pc.dim(oidc.isAdminPanel ? "  (dit is het beheerpaneel)" : "")}`
            : "geen",
      )}`,
      ...(oidc.mode === "new"
        ? [
            `${pc.dim("Hub     ")}  ${pc.cyan(
              hub.mode === "inapp"
                ? `${hub.server === "nestjs" ? "NestJS" : "Express"} + Next.js${pc.dim("  een proces, hub op /oidc")}`
                : `eigen server${pc.dim("  schermen als HTML")}`,
            )}`,
          ]
        : []),
      `${pc.dim("Layout  ")}  ${pc.cyan(
        appShell ? "sidebar + topbar uit het design" : "kaal",
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
  // Bij een hub-app landt de frontend meteen in ./app en draait hij op de
  // poort van de hub - het is immers hetzelfde proces.
  await scaffoldFrontend(
    frontend,
    projectDir,
    PACKAGE_MANAGER,
    hubApp ? ports.oidc : ports.frontend,
    appDir,
  );
  await scaffoldCustomUi(customUi, frontend, projectDir, PACKAGE_MANAGER, undefined, appDir);
  if (!hubApp) {
    await scaffoldBackend(backend, projectDir, PACKAGE_MANAGER, ports.backend);
  }
  await scaffoldOidcServer(
    oidc,
    projectDir,
    defaultName,
    PACKAGE_MANAGER,
    hub,
    hubDir,
    {
      oidc: ports.oidc,
      backend: ports.backend,
      frontend: ports.frontend,
      hubApi: ports.hubApi,
    },
  );

  if (hubApp) {
    // De hub-app is ook een gewone client van zichzelf: dezelfde flow, maar
    // alles binnen één proces en één origin.
    await scaffoldHubAppClient(oidc, hub, projectDir, APP_DIR, PACKAGE_MANAGER, ports.oidc);
    scaffoldOidcFrontend(oidc, frontend, projectDir, ports.oidc, APP_DIR);
  } else {
    await scaffoldOidcClient(oidc, backend, projectDir, PACKAGE_MANAGER, {
      backend: ports.backend,
      frontend: ports.frontend,
    });
    scaffoldOidcFrontend(oidc, frontend, projectDir, ports.backend, appDir);
  }

  // Sluit dit project aan op een bestaande hub, dan moet die hem ook kennen.
  await registerWithHub(oidc, ports.backend, ports.frontend);

  // De schil komt na de OIDC-stap: die bepaalt of er een gebruiker op te halen
  // valt, en dat verandert wat AppShell moet doen.
  await scaffoldAppShell(appShell, projectDir, appDir, defaultName, oidc.mode !== "none");

  // ---- Database -----------------------------------------------------------
  // Nu pas: je apps staan er, dus je ziet waar je "ja" tegen zegt. En als het
  // installeren misloopt, heb je die keuze niet voor niets gemaakt.
  // Een hub-app is één app, dus ook één database: die van de app zelf, met de
  // hub erin. Twee vragen stellen zou twee databases opleveren voor iets dat in
  // hetzelfde proces draait - en een ./backend aanmaken die er niet hoort.
  const appDb: Database = hubApp ? await askDatabase("je app") : "none";
  const backendDb: Database =
    hubApp || backend === "none" ? "none" : await askDatabase("de backend");
  const oidcDb: Database = !hubApp && oidc.mode === "new" ? await askDatabase("de OIDC-hub") : "none";

  // Een database-container voor het hele project, dus ook maar een poort.
  if (appDb === "docker" || backendDb === "docker" || oidcDb === "docker") needed.push("db");
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
  // er maar een - net zoals hij op poort 9000 blijft staan. Bij een hub-app is
  // er helemaal geen aparte hub-database: alles zit in app01.
  const credentials = await askDbCredentials(
    resolveDbCredentials(projectDir, oidcDb !== "none"),
    { app: appDb !== "none" || backendDb !== "none", oidc: oidcDb !== "none" },
    appDb === "local" || backendDb === "local" || oidcDb === "local",
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

  // De databasestap heeft src/index.ts (of app.module.ts) opnieuw neergezet en
  // daarmee de auth-bedrading eruit gegooid. Zonder dit staan alle auth-
  // bestanden er wel, maar antwoordt de backend 404 op /auth/start.
  rewireBackendAuth(oidc, backend, projectDir);
  // Bij een hub-app gaat de opslag van de hub in dezelfde database als de app;
  // anders krijgt hij een eigen database naast die van de backend.
  await scaffoldOidcDatabase(
    oidc,
    projectDir,
    PACKAGE_MANAGER,
    hubApp ? appDb : oidcDb,
    targetFor(credentials, hubApp ? "app" : "oidc"),
    ports.db,
    ports.oidc,
    hubDir,
    defaultName,
    // Bij een hub-app draait alles op één poort, dus wijst de callback van de
    // hub naar zichzelf. Anders naar de aparte backend.
    hubApp
      ? `http://localhost:${ports.oidc}/auth/callback`
      : `http://localhost:${ports.backend}/auth/callback`,
    hubApp ? `http://localhost:${ports.oidc}/` : `http://localhost:${ports.frontend}/`,
  );

  scaffoldDocker(
    {
      frontend: frontend === "nextjs" && !hubApp,
      backend: backend !== "none" && !hubApp,
      oidc: oidc.mode === "new",
      database: appDb === "docker" || backendDb === "docker",
      // Bij een hub-app is er geen tweede database om aan te maken.
      oidcDatabase: oidcDb === "docker",
    },
    projectDir,
    {
      projectName: github.useGithub ? github.projectName : defaultName,
      ports,
      backendDevScript: backend === "nestjs" ? "start:dev" : "dev",
      hubMount: hub.mode === "inapp" ? HUB_MOUNT : "",
    },
  );
  // ---- Lokale database aanmaken -------------------------------------------
  // Alleen de database. Je PostgreSQL draait al en je account bestaat al; het
  // enige dat ontbreekt is de database, en zonder die faalt de eerste migratie
  // met "database app01 does not exist".
  const lokaal = [
    ...(appDb === "local" || backendDb === "local" ? [credentials.appDb] : []),
    ...(oidcDb === "local" ? [credentials.oidcDb] : []),
  ];

  if (lokaal.length > 0) {
    await createLocalDatabases({
      // pg staat in de app die we net geinstalleerd hebben; de CLI zelf sleept
      // geen databasedriver mee.
      moduleDir: path.join(
        projectDir,
        appDb === "local" ? APP_DIR : backendDb === "local" ? BACKEND_DIR : hubDir,
      ),
      host: "127.0.0.1",
      port: 5432,
      user: credentials.user,
      password: credentials.password,
      databases: lokaal,
    });
  }

  // ---- Meteen starten? ----------------------------------------------------
  const gestart = await offerToStart(
    hubApp
      ? [{ dir: APP_DIR, database: appDb }]
      : [
          { dir: BACKEND_DIR, database: backendDb },
          { dir: hubDir, database: oidcDb },
        ],
    projectDir,
    PACKAGE_MANAGER,
  );

  await pushToGithub(github, projectDir);

  // ---- Volgende stappen ---------------------------------------------------
  // Commando + bijbehorende URL; de URL's worden onder elkaar uitgelijnd.
  const steps: Array<[command: string, url: string]> = [];

  // De databasestappen komen eerst. Start je een hub-app voordat de tabellen
  // bestaan, dan komt hij wel op maar meldt hij 'relation "clients" does not
  // exist' en kan je nergens inloggen.
  if (!hubApp && frontend === "nextjs") {
    steps.push([
      `cd ${FRONTEND_DIR} && ${PACKAGE_MANAGER} run dev`,
      `http://localhost:${ports.frontend}`,
    ]);
  }
  // Is de database al gestart, dan hoeft die stap er niet meer bij.
  if (hubApp && appDb === "local" && !gestart) {
    steps.push([
      `cd ${APP_DIR} && ${PACKAGE_MANAGER} run db:migrate`,
      `database ${credentials.appDb}`,
    ]);
  } else if (hubApp && appDb === "docker" && !gestart) {
    steps.push([`cd ${APP_DIR} && ${PACKAGE_MANAGER} run db:up`, "database starten en migreren"]);
  } else if (backendDb === "local" && !gestart) {
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

  if (hubApp) {
    // Geen aparte backend: die zit in de app zelf.
  } else if (backend === "node") {
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

  if (hubApp) {
    // Al meegenomen hierboven: één app, één database.
  } else if (oidcDb === "local" && !gestart) {
    steps.push([
      `cd ${hubDir} && ${PACKAGE_MANAGER} run db:migrate`,
      `database ${credentials.oidcDb}`,
    ]);
  } else if (oidcDb === "docker" && !gestart) {
    steps.push([`cd ${hubDir} && ${PACKAGE_MANAGER} run db:up`, "database van de hub"]);
  }

  if (oidc.mode === "new" && !hubApp) {
    steps.push([
      `cd ${OIDC_DIR} && ${PACKAGE_MANAGER} run dev`,
      `http://localhost:${ports.oidc}/.well-known/openid-configuration`,
    ]);
  }

  // De hub-app als laatste: één commando dat Next en de hub samen start.
  if (hubApp) {
    steps.push([
      `cd ${APP_DIR} && ${PACKAGE_MANAGER} run dev`,
      `http://localhost:${ports.oidc}  (hub op /oidc)`,
    ]);
  }

  const outParts: string[] = [pc.green("Klaar!")];

  // Bouw je hier een hub, dan heb je zijn registratietoken nodig zodra je de
  // volgende app aansluit. Zonder dat token meldt de CLI die app niet aan en
  // strandt je eerste login op invalid_client - dus zetten we hem hier, waar je
  // hem meteen kan kopieren, en niet alleen in een .env die je moet opzoeken.
  if (oidc.mode === "new") {
    const hubEnv = path.join(projectDir, hubDir, ".env");
    const token = fs.existsSync(hubEnv)
      ? (/^HUB_REGISTRATION_TOKEN=(.*)$/m.exec(fs.readFileSync(hubEnv, "utf8"))?.[1] ?? "").trim()
      : "";
    if (token) {
      outParts.push(
        pc.dim("Registratietoken van deze hub (nodig voor je volgende app):") +
          "\n  " +
          pc.cyan(token),
      );
    }
  }

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
