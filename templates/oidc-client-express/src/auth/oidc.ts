import * as client from 'openid-client'

/**
 * Verbinding met de OIDC-server (de hub).
 *
 * De discovery gebeurt lui: pas bij de eerste login, niet bij het opstarten.
 * Zo start je backend ook als de hub even niet draait, en krijg je een nette
 * foutmelding in plaats van een crash.
 */
const ISSUER = process.env.OIDC_ISSUER ?? '{{ISSUER}}'
const CLIENT_ID = process.env.OIDC_CLIENT_ID ?? '{{CLIENT_ID}}'
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET ?? ''

export const REDIRECT_URI =
    process.env.OIDC_REDIRECT_URI ?? 'http://localhost:{{BACKEND_PORT}}/auth/callback'

/** Waar de gebruiker na het inloggen naartoe gaat. */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:{{FRONTEND_PORT}}'

let configPromise: Promise<client.Configuration> | undefined

export function getOidcConfig(): Promise<client.Configuration> {
    configPromise ??= client
        .discovery(
            new URL(ISSUER),
            CLIENT_ID,
            CLIENT_SECRET,
            undefined,
            // http is alleen voor lokale ontwikkeling; in productie is dit https.
            ISSUER.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined
        )
        .catch(err => {
            configPromise = undefined // volgende poging opnieuw proberen
            throw new Error(
                `Kon de OIDC-server op ${ISSUER} niet bereiken: ${err instanceof Error ? err.message : String(err)}`
            )
        })

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
