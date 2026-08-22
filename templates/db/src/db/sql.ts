import type { SqlFragment, SqlPart } from "./types.js";

/**
 * De sql-tag: bouwt een query op met veilige parameters.
 *
 *   const rows = await db.query(sql`select * from users where email = ${email}`)
 *
 * Alles wat je met ${...} invoegt wordt een parameter, nooit tekst in de query.
 * Daarmee is SQL-injectie uitgesloten - ook als de waarde rechtstreeks van een
 * gebruiker komt.
 *
 * Fragmenten mag je in elkaar schuiven:
 *
 *   const filter = actief ? sql`and active = ${true}` : empty
 *   sql`select * from users where email = ${email} ${filter}`
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
    const parts: SqlPart[] = [];

    strings.forEach((text, index) => {
        if (text) parts.push({ kind: "text", value: text });
        if (index >= values.length) return;

        const value = values[index];
        if (isFragment(value)) parts.push(...value.parts);
        else parts.push({ kind: "param", value });
    });

    return { parts };
}

/** Een leeg fragment. Handig als "niets" in een voorwaardelijke query. */
export const empty: SqlFragment = { parts: [] };

/**
 * Een tabel- of kolomnaam. Wordt netjes gequote, dus gebruik dit in plaats van
 * de naam zelf in de query te typen.
 *
 *   sql`select * from ${id("users")} order by ${id("created_at")} desc`
 */
export function id(name: string): SqlFragment {
    return { parts: [{ kind: "ident", value: name }] };
}

/**
 * Letterlijke SQL, zonder parameter en zonder quoting.
 *
 * Alleen gebruiken voor tekst die JIJ schrijft, nooit voor iets dat van buiten
 * komt - dit is precies het gat waar SQL-injectie door binnenkomt.
 */
export function raw(text: string): SqlFragment {
    return { parts: [{ kind: "text", value: text }] };
}

/**
 * Een lijst waarden voor IN (...). Elk element wordt een eigen parameter.
 *
 *   sql`select * from users where id in ${list([1, 2, 3])}`
 */
export function list(values: unknown[]): SqlFragment {
    return { parts: [{ kind: "list", values }] };
}

/**
 * Plakt fragmenten aan elkaar met een scheidingsteken.
 *
 *   join([sql`a = ${1}`, sql`b = ${2}`], " and ")
 */
export function join(fragments: SqlFragment[], separator = ", "): SqlFragment {
    const parts: SqlPart[] = [];

    fragments.forEach((fragment, index) => {
        if (index > 0) parts.push({ kind: "text", value: separator });
        parts.push(...fragment.parts);
    });

    return { parts };
}

/**
 * Een tabel- of kolomnaam veilig tussen aanhalingstekens zetten.
 * Een " in de naam wordt verdubbeld; verder laat PostgreSQL alles toe.
 */
export function quote(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Zet een fragment om in echte SQL. Hier - en alleen hier - krijgen de
 * parameters hun nummer: $1, $2, ...
 */
export function compile(fragment: SqlFragment): { text: string; params: unknown[] } {
    let text = "";
    const params: unknown[] = [];

    for (const part of fragment.parts) {
        switch (part.kind) {
            case "text":
                text += part.value;
                break;

            case "ident":
                text += quote(part.value);
                break;

            case "param":
                params.push(part.value);
                text += `$${params.length}`;
                break;

            case "list": {
                if (part.values.length === 0) {
                    // "in ()" is ongeldig; dit is altijd onwaar en dus correct.
                    text += "(null)";
                    break;
                }
                const placeholders = part.values.map((value) => {
                    params.push(value);
                    return `$${params.length}`;
                });
                text += "(" + placeholders.join(", ") + ")";
                break;
            }
        }
    }

    return { text, params };
}

function isFragment(value: unknown): value is SqlFragment {
    return (
        typeof value === "object" &&
        value !== null &&
        Array.isArray((value as SqlFragment).parts)
    );
}
