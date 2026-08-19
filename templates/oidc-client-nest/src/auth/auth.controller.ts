import { Controller, Get, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AuthService } from './auth.service'
import { FRONTEND_URL } from './oidc'
import type { SessionRequest, SessionUser } from './oidc'

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

    /** Wie ben ik? De frontend gebruikt dit om te weten of je ingelogd bent. */
    @Get('me')
    me(@Req() req: SessionRequest, @Res() res: Response): void {
        const user = req.session?.user as SessionUser | undefined
        if (!user) {
            res.status(401).json({ user: null })
            return
        }
        // Het access token blijft server-side — dat gaat nooit naar de browser.
        const { accessToken: _ignored, ...safe } = user
        res.json({ user: safe })
    }

    /** Uitloggen bij deze app. De sessie op de hub blijft staan. */
    @Get('logout')
    logout(@Req() req: SessionRequest, @Res() res: Response): void {
        req.session = null
        res.redirect(FRONTEND_URL)
    }
}
