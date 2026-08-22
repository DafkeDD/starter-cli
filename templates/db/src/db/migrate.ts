// Leest .env in. Moet de eerste import blijven: de migratieloper is een eigen
// startpunt en krijgt de omgeving dus niet van de server mee.
import "../env.js";

import fs from "node:fs";
import path from "node:path";
import { connect } from "./index.js";
import { quote, raw, sql } from "./sql.js";
import { Schema } from "./schema.js";
import type { Db } from "./types.js";

/**
 * De migratieloper. Zelf geschreven, geen CLI van een ander.
 *
 *   npm run db:migrate            alle openstaande migraties uitvoeren
 *   npm run db:migrate:status     tonen wat er open staat
 *   npm run db:rollback           de laatste migratie terugdraaien
 *
 * Elk bestand in src/db/migrations/ exporteert `up` en `down`. De volgorde is
 * de bestandsnaam, dus nummer ze: 001_, 002_, ...
 *
 * Elke migratie draait binnen een transactie. PostgreSQL doet ook DDL binnen een
 * transactie, dus mislukt een migratie halverwege, dan is er niets gebeurd.
 *
 * Dit bestand gebruikt bewust geen import.meta: zo draait het zowel in een ESM-
 * project (Express) als in een CommonJS-project (NestJS).
 */

const TABLE = "_migrations";

/**
 * Waar de migraties staan, gerekend vanaf de map waarin je het commando draait.
 * Na een build wijs je met DB_MIGRATIONS_DIR naar dist/db/migrations.
 */
function migrationsDir(): string {
    return path.resolve(process.cwd(), process.env.DB_MIGRATIONS_DIR ?? "src/db/migrations");
}

interface MigrationModule {
    up(schema: Schema, db: Db): Promise<void> | void;
    down(schema: Schema, db: Db): Promise<void> | void;
}

/**
 * De naam waaronder een migratie in _migrations komt: de bestandsnaam zonder
 * extensie.
 *
 * Dat laatste is essentieel. In ontwikkeling draai je 001_init.ts, na een build
 * 001_init.js. Zou de extensie meegaan, dan ziet productie jouw al uitgevoerde
 * migraties als nieuw en draait hij alles opnieuw.
 */
function migrationName(file: string): string {
    return path.basename(file).replace(/\.(ts|js)$/, "");
}

/** Alle migratiebestanden, op naam gesorteerd. */
function migrationFiles(): string[] {
    const dir = migrationsDir();

    if (!fs.existsSync(dir)) {
        throw new Error(
            `Map met migraties niet gevonden: ${dir}\n` +
                "Draai je dit na een build? Zet dan DB_MIGRATIONS_DIR=dist/db/migrations.",
        );
    }

    // In de bronmap liggen .ts-bestanden, in dist .js.
    const found = fs
        .readdirSync(dir)
        .filter((file) => /\.(ts|js)$/.test(file) && !/\.d\.ts$/.test(file) && !/\.map$/.test(file))
        .sort();

    // Liggen er toevallig een .ts en een .js van dezelfde migratie, dan telt
    // die maar een keer mee.
    const unique = new Map<string, string>();
    for (const file of found) {
        const name = migrationName(file);
        if (!unique.has(name)) unique.set(name, path.join(dir, file));
    }

    return [...unique.values()];
}

/** Maakt de bijhoudtabel aan als die er nog niet is. */
async function ensureTable(db: Db): Promise<void> {
    const applied = await appliedNames(db).catch(() => null);
    if (applied !== null) return;

    await new Schema(db).createTable(TABLE, (t) => {
        t.string("name", 255).primary();
        t.timestamp("applied_at").defaultNow();
    });
}

async function appliedNames(db: Db): Promise<string[]> {
    const rows = await db.query<{ name: string }>(
        raw(`select name from ${quote(TABLE)} order by name`),
    );
    return rows.map((row) => row.name);
}

async function load(file: string): Promise<MigrationModule> {
    const module = (await import(pathToImportUrl(file))) as Partial<MigrationModule>;

    if (typeof module.up !== "function" || typeof module.down !== "function") {
        throw new Error(
            `${path.basename(file)} exporteert geen up en down.\n` +
                "Verwacht:  export async function up(s: Schema) { ... }\n" +
                "           export async function down(s: Schema) { ... }",
        );
    }

    return module as MigrationModule;
}

/** Een absoluut pad zo doorgeven dat import() het op Windows ook slikt. */
function pathToImportUrl(file: string): string {
    if (process.platform !== "win32") return file;
    return "file:///" + file.replace(/\\/g, "/");
}

async function up(): Promise<void> {
    const db = await connect();

    try {
        await ensureTable(db);
        const done = new Set(await appliedNames(db));
        const pending = migrationFiles().filter((file) => !done.has(migrationName(file)));

        if (pending.length === 0) {
            console.log("Niets te doen: alle migraties zijn al uitgevoerd.");
            return;
        }

        for (const file of pending) {
            const name = migrationName(file);
            const migration = await load(file);

            try {
                await db.transaction(async (tx) => {
                    await migration.up(new Schema(tx), tx);
                    await tx.execute(
                        sql`insert into ${raw(quote(TABLE))} (${raw(quote("name"))}) values (${name})`,
                    );
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Migratie ${name} is mislukt en volledig teruggedraaid: ${message}`);
            }

            console.log(`  toegepast  ${name}`);
        }

        console.log(`Klaar: ${pending.length} migratie(s) uitgevoerd.`);
    } finally {
        await db.close();
    }
}

async function down(): Promise<void> {
    const db = await connect();

    try {
        await ensureTable(db);
        const done = await appliedNames(db);
        const last = done[done.length - 1];

        if (!last) {
            console.log("Niets terug te draaien.");
            return;
        }

        const file = migrationFiles().find((candidate) => migrationName(candidate) === last);
        if (!file) {
            throw new Error(
                `Migratie "${last}" staat wel in ${TABLE} maar het bestand is weg.\n` +
                    "Zet het terug, of verwijder de regel handmatig uit de tabel.",
            );
        }

        const migration = await load(file);

        await db.transaction(async (tx) => {
            await migration.down(new Schema(tx), tx);
            await tx.execute(
                sql`delete from ${raw(quote(TABLE))} where ${raw(quote("name"))} = ${last}`,
            );
        });

        console.log(`  teruggedraaid  ${last}`);
    } finally {
        await db.close();
    }
}

async function status(): Promise<void> {
    const db = await connect();

    try {
        await ensureTable(db);
        const done = new Set(await appliedNames(db));
        const files = migrationFiles();

        for (const file of files) {
            const name = migrationName(file);
            console.log(`  ${done.has(name) ? "uitgevoerd " : "open       "} ${name}`);
        }
        if (files.length === 0) console.log("  (nog geen migraties)");
    } finally {
        await db.close();
    }
}

const COMMANDS: Record<string, () => Promise<void>> = { up, down, status };
const command = process.argv[2] ?? "up";
const run = COMMANDS[command];

if (!run) {
    console.error(`Onbekend commando "${command}". Kies uit: up, down, status.`);
    process.exit(1);
} else {
    run().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
