import { Pool as PgPool, type PoolClient } from "pg";
import { compile } from "./sql.js";
import type { Db, DbConfig, ExecuteResult, Row, SqlFragment } from "./types.js";

export * from "./types.js";
export { sql, id, raw, list, join, empty, quote } from "./sql.js";

/**
 * Leest de verbindingsgegevens uit de omgeving. Zie .env.example.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
    const database = env.DB_NAME;
    if (!database) {
        throw new Error("DB_NAME ontbreekt in .env. Zie .env.example.");
    }

    return {
        host: env.DB_HOST ?? "127.0.0.1",
        port: Number(env.DB_PORT ?? 5432),
        user: env.DB_USER ?? "",
        password: env.DB_PASSWORD ?? "",
        database,
        ssl: env.DB_SSL === "true",
        poolSize: Number(env.DB_POOL_SIZE ?? 10),
    };
}

/**
 * Opent de verbinding en geeft je de Db terug waar je verder mee werkt.
 *
 *   const db = await connect()
 *   const users = await db.query(sql`select * from users`)
 */
export async function connect(
    config: DbConfig = readConfig(),
): Promise<Db & { close(): Promise<void> }> {
    const pool = new PgPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        max: config.poolSize,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
    });

    // Een verbinding die in de pool staat te wachten kan buiten een query om
    // stukgaan: de database herstart, het netwerk valt weg. pg meldt dat als een
    // 'error'-event op de pool. Luistert niemand, dan ziet Node dat als een
    // onafgevangen fout en stopt het HELE proces - je server ligt dan plat omdat
    // de database even weg was.
    //
    // Met deze luisteraar blijft de app draaien, gooit de pool de kapotte
    // verbinding weg en maakt hij bij het volgende verzoek een nieuwe aan.
    pool.on("error", (error: Error) => {
        console.error("Databaseverbinding verbroken:", error.message);
    });

    // Meteen een verbinding proberen: liever nu een duidelijke fout dan pas bij
    // het eerste verzoek van een gebruiker.
    //
    // Met opnieuw proberen, want een database die net opstart accepteert soms
    // al verbindingen terwijl hij nog initialiseert - en verbreekt ze dan weer
    // ("Connection terminated unexpectedly"). Dat gebeurt vooral bij een verse
    // container: docker compose meldt de container als gestart, niet als klaar.
    await connectWithRetry(pool, config);

    return Object.assign(makeDb(pool, pool), {
        close: () => pool.end(),
    });
}

/** Hoe vaak en hoe lang we wachten tot de database er klaar voor is. */
const RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 1000;

/** Probeert te verbinden, met geduld voor een database die nog opstart. */
async function connectWithRetry(pool: PgPool, config: DbConfig): Promise<void> {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            const probe = await pool.connect();
            probe.release();
            return;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            // Bestaat de server wel maar de database niet, dan heeft opnieuw
            // proberen geen zin - dat lost zichzelf niet op.
            if (/database .* does not exist/i.test(message)) {
                throw new Error(
                    `${message}\n\n` +
                        `Maak hem eenmalig aan:\n` +
                        `  createdb -U ${config.user} ${config.database}\n` +
                        `of in psql:\n` +
                        `  CREATE DATABASE "${config.database}";`,
                );
            }

            if (attempt === RETRY_ATTEMPTS) {
                throw new Error(
                    `Geen verbinding met de database na ${RETRY_ATTEMPTS} pogingen: ${message}\n` +
                        "Draait hij? Bij Docker:  docker compose ps\n" +
                        "En klopt .env (DB_HOST, DB_PORT, DB_USER, DB_NAME)?",
                );
            }

            console.log(
                `Database nog niet bereikbaar (${message}) - poging ${attempt} van ${RETRY_ATTEMPTS}, opnieuw over ${RETRY_DELAY_MS / 1000}s ...`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
}

/** Iets dat een query kan draaien: de pool, of een client in een transactie. */
interface Runner {
    query(text: string, params: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}

/**
 * Bouwt de Db bovenop een runner.
 *
 * `pool` is alleen nodig om een transactie te kunnen starten; binnen een
 * transactie is die undefined, en dan draait een geneste transaction() gewoon
 * mee in de lopende.
 */
function makeDb(runner: Runner, pool?: PgPool): Db {
    const db: Db = {
        async query<T = Row>(fragment: SqlFragment): Promise<T[]> {
            const { text, params } = compile(fragment);
            const result = await runner.query(text, params);
            return result.rows as T[];
        },

        async one<T = Row>(fragment: SqlFragment): Promise<T | null> {
            const rows = await db.query<T>(fragment);

            if (rows.length > 1) {
                throw new Error(
                    `one() verwachtte hoogstens een rij maar kreeg er ${rows.length}.\n` +
                        `Query: ${compile(fragment).text}\n` +
                        "Bedoelde je query()? Of ontbreekt er een limit?",
                );
            }

            return rows[0] ?? null;
        },

        async only<T = Row>(fragment: SqlFragment): Promise<T> {
            const row = await db.one<T>(fragment);
            if (row === null) {
                throw new Error(`only() vond geen rij.\nQuery: ${compile(fragment).text}`);
            }
            return row;
        },

        async execute(fragment: SqlFragment): Promise<ExecuteResult> {
            const { text, params } = compile(fragment);
            const result = await runner.query(text, params);
            return { rowsAffected: result.rowCount ?? 0 };
        },

        async insert<T = Row>(table: string, values: Record<string, unknown>): Promise<T> {
            const columns = Object.keys(values);
            if (columns.length === 0) {
                throw new Error(`insert("${table}") kreeg geen enkele kolom mee.`);
            }

            const params = columns.map((column) => values[column]);
            const quoted = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(", ");
            const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
            const target = `"${table.replace(/"/g, '""')}"`;

            const result = await runner.query(
                `insert into ${target} (${quoted}) values (${placeholders}) returning *`,
                params,
            );

            return result.rows[0] as T;
        },

        async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
            // Zit je al in een transactie, dan draait dit mee in de lopende.
            // Geen savepoints: die maken foutafhandeling onduidelijk en je hebt
            // ze zelden echt nodig.
            if (!pool) return fn(db);

            const client: PoolClient = await pool.connect();
            try {
                await client.query("begin");
                const result = await fn(makeDb(client));
                await client.query("commit");
                return result;
            } catch (error) {
                await client.query("rollback").catch(() => {});
                throw error;
            } finally {
                client.release();
            }
        },
    };

    return db;
}
