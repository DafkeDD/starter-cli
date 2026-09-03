import { Controller, Get, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AuthService } from './auth.service.js'
import { FRONTEND_URL } from './oidc.js'
import { HERCONTROLE_MS, tokenLeeftNog, type SessionRequest, type SessionUser } from './oidc.js'

/**
 * De OIDC-routes van deze app.
 *
 * Het wachtwoordveld staat NIET hier — dat staat alleen op de hub. Deze routes
 * sturen de gebruiker daarheen en vangen hem daarna weer op.
 */
@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    /** Start de login: stuurt door naar de hub, met PKCE. */
    @Get('start')
    async start(@Req() req: SessionRequest, @Res() res: Response): Promise<void> {
        try {
            res.redirect(await this.auth.buildLoginUrl(req))
        } catch (err) {
            res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
        }
    }

    /** De hub stuurt de gebruiker hier terug met een code. */
    @Get('callback')
    async callback(@Req() req: SessionRequest, @Res() res: Response): Promise<void> {
        try {
            res.redirect(await this.auth.handleCallback(req))
        } catch (err) {
            res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
        }
    }

    /**
     * Wie ben ik? De frontend gebruikt dit om te weten of je ingelogd bent.
     *
     * Elke vijf minuten vragen we de hub of dit token nog leeft. Blokkeer je
     * iemand daar, dan ligt hij hier binnen dat kwartiertje ook echt buiten in
     * plaats van de volle zeven dagen van de sessiecookie uit te zitten.
     */
    @Get('me')
    async me(@Req() req: SessionRequest, @Res() res: Response): Promise<void> {
        const user = req.session?.user as SessionUser | undefined
        if (!user) {
            res.status(401).json({ user: null })
            return
        }

        if (Date.now() - (user.checkedAt ?? 0) > HERCONTROLE_MS) {
            const leeft = await tokenLeeftNog(user.accessToken)
            if (leeft === false) {
                req.session = null
                res.status(401).json({ user: null })
                return
            }
            // null = de hub antwoordde niet. Dan laten we de sessie staan; een
            // hikkende hub hoort niet iedereen uit te loggen.
            if (leeft === true) req.session!.user = { ...user, checkedAt: Date.now() }
        }

        // Het access token blijft server-side - dat gaat nooit naar de browser.
        // checkedAt is onze eigen boekhouding en hoort er ook niet in.
        const { accessToken: _token, checkedAt: _gecontroleerd, ...safe } = user
        res.json({ user: safe })
    }

    /** Uitloggen bij deze app. De sessie op de hub blijft staan. */
    @Get('logout')
    logout(@Req() req: SessionRequest, @Res() res: Response): void {
        req.session = null
        res.redirect(FRONTEND_URL)
    }
}
