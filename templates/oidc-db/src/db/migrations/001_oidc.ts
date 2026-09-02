import type { Schema } from '../schema.js'

/**
 * De tabellen van de OIDC-hub.
 *
 *  - oidc_payloads : alles wat oidc-provider bewaart (sessies, grants, tokens,
 *                    interacties, ...). Een tabel voor alle soorten, met "type"
 *                    als onderscheid. Dat is de gebruikelijke opzet.
 *  - users         : de gebruikers. Registreren gebeurt alleen hier, op de hub.
 *  - clients       : de aangesloten applicaties, met hun branding en of ze
 *                    zelf accounts mogen aanmaken.
 */
export async function up(s: Schema): Promise<void> {
    await s.createTable('oidc_payloads', t => {
        // Samengestelde sleutel: dezelfde id kan bij twee soorten voorkomen.
        t.string('type', 100).primary()
        t.string('id', 255).primary()

        // De payload als JSON-tekst. Bewust text en geen jsonb: we lezen en
        // schrijven hem altijd in zijn geheel, en zoeken er nooit in. jsonb zou
        // alleen parse-werk toevoegen bij elke opslag.
        t.text('payload')

        t.string('grant_id', 255).null()
        t.string('user_code', 255).null()
        t.string('uid', 255).null()

        t.timestamp('expires_at').null()
        t.timestamp('consumed_at').null()

        // revokeByGrantId ruimt in een keer alles van een grant op.
        t.index('grant_id')
        t.index('uid')
        t.index('user_code')
        // Voor het opruimen van verlopen rijen.
        t.index('expires_at')
    })

    await s.createTable('users', t => {
        t.id()
        t.string('email', 255).unique()
        t.string('name', 120)
        t.string('password_hash', 255)
        // 'admin' of 'user'.
        t.string('role', 20).default('user')
        t.bool('blocked').default(false)
        t.timestamps()
    })

    await s.createTable('clients', t => {
        t.string('client_id', 255).primary()
        t.string('name', 120)
        t.string('client_secret', 255).null()
        // JSON-lijsten, als tekst. Zie de opmerking bij payload hierboven.
        t.text('redirect_uris')
        t.text('post_logout_redirect_uris').null()
        // Hoe het inlogscherm eruitziet voor deze app.
        t.string('accent', 20).null()
        t.string('tagline', 160).null()
        // Mag je vanuit deze app een account aanmaken? Alleen de hub-app staat
        // hierop standaard aan; de rest stuurt je hooguit door.
        t.bool('allow_registration').default(false)
        t.bool('enabled').default(true)
        t.timestamps()
    })
}

export async function down(s: Schema): Promise<void> {
    await s.dropTable('clients')
    await s.dropTable('users')
    await s.dropTable('oidc_payloads')
}
