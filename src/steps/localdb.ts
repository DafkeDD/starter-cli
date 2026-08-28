import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as p from "@clack/prompts";

/**
 * De database aanmaken op een PostgreSQL die je zelf draait.
 *
 * Meer niet. Geen rol, geen gebruiker, geen server - je PostgreSQL staat er al
 * en je account bestaat al. Het enige dat ontbreekt is de database zelf, en die
 * maken we hier bij:
 *
 *   CREATE DATABASE "app01";
 *
 * We loggen daarvoor in met precies het account dat straks ook in .env staat.
 * Heeft dat account het recht CREATEDB niet, dan zeggen we dat - dan maak je
 * hem zelf aan of gebruik je een account dat het wel mag.
 *
 * In Docker gaat het anders: daar bestaat er nog niets, dus maakt het
 * postgres-image bij de eerste start zowel het account als de database aan uit
 * POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB.
 */
export interface LocalDbPlan {
  /** Map met pg in node_modules - de backend of de hub, die staan er al. */
  moduleDir: string;
  host: string;
  port: number;
  /** Het bestaande account waarmee we inloggen; hetzelfde als in .env. */
  user: string;
  password: string;
  /** De databases die nog moeten bestaan. */
  databases: string[];
}

export async function createLocalDatabases(plan: LocalDbPlan): Promise<boolean> {
  if (plan.databases.length === 0) return false;

  p.log.step("Database aanmaken ...");

  let bestaand: string[];
  try {
    bestaand = await existingDatabases(plan);
  } catch (err) {
    p.log.warn(`${connectionProblem(plan, err)}\n\n${manualSteps(plan)}`);
    return false;
  }

  // Bestaat er al iets van een vorige ronde? Een lege projectmap betekent geen
  // lege database - die staat op je server, niet in je map. Zonder deze vraag
  // scaffold je een fris project bovenop de tabellen van de vorige keer, en
  // meldt db:migrate doodleuk "niets te doen".
  let wissen = false;
  if (bestaand.length > 0) {
    const keuze = await p.select({
      message: `${bestaand.join(" en ")} ${bestaand.length === 1 ? "bestaat" : "bestaan"} al. Wat doen we ermee?`,
      initialValue: "houden" as "houden" | "wissen",
      options: [
        {
          value: "houden" as const,
          label: "Laten staan",
          hint: "je data blijft; alleen nieuwe migraties draaien",
        },
        {
          value: "wissen" as const,
          label: "Opnieuw beginnen",
          hint: "DROP DATABASE - alle tabellen en data weg",
        },
      ],
    });

    if (p.isCancel(keuze)) {
      p.cancel("Geannuleerd.");
      process.exit(0);
    }

    wissen = keuze === "wissen";
  }

  try {
    await applyLocalDatabases(plan, wissen);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    p.log.warn(`Aanmaken is niet gelukt: ${message}\n\n${manualSteps(plan)}`);
    return false;
  }

  p.log.success(
    `${plan.databases.length === 1 ? "Database" : "Databases"} ${plan.databases.join(", ")} ` +
      `${plan.databases.length === 1 ? "staat" : "staan"} klaar.`,
  );

  return true;
}

/** Doet het werk, zonder vragen. Idempotent: een tweede run mag niet stukgaan. */
export async function applyLocalDatabases(plan: LocalDbPlan, wissen = false): Promise<void> {
  const client = await connect(plan);

  try {
    for (const database of plan.databases) {
      if (wissen) {
        // WITH (FORCE) gooit openstaande verbindingen eruit. Zonder dat faalt
        // dit als pgAdmin of een oude dev-server er nog aan hangt.
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
      }

      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (exists.rowCount === 0) {
        // CREATE DATABASE kan niet in een transactie; los uitvoeren dus.
        await client.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
      }
    }
  } finally {
    await client.end();
  }
}

/** Welke van deze databases staan er al? */
async function existingDatabases(plan: LocalDbPlan): Promise<string[]> {
  const client = await connect(plan);

  try {
    const found: string[] = [];
    for (const database of plan.databases) {
      const row = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (row.rowCount !== 0) found.push(database);
    }
    return found;
  } finally {
    await client.end();
  }
}

/**
 * Verbinden met de database "postgres".
 *
 * Die bestaat op elke server en dient hier alleen als aanmeldpunt: je kan geen
 * database aanmaken zonder eerst ergens ingelogd te zijn.
 */
async function connect(plan: LocalDbPlan): Promise<PgClient> {
  const { Client } = await loadPg(plan.moduleDir);

  const client = new Client({
    host: plan.host,
    port: plan.port,
    user: plan.user,
    password: plan.password,
    database: "postgres",
  });

  await client.connect();
  return client;
}

/** Uitleg bij de meest voorkomende manieren waarop dit misgaat. */
function connectionProblem(plan: LocalDbPlan, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/password authentication failed/i.test(message)) {
    return `Inloggen als ${plan.user} lukt niet: wachtwoord klopt niet.`;
  }
  if (/ECONNREFUSED|connect/i.test(message)) {
    return `Geen PostgreSQL op ${plan.host}:${plan.port}. Draait hij, en is dat de juiste poort?`;
  }
  if (/permission denied|must be|CREATEDB/i.test(message)) {
    return `${plan.user} mag geen database aanmaken (recht CREATEDB ontbreekt).`;
  }

  return `Verbinden is niet gelukt: ${message}`;
}

/**
 * De pg-driver lenen uit het project dat we net gescaffold hebben.
 *
 * De CLI zelf heeft pg niet als dependency - hij draait via `npx github:...` en
 * hoeft geen databasedriver mee te slepen voor mensen die "geen database"
 * kiezen. In het gegenereerde project staat pg er wel, want dat is net
 * geinstalleerd.
 */
async function loadPg(moduleDir: string): Promise<{ Client: new (config: object) => PgClient }> {
  const require = createRequire(path.join(moduleDir, "noop.js"));
  const entry = require.resolve("pg");
  const module = (await import(pathToFileURL(entry).href)) as {
    default?: { Client: new (config: object) => PgClient };
    Client?: new (config: object) => PgClient;
  };

  const Client = module.Client ?? module.default?.Client;
  if (!Client) throw new Error("pg is niet gevonden in het project.");

  return { Client };
}

/** Het stukje pg dat we gebruiken; genoeg om zonder @types/pg te typen. */
interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
  end(): Promise<void>;
}

/** "naam" - een dubbele quote erin wordt verdubbeld. */
function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Wat je zelf moet doen als het niet lukt. */
function manualSteps(plan: LocalDbPlan): string {
  return (
    "Maak de database dan zelf even aan:\n" +
    plan.databases.map((db) => `  createdb -U ${plan.user} ${db}`).join("\n") +
    "\nof in psql:\n" +
    plan.databases.map((db) => `  CREATE DATABASE ${quoteIdentifier(db)};`).join("\n")
  );
}
