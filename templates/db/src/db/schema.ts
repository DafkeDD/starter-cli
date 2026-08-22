import { quote, raw } from "./sql.js";
import type { ColumnSpec, ColumnType, Db } from "./types.js";

/**
 * De schema-laag voor migraties.
 *
 * Je beschrijft de tabel in TypeScript en deze laag maakt er de CREATE TABLE
 * van. Puur gemak: de gegenereerde SQL is gewone PostgreSQL en staat een
 * console.log verderop in dit bestand van je af.
 *
 *   export const up = (s: Schema) =>
 *       s.createTable("users", (t) => {
 *           t.id()
 *           t.string("email", 255).unique()
 *           t.string("password_hash", 255)
 *           t.bool("active").default(true)
 *           t.timestamps()
 *       })
 *
 * Wat je hier niet in kwijt kan - views, triggers, een index met een WHERE -
 * schrijf je met s.raw() als gewone SQL.
 */

/** Een kolom in aanbouw. Alle methodes geven de kolom terug, dus je kan ketenen. */
export class Column {
    constructor(readonly spec: ColumnSpec) {}

    /** Mag leeg zijn. Standaard is een kolom NOT NULL. */
    null(): this {
        this.spec.nullable = true;
        return this;
    }

    notNull(): this {
        this.spec.nullable = false;
        return this;
    }

    unique(): this {
        this.spec.unique = true;
        return this;
    }

    primary(): this {
        this.spec.primary = true;
        return this;
    }

    default(value: string | number | boolean | null): this {
        this.spec.default = value;
        return this;
    }

    /** Standaardwaarde "nu", in UTC. */
    defaultNow(): this {
        this.spec.default = "now";
        return this;
    }

    /** Verwijst naar een andere tabel. */
    references(table: string, column = "id", onDelete?: "cascade" | "set null"): this {
        this.spec.references = { table, column, onDelete };
        return this;
    }
}

interface IndexSpec {
    columns: string[];
    unique: boolean;
}

/** Verzamelt de kolommen en indexen van een tabel. */
export class TableBuilder {
    readonly columns: Column[] = [];
    readonly indexes: IndexSpec[] = [];

    private add(name: string, type: ColumnType, length?: number, scale?: number): Column {
        const column = new Column({
            name,
            type,
            length,
            scale,
            nullable: false,
            unique: false,
            primary: false,
        });
        this.columns.push(column);
        return column;
    }

    /** Automatisch oplopende primaire sleutel. */
    id(name = "id"): Column {
        return this.add(name, "id").primary();
    }

    uuid(name: string): Column {
        return this.add(name, "uuid");
    }

    string(name: string, length = 255): Column {
        return this.add(name, "string", length);
    }

    /** Onbegrensde tekst. */
    text(name: string): Column {
        return this.add(name, "text");
    }

    int(name: string): Column {
        return this.add(name, "int");
    }

    bigint(name: string): Column {
        return this.add(name, "bigint");
    }

    decimal(name: string, precision = 12, scale = 2): Column {
        return this.add(name, "decimal", precision, scale);
    }

    bool(name: string): Column {
        return this.add(name, "bool");
    }

    timestamp(name: string): Column {
        return this.add(name, "timestamp");
    }

    json(name: string): Column {
        return this.add(name, "json");
    }

    /** created_at en updated_at, beide standaard op nu. */
    timestamps(): void {
        this.timestamp("created_at").defaultNow();
        this.timestamp("updated_at").defaultNow();
    }

    index(...columns: string[]): void {
        this.indexes.push({ columns, unique: false });
    }

    uniqueIndex(...columns: string[]): void {
        this.indexes.push({ columns, unique: true });
    }
}

/** Wat een migratie meekrijgt om het schema te wijzigen. */
export class Schema {
    constructor(private readonly db: Db) {}

    async createTable(table: string, build: (t: TableBuilder) => void): Promise<void> {
        const builder = new TableBuilder();
        build(builder);

        const q = quote;
        const lines: string[] = builder.columns.map((column) => columnSql(column.spec));

        const primary = builder.columns.filter((column) => column.spec.primary);
        if (primary.length > 0) {
            const names = primary.map((column) => q(column.spec.name)).join(", ");
            lines.push(`primary key (${names})`);
        }

        for (const column of builder.columns) {
            if (!column.spec.unique) continue;
            lines.push(
                `constraint ${q(`uq_${table}_${column.spec.name}`)} unique (${q(column.spec.name)})`,
            );
        }

        for (const column of builder.columns) {
            const fk = column.spec.references;
            if (!fk) continue;

            const action = fk.onDelete === "cascade" ? " on delete cascade" : fk.onDelete === "set null" ? " on delete set null" : "";
            lines.push(
                `constraint ${q(`fk_${table}_${column.spec.name}`)} foreign key (${q(column.spec.name)}) ` +
                    `references ${q(fk.table)} (${q(fk.column)})${action}`,
            );
        }

        await this.db.execute(
            raw(`create table ${q(table)} (\n    ${lines.join(",\n    ")}\n)`),
        );

        for (const index of builder.indexes) {
            await this.createIndex(table, index.columns, index.unique);
        }
    }

    async dropTable(table: string): Promise<void> {
        await this.db.execute(raw(`drop table if exists ${quote(table)}`));
    }

    async addColumn(table: string, build: (t: TableBuilder) => void): Promise<void> {
        const builder = new TableBuilder();
        build(builder);

        for (const column of builder.columns) {
            await this.db.execute(
                raw(`alter table ${quote(table)} add column ${columnSql(column.spec)}`),
            );
        }
    }

    async dropColumn(table: string, column: string): Promise<void> {
        await this.db.execute(
            raw(`alter table ${quote(table)} drop column ${quote(column)}`),
        );
    }

    async createIndex(table: string, columns: string[], unique = false): Promise<void> {
        // De naam moet uniek zijn binnen het hele schema, niet alleen binnen de
        // tabel. Vandaar de tabelnaam erin.
        const name = `${unique ? "uq" : "idx"}_${table}_${columns.join("_")}`;
        const list = columns.map(quote).join(", ");

        await this.db.execute(
            raw(
                `create ${unique ? "unique " : ""}index ${quote(name)} ` +
                    `on ${quote(table)} (${list})`,
            ),
        );
    }

    async dropIndex(table: string, columns: string[], unique = false): Promise<void> {
        const name = `${unique ? "uq" : "idx"}_${table}_${columns.join("_")}`;
        await this.db.execute(raw(`drop index if exists ${quote(name)}`));
    }

    /**
     * Ontsnappingsluik voor SQL die niet in de bouwer past.
     *
     *   await s.raw(`create index idx_actief on users (email) where deleted_at is null`)
     */
    async raw(statement: string): Promise<void> {
        await this.db.execute(raw(statement));
    }
}

/** Het PostgreSQL-type van een kolom. */
function columnType(spec: ColumnSpec): string {
    switch (spec.type) {
        case "id":
            // bigserial impliceert al not null.
            return "bigserial";
        case "uuid":
            return "uuid";
        case "string":
            return `varchar(${spec.length ?? 255})`;
        case "text":
            return "text";
        case "int":
            return "integer";
        case "bigint":
            return "bigint";
        case "decimal":
            return `numeric(${spec.length ?? 12}, ${spec.scale ?? 2})`;
        case "bool":
            return "boolean";
        case "timestamp":
            // Met tijdzone: anders verlies je bij een serverwissel het moment.
            return "timestamptz";
        case "json":
            // jsonb is doorzoekbaar en indexeerbaar, json is dat niet.
            return "jsonb";
    }
}

/** Een enkele kolomregel binnen CREATE TABLE of ALTER TABLE. */
function columnSql(spec: ColumnSpec): string {
    const parts = [quote(spec.name), columnType(spec)];

    // bigserial is al not null; nog eens toevoegen mag maar voegt niets toe.
    if (spec.type !== "id") {
        parts.push(spec.nullable ? "null" : "not null");
    }

    if (spec.default !== undefined) {
        parts.push(`default ${defaultSql(spec.default)}`);
    }

    return parts.join(" ");
}

function defaultSql(value: ColumnSpec["default"]): string {
    if (value === "now") return "now()";
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    return `'${value.replace(/'/g, "''")}'`;
}

/** De vorm die elk migratiebestand moet exporteren. */
export interface Migration {
    up(schema: Schema, db: Db): Promise<void> | void;
    down(schema: Schema, db: Db): Promise<void> | void;
}
