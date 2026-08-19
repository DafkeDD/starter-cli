import { Controller, Get, Param, Post, Req, Res, Body } from '@nestjs/common'
import type { Response } from 'express'
import { HUB_ISSUER } from './oidc'
import type { SessionRequest, SessionUser } from './oidc'

/**
 * Dit project IS het beheerpaneel van de OIDC-server.
 *
 * De backend praat met de admin-API van de hub namens de ingelogde beheerder,
 * met diens access token. De hub controleert de rol nog eens zelf — de
 * autorisatie zit dus niet alleen hier.
 */
@Controller('api/admin')
export class AdminController {
    /** Geeft de beheerder terug, of stuurt 401/403 en geeft undefined. */
    private admin(req: SessionRequest, res: Response): SessionUser | undefined {
        const user = req.session?.user
        if (!user) {
            res.status(401).json({ error: 'Niet ingelogd' })
            return undefined
        }
        if (user.role !== 'admin') {
            res.status(403).json({ error: 'Alleen voor beheerders' })
            return undefined
        }
        return user
    }

    private hub(path: string, token: string, init?: RequestInit): Promise<Response_> {
        return fetch(`${HUB_ISSUER}${path}`, {
            ...init,
            headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` }
        })
    }

    /** Alle gebruikers van de hub. */
    @Get('users')
    async users(@Req() req: SessionRequest, @Res() res: Response): Promise<void> {
        const user = this.admin(req, res)
        if (!user) return
        const response = await this.hub('/admin/api/users', user.accessToken)
        res.status(response.status).json(await response.json())
    }

    /** Alle apps die op de hub aangesloten zijn. */
    @Get('clients')
    async clients(@Req() req: SessionRequest, @Res() res: Response): Promise<void> {
        const user = this.admin(req, res)
        if (!user) return
        const response = await this.hub('/admin/api/clients', user.accessToken)
        res.status(response.status).json(await response.json())
    }

    /** Een gebruiker blokkeren of deblokkeren. */
    @Post('users/:id/blocked')
    async setBlocked(
        @Param('id') id: string,
        @Body() body: { blocked?: boolean },
        @Req() req: SessionRequest,
        @Res() res: Response
    ): Promise<void> {
        const user = this.admin(req, res)
        if (!user) return
        const response = await this.hub(`/admin/api/users/${id}/blocked`, user.accessToken, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ blocked: String(body?.blocked ?? true) }).toString()
        })
        res.status(response.status).json(await response.json())
    }
}

/** Het fetch-Response-type, hernoemd omdat Express ook een `Response` heeft. */
type Response_ = globalThis.Response
