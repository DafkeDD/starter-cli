import { exportJWK, generateKeyPair } from 'jose'
import { sql, id } from './db/sql.js'
import type { Db } from './db/types.js'

/**
 * Ondertekeningssleutels voor de tokens, uit de database.
 *
 * Waarom niet op schijf, zoals de bestandsvariant doet: zodra er een database
 * is, kan je de hub twee keer draaien of naar een verse host deployen. Met een
 * jwks.json naast de code maakt elk exemplaar dan zijn eigen sleutelpaar, en
 * dan valideert een id_token van de ene niet tegen de /jwks van de andere. Na
 * een deploy zijn bovendien alle uitgegeven tokens in één klap onverifieerbaar.
 *
 * De sleutels liggen in oidc_payloads onder een eigen type. Dat scheelt een
 * tabel, en het opruimen van verlopen rijen laat ze met rust: expires_at blijft
 * leeg.
 *
 * In productie horen deze eigenlijk in een secret store. Deze opzet is een
 * duidelijke stap beter dan een bestand, en de plek om dat te veranderen is
 * dit ene bestand.
 */
const TYPE = 'Jwks'
const KEY = 'actief'

// Zelfde patroon als users.ts en clients.ts: initStorage() geeft de verbinding
// door, zodat dit bestand niet zelf hoeft te weten hoe je verbindt.
let db: Db | null = null

export function useDatabase(connection: Db): void {
    db = connection
}

function database(): Db {
    if (!db) throw new Error('De sleutelopslag heeft nog geen database.')
    return db
}

export async function loadOrCreateJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const bestaand = await lees()
    if (bestaand) return bestaand

    const jwks = await maak()

    // Twee exemplaren die tegelijk opstarten maken allebei een sleutelpaar. De
    // eerste die schrijft wint; de tweede leest daarna gewoon wat er staat, dus
    // eindigen ze met dezelfde sleutels.
    await database().execute(
        sql`insert into ${id('oidc_payloads')} (${id('type')}, ${id('id')}, ${id('payload')})
            values (${TYPE}, ${KEY}, ${JSON.stringify(jwks)})
            on conflict (${id('type')}, ${id('id')}) do nothing`
    )

    return (await lees()) ?? jwks
}

async function lees(): Promise<{ keys: Record<string, unknown>[] } | null> {
    const row = await database().one<{ payload: string }>(
        sql`select ${id('payload')} from ${id('oidc_payloads')}
            where ${id('type')} = ${TYPE} and ${id('id')} = ${KEY}`
    )
    if (!row) return null

    const jwks = JSON.parse(row.payload) as { keys?: Record<string, unknown>[] }
    return jwks.keys?.length ? { keys: jwks.keys } : null
}

async function maak(): Promise<{ keys: Record<string, unknown>[] }> {
    const rsa = await generateKeyPair('RS256', { extractable: true })
    const ec = await generateKeyPair('ES256', { extractable: true })

    return {
        keys: [
            { ...(await exportJWK(rsa.privateKey)), use: 'sig', alg: 'RS256' },
            { ...(await exportJWK(ec.privateKey)), use: 'sig', alg: 'ES256' }
        ] as Record<string, unknown>[]
    }
}
