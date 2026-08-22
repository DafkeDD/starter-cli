/**
 * De databaselaag, volledig zelf geschreven. Geen ORM, geen query builder van
 * een ander: de officiele pg-driver en een dunne laag erboven.
 *
 * PostgreSQL, en alleen PostgreSQL. Dat scheelt een hoop: geen dialect-
 * abstractie, geen if-per-database, en de SQL in je migraties is gewoon de SQL
 * die op je server draait.
 *
 * Wil je er ooit een tweede database bij, dan is de Db-interface hieronder het
 * aangrijpingspunt: je schrijft een tweede implementatie, de rest van je code
 * blijft ongewijzigd.
 */

/** Een rij zoals de database hem teruggeeft. */
export type Row = Record<string, unknown>;

/** Verbindingsgegevens. Komen uit .env, zie src/db/index.ts. */
export interface DbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    /** Versleutelde verbinding. Een gehoste database vereist dit meestal. */
    ssl: boolean;
    /** Maximum aantal gelijktijdige verbindingen in de pool. */
    poolSize: number;
}

/** Resultaat van een schrijfopdracht. */
export interface ExecuteResult {
    /** Aantal geraakte rijen. */
    rowsAffected: number;
}

/**
 * Waar je in je code mee werkt. Zowel de pool als een lopende transactie
 * voldoen hieraan, dus je kan dezelfde functie in of buiten een transactie
 * gebruiken zonder ze aan te passen.
 */
export interface Db {
    /** Alle rijen. */
    query<T = Row>(fragment: SqlFragment): Promise<T[]>;

    /** De eerste rij, of null. Gooit als er meer dan een rij terugkomt. */
    one<T = Row>(fragment: SqlFragment): Promise<T | null>;

    /** De eerste rij. Gooit als er geen is. */
    only<T = Row>(fragment: SqlFragment): Promise<T>;

    /** INSERT, UPDATE, DELETE of DDL. */
    execute(fragment: SqlFragment): Promise<ExecuteResult>;

    /**
     * Voegt een rij toe en geeft hem volledig terug, inclusief de gegenereerde
     * sleutel en alle standaardwaarden. Gebruikt RETURNING.
     */
    insert<T = Row>(table: string, values: Record<string, unknown>): Promise<T>;

    /**
     * Draait `fn` in een transactie. Gooit `fn`, dan volgt een rollback en
     * gooit deze functie door.
     *
     * PostgreSQL doet ook DDL binnen een transactie: een migratie die halverwege
     * mislukt, laat dus niets half achter.
     */
    transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** Onderdeel van een opgebouwde query. Zie src/db/sql.ts. */
export type SqlPart =
    | { kind: "text"; value: string }
    | { kind: "param"; value: unknown }
    | { kind: "ident"; value: string }
    | { kind: "list"; values: unknown[] };

/** Een query in aanbouw. De $1, $2, ... worden pas bij compile() toegekend. */
export interface SqlFragment {
    readonly parts: readonly SqlPart[];
}

/** De kolomtypes die de migraties kennen. */
export type ColumnType =
    | "id"
    | "uuid"
    | "string"
    | "text"
    | "int"
    | "bigint"
    | "decimal"
    | "bool"
    | "timestamp"
    | "json";

export interface ColumnSpec {
    name: string;
    type: ColumnType;
    /** Lengte bij string, precisie bij decimal. */
    length?: number;
    scale?: number;
    nullable: boolean;
    unique: boolean;
    primary: boolean;
    /** Letterlijke standaardwaarde, of het sleutelwoord "now". */
    default?: string | number | boolean | null | "now";
    references?: { table: string; column: string; onDelete?: "cascade" | "set null" };
}
