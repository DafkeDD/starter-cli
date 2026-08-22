import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { addDeps, addDevDeps } from "../utils/install.js";
import { withProgress } from "../utils/progress.js";
import { copyTemplate } from "../utils/template.js";
import { mergeEnv } from "../utils/env.js";
import { BACKEND_PORT, type Backend } from "./backend.js";
import type { PackageManager } from "../types.js";

/**
 * De databasevraag. Wordt apart gesteld voor de backend en voor de OIDC-hub,
 * zodat je die twee op een aparte database kan zetten.
 *
 * Alleen PostgreSQL. Dat scheelt een dialectlaag: de datalaag praat rechtstreeks
 * met de pg-driver en de SQL in je migraties is de SQL die echt draait.
 */
export type Database = "postgres" | "none";

const DEFAULT_DB_PORT = 5432;
const LABEL = "PostgreSQL";

export async function askDatabase(what: string): Promise<Database> {
  const choice = await p.select({
    message: `Welke database voor ${what}?`,
    initialValue: "postgres" as Database,
    options: [
      { value: "postgres" as const, label: "PostgreSQL", hint: "aanbevolen" },
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
  update?: (label: string) => void,
  dbName = "app",
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
    prependEnvImport(path.join(target, "src", "main.ts"), "./env");
  }

  update?.("Driver installeren");
  await addDeps(pm, target, ["pg@latest"]);
  await addDevDeps(pm, target, ["@types/pg@latest"]);

  update?.("Configuratie schrijven");
  writeCompose(target);
  writeEnv(target, dbName, dbPort);
  addScripts(target);
}

/** docker-compose om de database lokaal te draaien. */
function writeCompose(target: string): void {
  // Het bestand heet in de template docker-compose.postgres.yml en hier gewoon
  // docker-compose.yml, zodat "docker compose up -d" zonder -f werkt.
  const temporary = path.join(target, ".compose-tmp");
  copyTemplate("db-docker", temporary, {});
  fs.copyFileSync(
    path.join(temporary, "docker-compose.postgres.yml"),
    path.join(target, "docker-compose.yml"),
  );
  fs.rmSync(temporary, { recursive: true, force: true });
}

/**
 * Schrijft .env (met een echt wachtwoord) en .env.example (zonder).
 *
 * Het wachtwoord voldoet meteen aan de eisen van SQL Server: minstens acht
 * tekens, met hoofdletter, kleine letter, cijfer en leesteken. Anders start dat
 * image en stopt het onmiddellijk weer, zonder bruikbare foutmelding.
 */
function writeEnv(target: string, dbName: string, dbPort: number): void {
  const password = generatePassword();

  const lines = (secret: string): string =>
    [
      "# PostgreSQL",
      "DB_HOST=127.0.0.1",
      `DB_PORT=${dbPort}`,
      "DB_USER=app",
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

/** Een stevig wachtwoord voor de lokale database. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!#%&*+-=?";

  const pick = (from: string, count: number): string[] =>
    Array.from({ length: count }, () => from[crypto.randomInt(from.length)]!);

  const characters = [
    ...pick(upper, 3),
    ...pick(alphabet, 10),
    ...pick(digits, 4),
    ...pick(symbols, 2),
  ];

  // Fisher-Yates met crypto, zodat de posities van de tekenklassen niet vastliggen.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }

  return characters.join("");
}

/** Voegt de db-scripts toe aan package.json. */
function addScripts(target: string): void {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return;

  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as {
    scripts?: Record<string, string>;
  };

  pkg.scripts = {
    ...pkg.scripts,
    "db:migrate": "tsx src/db/migrate.ts up",
    "db:rollback": "tsx src/db/migrate.ts down",
    "db:migrate:status": "tsx src/db/migrate.ts status",
  };

  fs.writeFileSync(file, JSON.stringify(pkg, null, 4) + "\n", "utf8");
}

/**
 * Zet `import './env'` als allereerste regel van het startbestand.
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

  source = `import { DbModule } from './db/db.module';\n` + source;
  source = source.replace(/imports:\s*\[\s*\]/, "imports: [DbModule]");

  fs.writeFileSync(file, source, "utf8");
}

/** Label voor in de meldingen. */
export function databaseLabel(database: Database): string {
  return database === "none" ? "geen" : LABEL;
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
  dbPort: number = DEFAULT_DB_PORT,
  appPort: number = 5000,
): Promise<void> {
  if (database === "none" || backend === "none") return;

  const target = path.join(projectDir, backendDir);
  p.log.step(`${LABEL} koppelen aan ./${backendDir} ...`);

  await withProgress(
    "Databaselaag opzetten",
    async (update) => {
      await scaffoldDatabase(database, target, backend, pm, update, "app", dbPort, appPort);
    },
    35000,
  );

  p.log.success(`${LABEL} gekoppeld aan ./${backendDir}.`);
  p.log.info(
    `Database starten en migreren:\n` +
      `  cd ${backendDir} && docker compose up -d\n` +
      `  ${pm} run db:migrate`,
  );
}
