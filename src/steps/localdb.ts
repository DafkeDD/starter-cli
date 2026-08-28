import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as p from "@clack/prompts";

/**
 * De rol en de databases aanmaken op een PostgreSQL die je zelf draait.
 *
 * In Docker doet het image dit: POSTGRES_USER/POSTGRES_DB maken de eerste
 * database, en het initscript de tweede. Draai je PostgreSQL zelf, dan gebeurt
 * er niets - en dan kreeg je vroeger een .env met DB_USER=postgres en een
 * verzonnen wachtwoord dat nergens op sloeg. Eerste `npm run db:migrate`:
 * "password authentication failed".
 *
 * Daarom vraagt de CLI hier eenmalig om je superuser, en maakt hij zelf:
 *
 *   CREATE ROLE app01 LOGIN PASSWORD '...';
 *   CREATE DATABASE app01      OWNER app01;
 *   CREATE DATABASE app01_oidc OWNER app01;
 *
 * De rol is bewust GEEN superuser. Je app hoort niet met postgres-rechten in je
 * database te zitten, ook niet in ontwikkeling.
 *
 * Sinds PostgreSQL 15 is het public-schema van een nieuwe database eigendom van
 * pg_database_owner, en dat is de OWNER hierboven. Extra GRANTs zijn dus niet
 * nodig; app01 mag gewoon tabellen maken in zijn eigen database.
 */
export interface LocalDbPlan {
  /** Map met pg in node_modules - de backend of de hub, die staan er al. */
  moduleDir: string;
  host: string;
  port: number;
  /** De rol die we aanmaken. */
  user: string;
  password: string;
  /** De databases die we aanmaken, allemaal met `user` als eigenaar. */
  databases: string[];
}

export async function createLocalDatabases(plan: LocalDbPlan): Promise<boolean> {
  if (plan.databases.length === 0) return false;

  p.log.step("PostgreSQL klaarzetten ...");

  p.log.info(
    `Aan te maken:\n` +
      `  rol        ${plan.user}\n` +
      plan.databases.map((db) => `  database   ${db}  (eigenaar ${plan.user})`).join("\n") +
      `\n\nDaarvoor is eenmalig een account met rechten nodig - meestal postgres.`,
  );

  const doIt = await p.confirm({
    message: "Zal ik dat nu aanmaken?",
    initialValue: true,
  });

  if (p.isCancel(doIt) || !doIt) {
    p.log.info(manualSteps(plan));
    return false;
  }

  const superUser = await p.text({
    message: "Naam van je PostgreSQL-superuser",
    initialValue: "postgres",
    placeholder: "postgres",
  });
  if (p.isCancel(superUser)) {
    p.log.info(manualSteps(plan));
    return false;
  }

  const superPassword = await p.password({
    message: `Wachtwoord van ${String(superUser)}`,
  });
  if (p.isCancel(superPassword)) {
    p.log.info(manualSteps(plan));
    return false;
  }

  try {
    await applyLocalDatabases(plan, String(superUser), String(superPassword));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    p.log.warn(`Aanmaken is niet gelukt: ${message}\n\n${manualSteps(plan)}`);
    return false;
  }

  p.log.success(
    `Rol ${plan.user} en ${plan.databases.length === 1 ? "database" : "databases"} ` +
      `${plan.databases.join(", ")} staan klaar.`,
  );

  return true;
}

/** Doet het werk, zonder vragen. Idempotent: een tweede run mag niet stukgaan. */
export async function applyLocalDatabases(plan: LocalDbPlan, superUser: string, superPassword: string): Promise<void> {
  const { Client } = await loadPg(plan.moduleDir);

  const client = new Client({
    host: plan.host,
    port: plan.port,
    user: superUser,
    password: superPassword,
    database: "postgres",
  });

  await client.connect();

  try {
    // Rol. Bestaat hij al, dan zetten we het wachtwoord gelijk aan wat er in
    // .env staat - anders klopt het een van beide niet.
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [plan.user]);

    // Namen en wachtwoord kunnen niet als parameter: PostgreSQL staat geen
    // placeholders toe in CREATE ROLE / CREATE DATABASE. Daarom quoten we zelf,
    // met dezelfde regels als de server: "" voor een naam, '' voor een string.
    const roleName = quoteIdentifier(plan.user);
    const secret = quoteLiteral(plan.password);

    if (role.rowCount === 0) {
      await client.query(`CREATE ROLE ${roleName} LOGIN PASSWORD ${secret}`);
    } else {
      await client.query(`ALTER ROLE ${roleName} WITH LOGIN PASSWORD ${secret}`);
    }

    for (const database of plan.databases) {
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (exists.rowCount === 0) {
        // CREATE DATABASE kan niet in een transactie; los uitvoeren dus.
        await client.query(`CREATE DATABASE ${quoteIdentifier(database)} OWNER ${roleName}`);
      }
    }
  } finally {
    await client.end();
  }
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

/** 'waarde' - een enkele quote erin wordt verdubbeld. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Wat je zelf moet doen als de CLI het niet mag of niet kan. */
function manualSteps(plan: LocalDbPlan): string {
  return (
    "Draai dit dan zelf even in psql (als postgres):\n" +
    `  CREATE ROLE ${quoteIdentifier(plan.user)} LOGIN PASSWORD ${quoteLiteral(plan.password)};\n` +
    plan.databases
      .map((db) => `  CREATE DATABASE ${quoteIdentifier(db)} OWNER ${quoteIdentifier(plan.user)};`)
      .join("\n") +
    "\n\nHet wachtwoord staat ook in .env, bij DB_PASSWORD."
  );
}
