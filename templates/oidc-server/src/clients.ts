import type { ClientMetadata } from 'oidc-provider'

/**
 * De apps die op deze hub aansluiten.
 *
 * Dit bestand is door starter-cli gegenereerd met één client: het project zelf.
 * Elke nieuwe app die je met `starter-cli` maakt en op deze hub laat aansluiten,
 * voegt hier een blok toe — of registreert zichzelf via dynamic registration.
 *
 * `branding` bepaalt hoe het loginscherm eruitziet voor die app: de hub leest
 * het uit op basis van de `client_id` in de authorization request.
 */
export interface Branding {
    name: string
    accent: string
    tagline: string
}

export const BRANDING: Record<string, Branding> = {
    '{{CLIENT_ID}}': {
        name: '{{PROJECT_NAME}}',
        accent: '{{ACCENT}}',
        tagline: '{{TAGLINE}}'
    }
}

export const CLIENTS: ClientMetadata[] = [
    {
        client_id: '{{CLIENT_ID}}',
        client_secret: '{{CLIENT_SECRET}}',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        redirect_uris: ['http://localhost:{{BACKEND_PORT}}/auth/callback'],
        post_logout_redirect_uris: ['http://localhost:{{FRONTEND_PORT}}/']
    }
]
