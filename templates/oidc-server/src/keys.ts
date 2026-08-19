import { exportJWK, generateKeyPair } from 'jose'
import { load, save } from './storage.js'

/**
 * Ondertekeningssleutels voor de tokens.
 *
 * oidc-provider genereert er zelf tijdelijke als je niets meegeeft — vandaar de
 * waarschuwing bij het opstarten. Bovendien zijn alle tokens dan ongeldig na een
 * herstart. Hier maken we ze één keer aan en bewaren we ze.
 *
 * In productie horen deze in een secret store, niet op schijf naast je code.
 */
export async function loadOrCreateJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const existing = load<{ keys: Record<string, unknown>[] } | null>('jwks', null)
    if (existing?.keys?.length) return existing

    const rsa = await generateKeyPair('RS256', { extractable: true })
    const ec = await generateKeyPair('ES256', { extractable: true })

    const jwks = {
        keys: [
            { ...(await exportJWK(rsa.privateKey)), use: 'sig', alg: 'RS256' },
            { ...(await exportJWK(ec.privateKey)), use: 'sig', alg: 'ES256' }
        ] as Record<string, unknown>[]
    }

    save('jwks', jwks)
    return jwks
}
