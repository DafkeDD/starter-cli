import express from 'express'
import Provider from 'oidc-provider'
import type { Configuration } from 'oidc-provider'
import { BRANDING, CLIENTS } from './clients.js'
import { all as allUsers, findById, register, setBlocked, verify } from './users.js'
import { loginPage, registerPage } from './views.js'
import { StorageAdapter, initStorage } from './adapter.js'
import { loadOrCreateJwks } from './keys.js'

// Opslag klaarzetten voor de Provider bestaat. Bij een database zet dit de
// verbinding op; bij bestandsopslag doet het niets.
await initStorage()

const PORT = Number(process.env.PORT ?? {{OIDC_PORT}})

/**
 * De issuer moet voor IEDEREEN dezelfde URL zijn: voor de browser en voor de
 * backends die server-to-server met de hub praten. Verschillen die twee, dan
 * klopt de `iss` in het id_token niet met wat de client verwacht en faalt de
 * validatie - met een foutmelding die nergens naar wijst.
 *
 * Buiten Docker is dat gewoon http://localhost:9000. In Docker zet compose hier
 * http://oidc.localhost:9000: die naam lost in je browser op naar 127.0.0.1 en
 * binnen het compose-netwerk naar de hub-container.
 */
const ISSUER = process.env.OIDC_ISSUER ?? `http://localhost:${PORT}`

const configuration: Configuration = {
    clients: CLIENTS,
    // Eigen opslag i.p.v. de ingebouwde demo-adapter.
    adapter: StorageAdapter,
    // Eigen ondertekeningssleutels i.p.v. wegwerpsleutels bij elke start.
    jwks: await loadOrCreateJwks(),
    // Expliciete levensduur; anders waarschuwt oidc-provider per artefact.
    ttl: {
        AccessToken: 3600, // 1 uur
        AuthorizationCode: 600, // 10 minuten
        IdToken: 3600, // 1 uur
        Interaction: 3600, // 1 uur om in te loggen
        Session: 14 * 24 * 3600, // 14 dagen — dit is de SSO-sessie
        Grant: 14 * 24 * 3600,
        RefreshToken: 14 * 24 * 3600
    },
    claims: {
        openid: ['sub'],
        email: ['email', 'email_verified'],
        profile: ['name', 'role']
    },
    features: {
        // Geen ingebouwde demo-schermen: we tonen onze eigen pagina's.
        devInteractions: { enabled: false },
        revocation: { enabled: true },
        rpInitiatedLogout: { enabled: true }
    },
    // Waar de gebruiker naartoe gestuurd wordt als er interactie nodig is.
    interactions: {
        url: (_ctx, interaction) => `/interaction/${interaction.uid}`
    },
    // Vertaalt een account-id naar de claims in het id_token.
    findAccount: async (_ctx, id) => {
        const user = await findById(id)
        if (!user) return undefined
        return {
            accountId: id,
            claims: async () => ({
                sub: id,
                email: user.email,
                email_verified: true,
                name: user.name,
                role: user.role
            })
        }
    },
    cookies: {
        keys: ['proefopstelling-geheim-niet-voor-productie']
    },
    pkce: { required: () => true }
}

const provider = new Provider(ISSUER, configuration)
const app = express()

// Bewust NIET globaal: oidc-provider parst zelf en waarschuwt als een upstream
// middleware de body al heeft ingelezen. We hangen hem alleen aan onze routes.
const form = express.urlencoded({ extended: false })

/** Onthoudt dat deze gebruiker deze client toestaat (first-party: automatisch). */
async function autoGrant(details: Awaited<ReturnType<typeof provider.interactionDetails>>) {
    const { session, params, prompt } = details
    const accountId = session?.accountId
    if (!accountId) return undefined

    const grant = new provider.Grant({ accountId, clientId: String(params.client_id) })
    const missingScopes = (prompt.details.missingOIDCScope as string[] | undefined) ?? []
    if (missingScopes.length) grant.addOIDCScope(missingScopes.join(' '))
    const missingClaims = (prompt.details.missingOIDCClaims as string[] | undefined) ?? []
    if (missingClaims.length) grant.addOIDCClaims(missingClaims)

    return grant.save()
}

/** Toont het juiste scherm, of rondt de consent stil af. */
app.get('/interaction/:uid', async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        const brand = BRANDING[String(details.params.client_id)]

        if (details.prompt.name === 'login') {
            res.send(loginPage(brand, details.uid))
            return
        }

        // consent: first-party apps hoeven de gebruiker niets te vragen.
        const grantId = await autoGrant(details)
        await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true })
    } catch (err) {
        next(err)
    }
})

app.get('/interaction/:uid/register', async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        res.send(registerPage(BRANDING[String(details.params.client_id)], details.uid))
    } catch (err) {
        next(err)
    }
})

app.post('/interaction/:uid/login', form, async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        const brand = BRANDING[String(details.params.client_id)]
        const { user, error } = await verify(String(req.body.email ?? ''), String(req.body.password ?? ''))

        if (!user) {
            res.send(loginPage(brand, details.uid, error))
            return
        }

        await provider.interactionFinished(
            req,
            res,
            { login: { accountId: user.id } },
            { mergeWithLastSubmission: false }
        )
    } catch (err) {
        next(err)
    }
})

app.post('/interaction/:uid/register', form, async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        const brand = BRANDING[String(details.params.client_id)]

        try {
            const user = await register(
                String(req.body.email ?? ''),
                String(req.body.name ?? ''),
                String(req.body.password ?? '')
            )
            await provider.interactionFinished(
                req,
                res,
                { login: { accountId: user.id } },
                { mergeWithLastSubmission: false }
            )
        } catch (e) {
            res.send(registerPage(brand, details.uid, e instanceof Error ? e.message : 'Registreren mislukt.'))
        }
    } catch (err) {
        next(err)
    }
})

/* --------------------------------------------------------------------------
 * Admin-API — leest het access token en controleert de rol.
 * De hub is zelf de uitgever, dus hij kan het token rechtstreeks opzoeken.
 * ------------------------------------------------------------------------ */

/** Haalt de ingelogde admin uit het bearer token, of stuurt 401/403. */
async function requireAdmin(req: express.Request, res: express.Response) {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) {
        res.status(401).json({ error: 'Geen token' })
        return undefined
    }

    const accessToken = await provider.AccessToken.find(token)
    if (!accessToken || !accessToken.accountId) {
        res.status(401).json({ error: 'Ongeldig of verlopen token' })
        return undefined
    }

    const user = await findById(accessToken.accountId)
    if (!user || user.role !== 'admin') {
        res.status(403).json({ error: 'Alleen voor beheerders' })
        return undefined
    }

    return user
}

app.get('/admin/api/users', async (req, res, next) => {
    try {
        const admin = await requireAdmin(req, res)
        if (!admin) return
        res.json({
            users: (await allUsers()).map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                blocked: u.blocked,
                createdAt: u.createdAt,
                isSelf: u.id === admin.id
            }))
        })
    } catch (err) {
        next(err)
    }
})

app.get('/admin/api/clients', async (req, res, next) => {
    try {
        if (!(await requireAdmin(req, res))) return
        res.json({
            clients: CLIENTS.map(c => ({
                client_id: c.client_id,
                redirect_uris: c.redirect_uris,
                branding: BRANDING[String(c.client_id)]?.name ?? '-'
            }))
        })
    } catch (err) {
        next(err)
    }
})

app.post('/admin/api/users/:id/blocked', form, async (req, res, next) => {
    try {
        const admin = await requireAdmin(req, res)
        if (!admin) return
        if (req.params.id === admin.id) {
            res.status(400).json({ error: 'Je kan jezelf niet blokkeren.' })
            return
        }
        await setBlocked(req.params.id, String(req.body.blocked) === 'true')
        res.json({ ok: true })
    } catch (err) {
        next(err)
    }
})

app.use(provider.callback())

app.listen(PORT, () => {
    console.log(`OIDC-hub luistert op ${ISSUER}`)
})
