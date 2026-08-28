import { Injectable } from '@nestjs/common'
import { FRONTEND_URL, getClient, getOidcConfig, REDIRECT_URI } from './oidc.js'
import type { SessionRequest, SessionUser } from './oidc.js'

@Injectable()
export class AuthService {
    /** Bouwt de URL naar de hub en zet PKCE + state in de sessie. */
    async buildLoginUrl(req: SessionRequest): Promise<string> {
        const client = await getClient()
        const config = await getOidcConfig()

        const codeVerifier = client.randomPKCECodeVerifier()
        const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
        const state = client.randomState()

        req.session!.codeVerifier = codeVerifier
        req.session!.state = state
        req.session!.returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/'

        return client.buildAuthorizationUrl(config, {
            redirect_uri: REDIRECT_URI,
            scope: 'openid profile email',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state
        }).href
    }

    /** Wisselt de code in voor tokens en zet de gebruiker in de sessie. */
    async handleCallback(req: SessionRequest): Promise<string> {
        const client = await getClient()
        const config = await getOidcConfig()

        const current = new URL(`http://localhost:{{BACKEND_PORT}}${req.originalUrl}`)
        const tokens = await client.authorizationCodeGrant(config, current, {
            pkceCodeVerifier: req.session!.codeVerifier!,
            expectedState: req.session!.state
        })

        // Bij de code-flow bevat het id_token volgens de spec alleen `sub`.
        // De rest van het profiel komt van het userinfo-endpoint.
        const claims = tokens.claims() as unknown as { sub: string }
        const profile = (await client.fetchUserInfo(
            config,
            tokens.access_token,
            claims.sub
        )) as unknown as { name?: string; email?: string; role?: string }

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

        return `${FRONTEND_URL}${returnTo}`
    }
}
