import { Router } from 'express'
import * as client from 'openid-client'
import { FRONTEND_URL, getOidcConfig, REDIRECT_URI, type SessionUser } from './oidc.js'
import { registerAdminRoutes } from './admin.js'

/**
 * De OIDC-routes van deze app.
 *
 * Het wachtwoordveld staat NIET hier — dat staat alleen op de hub. Deze routes
 * sturen de gebruiker daarheen en vangen hem daarna weer op.
 */
export const authRouter = Router()

/** Start de login: stuurt door naar de hub, met PKCE. */
authRouter.get('/auth/start', async (req, res) => {
    try {
        const config = await getOidcConfig()

        const codeVerifier = client.randomPKCECodeVerifier()
        const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
        const state = client.randomState()

        req.session!.codeVerifier = codeVerifier
        req.session!.state = state
        // Waar de gebruiker heen wilde vóór het inloggen.
        req.session!.returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/'

        res.redirect(
            client.buildAuthorizationUrl(config, {
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile email',
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                state
            }).href
        )
    } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
    }
})

/** De hub stuurt de gebruiker hier terug met een code. */
authRouter.get('/auth/callback', async (req, res) => {
    try {
        const config = await getOidcConfig()
        const current = new URL(`http://localhost:{{BACKEND_PORT}}${req.originalUrl}`)

        const tokens = await client.authorizationCodeGrant(config, current, {
            pkceCodeVerifier: req.session!.codeVerifier,
            expectedState: req.session!.state
        })

        // Bij de code-flow bevat het id_token volgens de spec alleen `sub`.
        // De rest van het profiel komt van het userinfo-endpoint.
        const claims = tokens.claims() as unknown as { sub: string }
        const profile = (await client.fetchUserInfo(config, tokens.access_token, claims.sub)) as unknown as {
            name?: string
            email?: string
            role?: string
        }

        const user: SessionUser = {
            sub: claims.sub,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            accessToken: tokens.access_token
        }

        const returnTo = req.session!.returnTo ?? '/'
        req.session!.user = user
        req.session!.codeVerifier = undefined
        req.session!.state = undefined
        req.session!.returnTo = undefined

        res.redirect(`${FRONTEND_URL}${returnTo}`)
    } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
})

/** Wie ben ik? De frontend gebruikt dit om te weten of je ingelogd bent. */
authRouter.get('/auth/me', (req, res) => {
    const user = req.session?.user as SessionUser | undefined
    if (!user) {
        res.status(401).json({ user: null })
        return
    }
    // Het access token blijft server-side — dat gaat nooit naar de browser.
    const { accessToken: _ignored, ...safe } = user
    res.json({ user: safe })
})

/** Uitloggen bij deze app. De sessie op de hub blijft staan. */
authRouter.get('/auth/logout', (req, res) => {
    req.session = null
    res.redirect(FRONTEND_URL)
})

registerAdminRoutes(authRouter)
