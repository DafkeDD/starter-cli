/**
 * Verbinding met de OIDC-server (de hub).
 *
 * `openid-client` v6 is ESM-only en Nest compileert naar CommonJS. Met
 * `module: nodenext` in tsconfig blijft een dynamische `import()` een échte
 * import, dus zo laden we de library alsnog. Meteen ook lui: pas bij de eerste
 * login, zodat je backend start ook als de hub even niet draait.
 */
type OpenIdClient = typeof import('openid-client')

const ISSUER = process.env.OIDC_ISSUER ?? '{{ISSUER}}'
const CLIENT_ID = process.env.OIDC_CLIENT_ID ?? '{{CLIENT_ID}}'
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET ?? ''

export const REDIRECT_URI =
    process.env.OIDC_REDIRECT_URI ?? 'http://localhost:{{BACKEND_PORT}}/auth/callback'

/** Waar de gebruiker na het inloggen naartoe gaat. */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:{{FRONTEND_PORT}}'

export const HUB_ISSUER = ISSUER

let clientPromise: Promise<OpenIdClient> | undefined
let configPromise: Promise<Awaited<ReturnType<OpenIdClient['discovery']>>> | undefined

export function getClient(): Promise<OpenIdClient> {
    clientPromise ??= import('openid-client')
    return clientPromise
}

export async function getOidcConfig(): Promise<Awaited<ReturnType<OpenIdClient['discovery']>>> {
    if (!configPromise) {
        configPromise = (async () => {
            const client = await getClient()
            return client.discovery(
                new URL(ISSUER),
                CLIENT_ID,
                CLIENT_SECRET,
                undefined,
                // http is alleen voor lokale ontwikkeling; in productie is dit https.
                ISSUER.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined
            )
        })().catch((err: unknown) => {
            configPromise = undefined // volgende poging opnieuw proberen
            throw new Error(
                `Kon de OIDC-server op ${ISSUER} niet bereiken: ${err instanceof Error ? err.message : String(err)}`
            )
        })
    }
    return configPromise
}

/** De ingelogde gebruiker, zoals we die in de sessie bewaren. */
export interface SessionUser {
    sub: string
    name?: string
    email?: string
    role?: string
    accessToken: string
}

/** Express-request met onze sessie erin. */
export interface SessionRequest {
    session: {
        user?: SessionUser
        codeVerifier?: string
        state?: string
        returnTo?: string
    } | null
    originalUrl: string
    query: Record<string, unknown>
}
