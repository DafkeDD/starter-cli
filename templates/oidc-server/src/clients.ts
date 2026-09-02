import type { ClientMetadata } from 'oidc-provider'

/**
 * De apps die op deze hub aansluiten.
 *
 * Dit bestand is de bestandsvariant: één client, hard in de code. Kies je bij
 * het scaffolden een database, dan wordt het vervangen door een versie die de
 * clients uit de tabel `clients` leest — met dezelfde functies hieronder, zodat
 * de rest van de hub het verschil niet merkt.
 *
 * `branding` bepaalt hoe het loginscherm eruitziet voor die app: de hub leest
 * het op aan de hand van de `client_id` in de authorization request.
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
    /** Mag je vanuit deze app een account aanmaken? */
    allow_registration: boolean
}

const OWN_CLIENT = '{{CLIENT_ID}}'

const BRANDING: Record<string, Branding> = {
    [OWN_CLIENT]: {
        name: '{{PROJECT_NAME}}',
        accent: '{{ACCENT}}',
        tagline: '{{TAGLINE}}'
    }
}

/**
 * De clients die oidc-provider bij het opstarten meekrijgt.
 *
 * Bij de databaseversie is deze lijst leeg: oidc-provider zoekt een onbekende
 * client dan op via de adapter, en die kijkt in de tabel.
 */
export const CLIENTS: ClientMetadata[] = [
    {
        client_id: OWN_CLIENT,
        client_secret: '{{CLIENT_SECRET}}',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        redirect_uris: ['http://localhost:{{BACKEND_PORT}}/auth/callback'],
        post_logout_redirect_uris: ['http://localhost:{{FRONTEND_PORT}}/']
    }
]

/** Niets te doen: de client staat hierboven al. */
export async function ensureOwnClient(): Promise<void> {}

export async function brandingFor(clientId: string): Promise<Branding | undefined> {
    return BRANDING[clientId]
}

/**
 * Alleen de app van de hub zelf mag accounts aanmaken.
 *
 * Bij de databaseversie is dit een kolom die je per app kan zetten. Hier is er
 * maar één app, en dat is de hub.
 */
export async function allowsRegistration(clientId: string): Promise<boolean> {
    return clientId === OWN_CLIENT
}

/**
 * Een app aanmelden bij de hub.
 *
 * Kan hier niet: in de bestandsvariant staan de clients in de code. De
 * foutmelding zegt precies wat je dan zelf moet doen.
 */
export async function registerClient(client: {
    clientId: string
    name?: string
    clientSecret?: string
    redirectUris?: string[]
    postLogoutRedirectUris?: string[]
    allowRegistration?: boolean
}): Promise<void> {
    throw new Error(
        `Deze hub bewaart zijn clients in src/clients.ts, niet in een database.\n` +
            `Voeg "${client.clientId}" daar met de hand toe en herstart de hub.`
    )
}

export async function allClients(): Promise<ClientRow[]> {
    return CLIENTS.map(c => ({
        client_id: String(c.client_id),
        name: BRANDING[String(c.client_id)]?.name ?? '-',
        redirect_uris: (c.redirect_uris ?? []) as string[],
        allow_registration: String(c.client_id) === OWN_CLIENT
    }))
}
