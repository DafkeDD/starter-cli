import type { Schema } from "../schema.js";

/**
 * De eerste migratie. Pas hem aan naar wat jouw app nodig heeft, of laat hem
 * staan als voorbeeld en zet je eigen tabellen in 002_....ts.
 *
 * t.id() wordt een bigserial met primaire sleutel, t.timestamps() zet
 * created_at en updated_at neer als timestamptz met now() als standaard.
 */
export async function up(s: Schema): Promise<void> {
    await s.createTable("users", (t) => {
        t.id();
        t.string("email", 255).unique();
        t.string("password_hash", 255);
        t.string("name", 120).null();
        t.bool("active").default(true);
        t.timestamps();
    });

    await s.createTable("notes", (t) => {
        t.id();
        t.bigint("user_id").references("users", "id", "cascade");
        t.string("title", 200);
        t.text("body").null();
        t.json("tags").null();
        t.timestamps();
        t.index("user_id");
    });
}

export async function down(s: Schema): Promise<void> {
    // Omgekeerde volgorde: notes verwijst naar users.
    await s.dropTable("notes");
    await s.dropTable("users");
}
