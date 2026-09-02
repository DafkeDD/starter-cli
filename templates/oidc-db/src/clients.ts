import type { ClientMetadata } from 'oidc-provider'
import { sql, id, join } from './db/sql.js'
import type { Db } from './db/types.js'

/**
 * De aangesloten apps, nu uit de database.
 *
 * De lijst hieronder is bewust leeg: geeft je oidc-provider geen statische
 * clients mee, dan zoekt hij een onbekende client_id op via de adapter — en die
 * kijkt in deze tabel. Zo kan je een app aansluiten zonder de hub te herstarten.
 *
 * `allow_registration` staat per app. Alleen waar hij aanstaat bestaat het
 * registratiescherm; bij de rest is de knop niet verborgen maar de route
 * gesloten.
 */
export interface Branding {
    name: string
    accent: string
    tagline: string
}

export interface ClientRow {
    client_id: string
    name: string
    redirect_uris: string[]
    allow_registration: boolean
}

interface Row {
    client_id: string
    name: string
    client_secret: string | null
    redirect_uris: string
    post_logout_redirect_uris: string | null
    accent: string | null
    tagline: string | null
    allow_registration: boolean
    enabled: boolean
}

export const CLIENTS: ClientMetadata[] = []

let db: Db | null = null

export function useDatabase(connection: Db): void {
    db = connection
}

function database(): Db {
    if (!db) throw new Error('De clientopslag heeft nog geen database.')
    return db
}

/** JSON-tekst uit de kolom naar een lijst, met een lege lijst als vangnet. */
function toList(value: string | null): string[] {
    if (!value) return []
    try {
        const parsed = JSON.parse(value) as unknown
        return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
        return []
    }
}

/** Een rij als metadata voor oidc-provider. */
export function toClientMetadata(row: Row): ClientMetadata {
    return {
        client_id: row.client_id,
        ...(row.client_secret ? { client_secret: row.client_secret } : {}),
        grant_types: ['authorization_code'],
        response_types: ['code'],
        redirect_uris: toList(row.redirect_uris),
        post_logout_redirect_uris: toList(row.post_logout_redirect_uris)
    }
}

/** Voor de adapter: één client opzoeken. Uitgeschakelde apps bestaan niet. */
export async function findClient(clientId: string): Promise<ClientMetadata | undefined> {
    const row = await database().one<Row>(
        sql`select * from ${id('clients')} where ${id('client_id')} = ${clientId} and ${id('enabled')} = ${true}`
    )
    return row ? toClientMetadata(row) : undefined
}

/**
 * Zet de app van de hub zelf in de tabel.
 *
 * Draait bij elke start. Op een verse database staat je eigen app er anders
 * niet in en kan je nergens inloggen — ook niet op de hub.
 */
export async function ensureOwnClient(): Promise<void> {
    await upsertClient({
        clientId: '{{CLIENT_ID}}',
        name: '{{PROJECT_NAME}}',
        clientSecret: '{{CLIENT_SECRET}}',
        redirectUris: ['{{OWN_REDIRECT_URI}}'],
        postLogoutRedirectUris: ['{{OWN_POST_LOGOUT_URI}}'],
        accent: '{{ACCENT}}',
        tagline: '{{TAGLINE}}',
        // De hub is de plek waar je een account aanmaakt.
        allowRegistration: true
    })
}

export interface UpsertClient {
    clientId: string
    name: string
    clientSecret?: string
    redirectUris: string[]
    postLogoutRedirectUris?: string[]
    accent?: string
    tagline?: string
    allowRegistration?: boolean
}

/** Voegt een app toe of werkt hem bij. */
export async function upsertClient(client: UpsertClient): Promise<void> {
    const bestaat = await database().one<{ client_id: string }>(
        sql`select ${id('client_id')} from ${id('clients')} where ${id('client_id')} = ${client.clientId}`
    )

    const velden = {
        name: client.name,
        client_secret: client.clientSecret ?? null,
        redirect_uris: JSON.stringify(client.redirectUris),
        post_logout_redirect_uris: JSON.stringify(client.postLogoutRedirectUris ?? []),
        accent: client.accent ?? '#0f9d58',
        tagline: client.tagline ?? '',
        allow_registration: client.allowRegistration ?? false,
        enabled: true
    }

    if (bestaat) {
        // De Db-laag heeft geen update(); die bouwen we hier met join().
        const sets = join(Object.entries(velden).map(([kolom, waarde]) => sql`${id(kolom)} = ${waarde}`))
        await database().execute(
            sql`update ${id('clients')} set ${sets}, ${id('updated_at')} = ${new Date()}
                where ${id('client_id')} = ${client.clientId}`
        )
        return
    }

    await database().insert('clients', { client_id: client.clientId, ...velden })
}

/** Een app aanmelden bij de hub. Bestaat hij al, dan wordt hij bijgewerkt. */
export async function registerClient(client: UpsertClient): Promise<void> {
    await upsertClient(client)
}

export async function brandingFor(clientId: string): Promise<Branding | undefined> {
    const row = await database().one<Row>(
        sql`select * from ${id('clients')} where ${id('client_id')} = ${clientId}`
    )
    if (!row) return undefined

    return {
        name: row.name,
        accent: row.accent ?? '#0f9d58',
        tagline: row.tagline ?? ''
    }
}

export async function allowsRegistration(clientId: string): Promise<boolean> {
    const row = await database().one<{ allow_registration: boolean }>(
        sql`select ${id('allow_registration')} from ${id('clients')} where ${id('client_id')} = ${clientId}`
    )
    return Boolean(row?.allow_registration)
}

export async function allClients(): Promise<ClientRow[]> {
    const rows = await database().query<Row>(
        sql`select * from ${id('clients')} order by ${id('name')}`
    )

    return rows.map(row => ({
        client_id: row.client_id,
        name: row.name,
        redirect_uris: toList(row.redirect_uris),
        allow_registration: Boolean(row.allow_registration)
    }))
}
