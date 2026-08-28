import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { addDeps, addDevDeps } from "../utils/install.js";
import { run } from "../utils/exec.js";
import { withProgress } from "../utils/progress.js";
import { copyTemplate } from "../utils/template.js";
import { mergeEnv } from "../utils/env.js";
import type { DbCredentials } from "../utils/dbnames.js";
import { BACKEND_PORT, type Backend } from "./backend.js";
import type { PackageManager } from "../types.js";

/**
 * De databasevraag. Wordt apart gesteld voor de backend en voor de OIDC-hub,
 * zodat je die twee op een aparte database kan zetten.
 *
 * Alleen PostgreSQL. Dat scheelt een dialectlaag: de datalaag praat rechtstreeks
 * met de pg-driver en de SQL in je migraties is de SQL die echt draait.
 */
export type Database = "docker" | "local" | "none";

const DEFAULT_DB_PORT = 55432;
const LABEL = "PostgreSQL";

/**
 * Vraagt hoe de database, de gebruiker en het wachtwoord moeten heten.
 *
 * De voorstellen kloppen al: app01 voor je eerste project, app02 voor je
 * tweede, en "oidc" voor de hub - die schuift niet mee, want er draait er maar
 * een. Enter drukken is dus een prima antwoord. Wil je "webshop" in plaats van
 * app01, dan typ je dat gewoon.
 *
 * Staat er al een .env, dan valt er niets meer te kiezen: mergeEnv laat
 * bestaande sleutels staan, dus een ander antwoord zou toch niet in het bestand
 * terechtkomen.
 */
export async function askDbCredentials(
  defaults: DbCredentials,
  needs: { app: boolean; oidc: boolean },
): Promise<DbCredentials> {
  if (!needs.app && !needs.oidc) return defaults;

  if (defaults.existing) {
    p.log.info(
      `Er staat al een .env; die blijft leiden.\n` +
        `  gebruiker  ${defaults.user}\n` +
        (needs.app ? `  database   ${defaults.appDb}\n` : "") +
        (needs.oidc ? `  hub        ${defaults.oidcDb}\n` : "") +
        `Wil je andere namen, gooi dan de .env weg en scaffold opnieuw.`,
    );
    return defaults;
  }

  const appDb = needs.app
    ? await askName("Naam van de database", defaults.appDb, "je backend")
    : defaults.appDb;

  const oidcDb = needs.oidc
    ? await askName("Naam van de database van de OIDC-hub", defaults.oidcDb, "er draait er maar een")
    : defaults.oidcDb;

  // Standaard heet de rol net zo als de database. Kies je "webshop", dan stelt
  // hij "webshop" voor - niet nog steeds app01.
  const user = await askName(
    "Gebruiker waarmee de apps inloggen",
    needs.app ? appDb : defaults.user,
    "krijgt alleen rechten op deze databases",
  );

  const password = await p.text({
    message: "Wachtwoord van die gebruiker",
    initialValue: defaults.password,
    validate: validatePassword,
  });

  if (p.isCancel(password)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return { ...defaults, appDb, oidcDb, user, password: String(password).trim() };
}

/** Een vraag naar een naam die PostgreSQL zonder aanhalingstekens slikt. */
async function askName(message: string, initialValue: string, hint: string): Promise<string> {
  const answer = await p.text({
    message: `${message} ${pc.dim(`(${hint})`)}`,
    initialValue,
    validate: validateName,
  });

  if (p.isCancel(answer)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return String(answer).trim();
}

/**
 * Namen bewust streng: kleine letters, cijfers en _.
 *
 * PostgreSQL maakt van een naam zonder aanhalingstekens stilletjes kleinletters.
 * Noem je je database "Webshop", dan heet hij in werkelijkheid "webshop" - maar
 * niet als iemand hem ooit met "Webshop" aanmaakt. Dat verschil kost je een
 * halve avond, dus laten we het gewoon niet toe.
 */
function validateName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Mag niet leeg zijn.";
  if (name.length > 63) return "PostgreSQL kapt namen af na 63 tekens.";
  if (/[A-Z]/.test(name)) return "Geen hoofdletters: PostgreSQL maakt daar toch kleine letters van.";
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    return "Alleen kleine letters, cijfers en _, en niet beginnen met een cijfer.";
  }
  return undefined;
}

/**
 * Wachtwoorden bewust streng op een handvol tekens.
 *
 * Elk van deze heeft hier al een keer een avond gekost:
 *   #        Node kapt de waarde daar af bij het lezen van .env, Docker niet.
 *   $        Docker Compose ziet dat als een variabele om in te vullen.
 *   % en &   cmd.exe op Windows vult in / knipt het commando doormidden.
 *   ' " ` \\  breken de string in SQL, YAML of de shell.
 *   spatie   .env-waarden met spaties lezen niet betrouwbaar in.
 */
function validatePassword(value: string): string | undefined {
  const secret = value.trim();
  if (!secret) return "Mag niet leeg zijn.";
  if (secret.length < 12) return "Minstens 12 tekens.";
  if (/\s/.test(value)) return "Geen spaties: .env leest die niet betrouwbaar in.";

  const bad = [...new Set([...secret])].filter((c) => "#$%&'\"`\\".includes(c));
  if (bad.length > 0) {
    return `Deze tekens gaan onderweg stuk: ${bad.join(" ")}  (in .env, Docker Compose of cmd.exe)`;
  }

  return undefined;
}

/**
 * De database van EEN app.
 *
 * De rol is gedeeld: de backend en de OIDC-hub van hetzelfde project loggen
 * allebei in als app01, elk op hun eigen database (app01 en oidc). Zo heb je een
 * wachtwoord per project in plaats van een per app, en kan je met dat ene
 * account in pgAdmin bij allebei.
 */
export interface DbTarget {
  name: string;
  user: string;
  password: string;
}

/** De backend gebruikt de hoofddatabase, de hub die met _oidc erachter. */
export function targetFor(credentials: DbCredentials, what: "app" | "oidc"): DbTarget {
  return {
    name: what === "app" ? credentials.appDb : credentials.oidcDb,
    user: credentials.user,
    password: credentials.password,
  };
}

export async function askDatabase(what: string): Promise<Database> {
  const choice = await p.select({
    message: `Welke database voor ${what}?`,
    initialValue: "docker" as Database,
    options: [
      {
        value: "docker" as const,
        label: "PostgreSQL in Docker",
        hint: "aanbevolen — de CLI regelt alles",
      },
      {
        value: "local" as const,
        label: "PostgreSQL die ik zelf draai",
        hint: "je hebt er al een geinstalleerd",
      },
      { value: "none" as const, label: "Geen database" },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }

  return choice;
}

/**
 * Zet de databaselaag in `target`: src/db/, de migraties, docker-compose, .env
 * en de npm-scripts. Koppelt daarna de gekozen backend eraan vast.
 */
export async function scaffoldDatabase(
  database: Database,
  target: string,
  backend: Backend,
  pm: PackageManager,
  update: ((label: string) => void) | undefined,
  db: DbTarget,
  /** Host-poort van de database. De container luistert altijd op 5432. */
  dbPort: number = DEFAULT_DB_PORT,
  /** Poort van de app zelf; alleen nodig voor de Express-server. */
  appPort: number = 5000,
): Promise<void> {
  if (database === "none") return;

  update?.("Databaselaag kopieren");
  copyTemplate("db", target, {});

  if (backend === "node") {
    // Vervangt de kale Express-server door een die verbindt, /health op de
    // database controleert en een voorbeeldroute heeft.
    copyTemplate("db-express", target, { PORT: appPort });
  }

  if (backend === "nestjs") {
    copyTemplate("db-nest", target, {});
    patchNestModule(target);
    prependEnvImport(path.join(target, "src", "main.ts"), "./env.js");
  }

  update?.("Driver installeren");
  await addDeps(pm, target, ["pg@latest"]);
  // tsx hoort hier en niet alleen bij de Express-backend: de migratieloper is
  // een TypeScript-bestand dat je los van je app draait, en NestJS brengt tsx
  // niet mee. Zonder dit faalt `npm run db:migrate` met
  // "'tsx' is not recognized as an internal or external command".
  await addDevDeps(pm, target, ["@types/pg@latest", "tsx@latest"]);

  update?.("Configuratie schrijven");
  // Een PostgreSQL die je zelf draait luistert op de standaardpoort 5432. De
  // uitgeweken poort geldt alleen voor de container, die we zelf publiceren.
  writeEnv(database, target, db, database === "local" ? 5432 : dbPort);
  addScripts(target, database);
}

/**
 * Schrijft .env (met het echte wachtwoord) en .env.example (zonder).
 *
 * Zowel in Docker als lokaal logt de app in als zijn eigen rol - nooit meer als
 * superuser postgres. In Docker maakt het image die rol aan, lokaal doet de CLI
 * dat zelf (zie steps/localdb.ts).
 */
function writeEnv(
  database: Exclude<Database, "none">,
  target: string,
  db: DbTarget,
  dbPort: number,
): void {
  const dbName = db.name;
  const password = db.password;

  const docker = database === "docker";

  const lines = (secret: string): string =>
    [
      ...(docker
        ? [
            "# PostgreSQL in Docker. De container luistert intern op 5432; dit is de",
            "# poort op jouw machine. Bewust niet 5432 - die is te druk op een",
            "# ontwikkelmachine.",
          ]
        : [
            "# PostgreSQL die je zelf draait. De CLI heeft de rol en de database",
            "# hieronder voor je aangemaakt. Zelf opnieuw doen kan zo (als postgres):",
            `#   CREATE ROLE "${db.user}" LOGIN PASSWORD '...';`,
            `#   CREATE DATABASE "${dbName}" OWNER "${db.user}";`,
          ]),
      "DB_HOST=127.0.0.1",
      `DB_PORT=${dbPort}`,
      `DB_USER=${db.user}`,
      `DB_PASSWORD=${secret}`,
      `DB_NAME=${dbName}`,
      "",
      "# Versleutelde verbinding. Zet dit op true voor een gehoste database;",
      "# lokaal in Docker hoort het op false.",
      "DB_SSL=false",
      "",
      "# Maximum aantal gelijktijdige verbindingen.",
      "DB_POOL_SIZE=10",
      "",
    ].join("\n");

  // Aanvullen, niet overschrijven: een andere stap kan hier al sleutels hebben.
  mergeEnv(path.join(target, ".env"), lines(password));
  mergeEnv(path.join(target, ".env.example"), lines("verander-dit-Wachtwoord1!"));

  // .env hoort nooit in git.
  const gitignore = path.join(target, ".gitignore");
  const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
  if (!current.split(/\r?\n/).includes(".env")) {
    fs.writeFileSync(gitignore, current.trimEnd() + "\n.env\n", "utf8");
  }
}

/**
 * Het compose-bestand staat in de hoofdmap van het project, een niveau boven
 * deze app. Expliciet met -f, zodat het niet uitmaakt vanuit welke map je het
 * draait.
 */
const COMPOSE = "docker compose -f ../docker-compose.yml";

/** Voegt de db-scripts toe aan package.json. */
function addScripts(target: string, database: Exclude<Database, "none">): void {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return;

  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as {
    scripts?: Record<string, string>;
  };

  const docker = database === "docker";

  pkg.scripts = {
    ...pkg.scripts,
    ...(docker
      ? {
    // Een commando dat je nooit fout kan doen: database starten, wachten tot
    // hij ECHT klaar is (--wait), en dan pas migreren. Zonder --wait geeft
    // compose de prompt al terug terwijl PostgreSQL nog initialiseert, en dan
    // faalt de migratie met "Connection terminated unexpectedly".
          "db:up": `${COMPOSE} up -d --wait db && tsx src/db/migrate.ts up`,
          "db:reset": `${COMPOSE} down -v && npm run db:up`,
          // pgAdmin start alleen als je erom vraagt; zie het profiel in compose.
          "db:admin": `${COMPOSE} --profile tools up -d --wait pgadmin`,
        }
      : {}),
    "db:migrate": "tsx src/db/migrate.ts up",
    "db:rollback": "tsx src/db/migrate.ts down",
    "db:migrate:status": "tsx src/db/migrate.ts status",
  };

  fs.writeFileSync(file, JSON.stringify(pkg, null, 4) + "\n", "utf8");
}

/**
 * Zet `import './env.js'` als allereerste regel van het startbestand.
 *
 * Moet echt de eerste import zijn: ES-modules evalueren alle imports voor de
 * code eronder draait, dus een process.loadEnvFile() halverwege komt te laat.
 */
function prependEnvImport(file: string, specifier: string): void {
  if (!fs.existsSync(file)) return;

  const source = fs.readFileSync(file, "utf8");
  if (source.includes(specifier)) return;

  const comment = "// Leest .env in. Moet de eerste import blijven - zie src/env.ts.";
  fs.writeFileSync(file, `${comment}\nimport '${specifier}'\n\n${source}`, "utf8");
}

/** Hangt de DbModule in de AppModule die Nest zelf genereerde. */
function patchNestModule(target: string): void {
  const file = path.join(target, "src", "app.module.ts");
  if (!fs.existsSync(file)) return;

  let source = fs.readFileSync(file, "utf8");
  if (source.includes("DbModule")) return;

  source = `import { DbModule } from './db/db.module.js';\n` + source;

  // Aanvullen, niet vervangen: de OIDC-stap kan hier al een AuthModule hebben
  // neergezet. Zoeken naar een lege [] werkt dan niet meer.
  source = source.replace(/imports:\s*\[([^\]]*)\]/, (_match, inner: string) =>
    inner.trim() ? `imports: [${inner.trim()}, DbModule]` : "imports: [DbModule]",
  );

  fs.writeFileSync(file, source, "utf8");
}

/** Label voor in de meldingen. */
export function databaseLabel(database: Database): string {
  if (database === "none") return "geen";
  return database === "docker" ? `${LABEL} in Docker` : `${LABEL} (zelf draaiend)`;
}

/**
 * De databaselaag in de backend zetten, met eigen kop en progress-bar.
 * De OIDC-hub doet dit zelf, binnen zijn eigen bar.
 */
export async function scaffoldBackendDatabase(
  database: Database,
  projectDir: string,
  backendDir: string,
  backend: Backend,
  pm: PackageManager,
  db: DbTarget,
  dbPort: number = DEFAULT_DB_PORT,
  appPort: number = 5000,
): Promise<void> {
  if (database === "none" || backend === "none") return;

  const target = path.join(projectDir, backendDir);
  p.log.step(`${LABEL} koppelen aan ./${backendDir} ...`);

  await withProgress(
    "Databaselaag opzetten",
    async (update) => {
      await scaffoldDatabase(database, target, backend, pm, update, db, dbPort, appPort);
    },
    35000,
  );

  p.log.success(`${databaseLabel(database)} gekoppeld aan ./${backendDir}.`);

  p.log.info(
    database === "docker"
      ? `Database starten en migreren in een keer:\n  cd ${backendDir} && ${pm} run db:up`
      : `Database ${db.name}, gebruiker ${db.user}. Migreren:\n` +
          `  cd ${backendDir} && ${pm} run db:migrate`,
  );
}

/**
 * Vraagt of de database meteen gestart moet worden, en doet het dan ook.
 *
 * De laatste stap van de CLI. Bij "ja" heb je een draaiende database met
 * uitgevoerde migraties in plaats van een lijstje commando's dat je zelf nog
 * moet afwerken.
 *
 * Lokaal draait de server al; daar valt niets te starten en hoeven alleen de
 * migraties nog te lopen. Vandaar twee scripts: db:up in Docker, db:migrate
 * daarbuiten.
 */
export async function offerToStart(
  targets: { dir: string; database: Database }[],
  projectDir: string,
  pm: PackageManager,
): Promise<boolean> {
  const todo = targets.filter((t) => t.database !== "none");
  if (todo.length === 0) return false;

  const docker = todo.some((t) => t.database === "docker");

  const answer = await p.confirm({
    message: docker
      ? "Zal ik de database nu starten en de migraties draaien?"
      : "Zal ik de migraties nu draaien?",
    initialValue: true,
  });

  if (p.isCancel(answer) || !answer) return false;

  for (const { dir, database } of todo) {
    const script = database === "docker" ? "db:up" : "db:migrate";
    p.log.step(
      database === "docker" ? `Database starten voor ./${dir} ...` : `Migreren in ./${dir} ...`,
    );

    try {
      // Bewust met zichtbare output: dit haalt images op en dat duurt even.
      // Een stille progress-bar zou lijken alsof er niets gebeurt.
      await run(pm, ["run", script], path.join(projectDir, dir));
      p.log.success(
        database === "docker"
          ? `Database van ./${dir} draait, migraties uitgevoerd.`
          : `Migraties van ./${dir} uitgevoerd.`,
      );
    } catch (err) {
      p.log.warn(
        `Niet gelukt voor ./${dir}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}\n` +
          (database === "docker" ? "Draait Docker? " : "Draait PostgreSQL? ") +
          `Probeer het daarna zelf:\n  cd ${dir} && ${pm} run ${script}`,
      );
      return false;
    }
  }

  return true;
}
