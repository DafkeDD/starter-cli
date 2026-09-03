import type { Adapter, AdapterPayload } from 'oidc-provider'
import { connect } from './db/index.js'
import { sql, id } from './db/sql.js'
import { useDatabase as useDatabaseForUsers } from './users.js'
import { useDatabase as useDatabaseForKeys } from './keys.js'
import {
    ensureOwnClient,
    findClient,
    useDatabase as useDatabaseForClients
} from './clients.js'
import type { Db } from './db/types.js'

/**
 * De opslag van oidc-provider, nu in de database.
 *
 * Hiermee verdwijnt de waarschuwing "a quick start development-only in-memory
 * adapter is used" bij het opstarten: sessies en tokens overleven nu een
 * herstart, en meerdere exemplaren van de hub delen dezelfde staat - wat nodig
 * is zodra je er twee achter een loadbalancer zet.
 *
 * Alles staat in een tabel oidc_payloads, met "type" als onderscheid tussen
 * Session, Grant, AccessToken, Interaction, enzovoort. Dat is de gebruikelijke
 * opzet en houdt het aantal tabellen beheersbaar.
 */

/** Wordt gezet door initStorage(), voor de Provider bestaat. */
let db: Db | null = null

function database(): Db {
    if (!db) {
        throw new Error(
            'De OIDC-adapter heeft nog geen database. initStorage() moet gedraaid ' +
                'hebben voordat je de Provider aanmaakt.'
        )
    }
    return db
}

interface PayloadRow {
    payload: string
    expires_at: Date | string | null
    consumed_at: Date | string | null
}

/** Zet een rij om naar wat oidc-provider verwacht, of undefined als verlopen. */
function toPayload(row: PayloadRow | null): AdapterPayload | undefined {
    if (!row) return undefined

    // De vervaldatum wordt hier gecontroleerd en niet in SQL, zodat de query
    // eenvoudig blijft en de vergelijking eenduidig in JavaScript gebeurt.
    if (row.expires_at !== null) {
        const expires = new Date(row.expires_at)
        if (expires.getTime() <= Date.now()) return undefined
    }

    const payload = JSON.parse(row.payload) as AdapterPayload

    if (row.consumed_at !== null) {
        // oidc-provider verwacht een tijdstip in seconden, geen datum.
        payload.consumed = Math.floor(new Date(row.consumed_at).getTime() / 1000)
    }

    return payload
}

export class StorageAdapter implements Adapter {
    constructor(private readonly type: string) {}

    /**
     * Opslaan of overschrijven. Verwijderen-en-invoegen binnen een transactie:
     * even betrouwbaar als ON CONFLICT en makkelijker te lezen.
     */
    async upsert(key: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null

        await database().transaction(async tx => {
            await tx.execute(
                sql`delete from ${id('oidc_payloads')} where ${id('type')} = ${this.type} and ${id('id')} = ${key}`
            )

            await tx.execute(
                sql`insert into ${id('oidc_payloads')}
                        (${id('type')}, ${id('id')}, ${id('payload')}, ${id('grant_id')}, ${id('user_code')}, ${id('uid')}, ${id('expires_at')}, ${id('consumed_at')})
                    values
                        (${this.type}, ${key}, ${JSON.stringify(payload)}, ${payload.grantId ?? null}, ${payload.userCode ?? null}, ${payload.uid ?? null}, ${expiresAt}, ${null})`
            )
        })
    }

    async find(key: string): Promise<AdapterPayload | undefined> {
        // Clients staan in hun eigen tabel, niet tussen de payloads. Zo kan je
        // een app aansluiten met een gewone INSERT, en ziet het beheerscherm
        // dezelfde rijen als oidc-provider.
        if (this.type === 'Client') {
            return (await findClient(key)) as AdapterPayload | undefined
        }

        const row = await database().one<PayloadRow>(
            sql`select ${id('payload')}, ${id('expires_at')}, ${id('consumed_at')}
                from ${id('oidc_payloads')}
                where ${id('type')} = ${this.type} and ${id('id')} = ${key}`
        )
        return toPayload(row)
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        const row = await database().one<PayloadRow>(
            sql`select ${id('payload')}, ${id('expires_at')}, ${id('consumed_at')}
                from ${id('oidc_payloads')}
                where ${id('type')} = ${this.type} and ${id('user_code')} = ${userCode}`
        )
        return toPayload(row)
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        const row = await database().one<PayloadRow>(
            sql`select ${id('payload')}, ${id('expires_at')}, ${id('consumed_at')}
                from ${id('oidc_payloads')}
                where ${id('type')} = ${this.type} and ${id('uid')} = ${uid}`
        )
        return toPayload(row)
    }

    /** Markeert een eenmalige code als gebruikt, zonder hem te verwijderen. */
    async consume(key: string): Promise<void> {
        await database().execute(
            sql`update ${id('oidc_payloads')} set ${id('consumed_at')} = ${new Date()}
                where ${id('type')} = ${this.type} and ${id('id')} = ${key}`
        )
    }

    async destroy(key: string): Promise<void> {
        await database().execute(
            sql`delete from ${id('oidc_payloads')} where ${id('type')} = ${this.type} and ${id('id')} = ${key}`
        )
    }

    /** Logt de gebruiker overal uit: alles van deze grant verdwijnt. */
    async revokeByGrantId(grantId: string): Promise<void> {
        await database().execute(
            sql`delete from ${id('oidc_payloads')} where ${id('grant_id')} = ${grantId}`
        )
    }
}

/**
 * Zet de databaseverbinding op en ruimt meteen op.
 *
 * index.ts roept dit aan voor de Provider bestaat en weet verder niet waar de
 * gegevens staan - de bestandsvariant van dit bestand exporteert dezelfde twee
 * namen en doet hier niets.
 */
export async function initStorage(): Promise<void> {
    db = await connect()
    useDatabaseForUsers(db)
    useDatabaseForClients(db)
    useDatabaseForKeys(db)

    // De app van de hub zelf moet altijd bestaan; zonder die rij kan je nergens
    // inloggen, ook niet op de hub. Mislukt het (verse database, tabellen nog
    // niet aangemaakt), dan is dat geen reden om niet te starten - anders kan je
    // de migratie niet eens draaien.
    try {
        await ensureOwnClient()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
            `Kon de eigen client niet klaarzetten: ${message}\n` +
                'Bestaan de tabellen al? Draai:  npm run db:migrate'
        )
    }

    // Opruimen mag het opstarten niet tegenhouden. Bij een verse database
    // bestaan de tabellen nog niet, en als de hub daarop crasht kan je de
    // migratie niet eens draaien: de container herstart dan eindeloos.
    try {
        const removed = await pruneExpired()
        if (removed > 0) console.log(`${removed} verlopen OIDC-rij(en) opgeruimd.`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
            `Kon niet opruimen: ${message}\n` +
                'Bestaan de tabellen al? Draai:  npm run db:migrate\n' +
                '(in Docker:  docker compose exec oidc npm run db:migrate)'
        )
    }

    // Elk uur opnieuw. unref() zorgt dat deze timer het afsluiten niet tegenhoudt.
    setInterval(() => {
        pruneExpired().catch((error: unknown) => {
            console.error('Opruimen mislukt:', error instanceof Error ? error.message : error)
        })
    }, 3600_000).unref()
}

/**
 * Ruimt verlopen rijen op. Zonder dit groeit oidc_payloads eindeloos: verlopen
 * tokens worden bij het lezen wel genegeerd, maar niet verwijderd.
 */
/**
 * Gooit alles weg wat aan deze gebruiker hangt: sessies, grants en tokens.
 *
 * Nodig bij het blokkeren van een account. findAccount weigert hem daarna wel,
 * maar zonder deze opruiming blijft zijn SSO-sessie bestaan en zou hij bij elke
 * app een inlogscherm zien in plaats van er gewoon uit te liggen.
 *
 * accountId staat in de payload, niet in een eigen kolom. Dat is prima: dit
 * draait alleen als een beheerder op de knop drukt, niet in een hete route.
 */
export async function revokeForAccount(accountId: string): Promise<number> {
    const result = await database().execute(
        sql`delete from ${id('oidc_payloads')}
            where (${id('payload')}::jsonb ->> 'accountId') = ${accountId}`
    )
    return result.rowsAffected
}

export async function pruneExpired(): Promise<number> {
    const result = await database().execute(
        sql`delete from ${id('oidc_payloads')} where ${id('expires_at')} is not null and ${id('expires_at')} < ${new Date()}`
    )
    return result.rowsAffected
}
