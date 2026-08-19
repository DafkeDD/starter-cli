import type { Router } from 'express'
import { currentUser, requireAdmin } from './require-auth.js'

/**
 * Dit project IS het beheerpaneel van de OIDC-server.
 *
 * De backend praat met de admin-API van de hub namens de ingelogde beheerder,
 * met diens access token. De hub controleert de rol nog eens zelf — de
 * autorisatie zit dus niet alleen hier.
 */
const ISSUER = process.env.OIDC_ISSUER ?? '{{ISSUER}}'

async function hub(path: string, token: string, init?: RequestInit): Promise<Response> {
    return fetch(`${ISSUER}${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` }
    })
}

export function registerAdminRoutes(router: Router): void {
    /** Alle gebruikers van de hub. */
    router.get('/api/admin/users', requireAdmin, async (req, res) => {
        const user = currentUser(req)!
        const response = await hub('/admin/api/users', user.accessToken)
        res.status(response.status).json(await response.json())
    })

    /** Alle apps die op de hub aangesloten zijn. */
    router.get('/api/admin/clients', requireAdmin, async (req, res) => {
        const user = currentUser(req)!
        const response = await hub('/admin/api/clients', user.accessToken)
        res.status(response.status).json(await response.json())
    })

    /** Een gebruiker blokkeren of deblokkeren. */
    router.post('/api/admin/users/:id/blocked', requireAdmin, async (req, res) => {
        const user = currentUser(req)!
        const response = await hub(`/admin/api/users/${req.params.id}/blocked`, user.accessToken, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ blocked: String(req.body?.blocked ?? true) }).toString()
        })
        res.status(response.status).json(await response.json())
    })
}
