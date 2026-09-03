import express, { type Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import Provider from 'oidc-provider'
import type { Configuration } from 'oidc-provider'
import { CLIENTS, allClients, allowsRegistration, brandingFor, clientExists, registerClient } from './clients.js'
import { all as allUsers, findById, register, setBlocked, verify } from './users.js'
import * as screens from './screens.js'
import { StorageAdapter, initStorage, revokeForAccount } from './adapter.js'
import { loadOrCreateJwks } from './keys.js'

/**
 * Waar deze router hangt.
 *
 * Leeg als de hub een eigen server is: dan is hij de baas over alle paden.
 * "/oidc" als hij in je eigen app zit, want dan moet er ruimte overblijven voor
 * je eigen schermen - en dan hoort dat voorvoegsel ook in de issuer.
 */
export const MOUNT = '{{MOUNT}}'

// Opslag klaarzetten voor de Provider bestaat. Bij een database zet dit de
// verbinding op; bij bestandsopslag doet het niets.
await initStorage()

export const PORT = Number(process.env.PORT ?? {{OIDC_PORT}})

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
/**
 * De sleutel waarmee de cookies van de hub ondertekend worden.
 *
 * Zonder waarde stopt de hub meteen in plaats van stilletjes met een
 * standaardsleutel te draaien - dat is precies het soort fout dat je pas merkt
 * als iemand hem misbruikt.
 */
const COOKIE_KEY = process.env.OIDC_COOKIE_KEY ?? ''
if (!COOKIE_KEY) {
    console.error(
        'OIDC_COOKIE_KEY ontbreekt in .env.\n' +
            'Zonder die sleutel zijn de cookies van de hub niet te vertrouwen.\n' +
            'Zet er een willekeurige waarde in, bijvoorbeeld:\n' +
            '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
    process.exit(1)
}

export const ISSUER = process.env.OIDC_ISSUER ?? `http://localhost:${PORT}{{MOUNT}}`

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
        // Het pad moet het mountpad bevatten: oidc-provider weet niets van waar
        // Express deze router heeft opgehangen, en de cookie van de interactie
        // krijgt precies dit pad mee.
        url: (_ctx, interaction) => `${MOUNT}/interaction/${interaction.uid}`
    },
    // Vertaalt een account-id naar de claims in het id_token.
    findAccount: async (_ctx, id) => {
        const user = await findById(id)
        if (!user) return undefined

        // Ook hier controleren en niet alleen in verify(). Die draait namelijk
        // enkel op het wachtwoordformulier: wie al een SSO-sessie heeft komt
        // langs autoGrant en zou anders veertien dagen lang verse tokens
        // blijven krijgen nadat je hem geblokkeerd hebt.
        if (user.blocked) return undefined

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
        // Ondertekent de sessie- en interaction-cookies van de hub. Uit .env,
        // want een sleutel die in de repo staat is geen sleutel: wie hem kent
        // kan een cookie vervalsen en zich voordoen als een ingelogde
        // gebruiker. starter-cli genereert er een bij het scaffolden.
        keys: [COOKIE_KEY],
        // Op de wortel en niet op het pad van de interaction.
        //
        // Standaard hangt oidc-provider deze cookie aan {{MOUNT}}/interaction/
        // <uid>. Het inlogscherm is bij een hub-app een pagina van Next en het
        // formulier post naar een ander pad - dan zou de cookie niet meegaan en
        // krijg je "interaction session not found" bij het eerste wachtwoord.
        short: { path: '/' }
    },
    pkce: { required: () => true }
}

export const provider = new Provider(ISSUER, configuration)

/**
 * De hub staat achter Next.
 *
 * Zonder dit bouwt oidc-provider zijn URL's uit de Host-header die hij ziet -
 * en dat is het interne adres. Dan staat er 127.0.0.1 in je discovery-document
 * en in elke redirect. Met proxy = true kijkt hij naar x-forwarded-host en
 * x-forwarded-proto, die Next meestuurt.
 */
provider.proxy = true

/**
 * Alle routes van de hub in een router, niet rechtstreeks op een app.
 *
 * Daardoor kan hetzelfde bestand in drie opzetten draaien: als losse Express-
 * server, of ingebouwd in je eigen app achter Express of NestJS. Nest draait
 * onder water ook op Express, dus daar past deze router zonder aanpassing in.
 */
export const router: Router = express.Router()

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

/**
 * Mag je vanuit deze app een account aanmaken?
 *
 * De vlag staat per client. Staat hij uit, dan is de route niet alleen zonder
 * knop maar ook echt dicht - een verborgen knop is geen slot.
 */
async function mayRegister(
    details: Awaited<ReturnType<typeof provider.interactionDetails>>,
    res: express.Response
): Promise<boolean> {
    if (await allowsRegistration(String(details.params.client_id))) return true

    res.status(403).type('text/plain').send(
        'Registreren kan niet vanuit deze app.\n' +
            'Maak je account aan bij de centrale app en meld je hier daarna aan.'
    )
    return false
}

/**
 * Een eenvoudige rem, per IP en per sleutel.
 *
 * Waarom dit er hoort: scrypt kost met opzet ~50-100 ms rekentijd per poging.
 * Zonder rem kan iemand niet alleen ongelimiteerd wachtwoorden raden, maar met
 * honderd gelijktijdige verzoeken ook de event loop platleggen - er is niet
 * eens een account voor nodig. En het aanmeld-endpoint is anders een gratis
 * orakel om registratietokens te raden: 400 betekent goed, 401 fout.
 *
 * Bewust geen dependency: een Map met tijdstempels doet wat het moet doen voor
 * één proces. Draai je meerdere exemplaren, vervang dit dan door een teller in
 * Redis of de database - dit is de plek waar dat hoort.
 */
const pogingen = new Map<string, number[]>()

function rem(max: number, perMs: number) {
    return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
        const ip = req.ip ?? 'onbekend'
        // Ook op e-mailadres, anders wisselt een aanvaller gewoon van IP en
        // blijft hij hetzelfde account bestoken.
        const wie = typeof req.body?.email === 'string' ? String(req.body.email).toLowerCase() : ''
        const nu = Date.now()

        for (const sleutel of [`ip:${ip}:${req.path}`, wie ? `wie:${wie}` : '']) {
            if (!sleutel) continue
            const recent = (pogingen.get(sleutel) ?? []).filter(t => nu - t < perMs)
            if (recent.length >= max) {
                res.setHeader('retry-after', Math.ceil((perMs - (nu - recent[0])) / 1000))
                res.status(429).json({ error: 'Te veel pogingen. Probeer het straks opnieuw.' })
                return
            }
            recent.push(nu)
            pogingen.set(sleutel, recent)
        }

        next()
    }
}

// De Map laten groeien tot het geheugen vol is, is zelf ook een aanvalsvector.
setInterval(
    () => {
        const grens = Date.now() - 60 * 60 * 1000
        for (const [sleutel, tijden] of pogingen) {
            const over = tijden.filter(t => t > grens)
            if (over.length === 0) pogingen.delete(sleutel)
            else pogingen.set(sleutel, over)
        }
    },
    10 * 60 * 1000
).unref()

/** Tien inlogpogingen per vijf minuten. */
const remInloggen = rem(10, 5 * 60 * 1000)
/** Vijf nieuwe accounts per uur. */
const remRegistreren = rem(5, 60 * 60 * 1000)
/** Tien aanmeldpogingen per uur; genoeg om te scaffolden, te weinig om te raden. */
const remAanmelden = rem(10, 60 * 60 * 1000)

/** Toont het juiste scherm, of rondt de consent stil af. */
router.get('/interaction/:uid', async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        const brand = await brandingFor(String(details.params.client_id))

        if (details.prompt.name === 'login') {
            // Mag je hier een account aanmaken? Het inlogscherm moet dat weten,
            // anders staat er een knop die daarna 403 geeft.
            const mag = await allowsRegistration(String(details.params.client_id))
            screens.showLogin(req, res, next, { uid: details.uid, brand, step: 'idle', mayRegister: mag })
            return
        }

        // consent: first-party apps hoeven de gebruiker niets te vragen.
        const grantId = await autoGrant(details)
        await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true })
    } catch (err) {
        next(err)
    }
})

router.get('/interaction/:uid/register', async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        if (!(await mayRegister(details, res))) return

        screens.showRegister(req, res, next, {
            uid: details.uid,
            brand: await brandingFor(String(details.params.client_id))
        })
    } catch (err) {
        next(err)
    }
})

router.post('/interaction/:uid/login', form, remInloggen, async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        const brand = await brandingFor(String(details.params.client_id))
        const { user, error } = await verify(String(req.body.email ?? ''), String(req.body.password ?? ''))

        if (!user) {
            const mag = await allowsRegistration(String(details.params.client_id))
            screens.showLogin(req, res, next, {
                uid: details.uid,
                brand,
                step: 'idle',
                error,
                email: String(req.body.email ?? ''),
                mayRegister: mag
            })
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

router.post('/interaction/:uid/register', form, remRegistreren, async (req, res, next) => {
    try {
        const details = await provider.interactionDetails(req, res)
        if (!(await mayRegister(details, res))) return

        const brand = await brandingFor(String(details.params.client_id))

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
            screens.showRegister(req, res, next, {
                uid: details.uid,
                brand,
                error: e instanceof Error ? e.message : 'Registreren mislukt.'
            })
        }
    } catch (err) {
        next(err)
    }
})

/* --------------------------------------------------------------------------
 * Admin-API — leest het access token en controleert de rol.
 * De hub is zelf de uitgever, dus hij kan het token rechtstreeks opzoeken.
 * ------------------------------------------------------------------------ */

/**
 * Welke apps mogen de beheer-API aanspreken?
 *
 * Alleen de rol controleren is niet genoeg. Elke aangesloten app krijgt via
 * autoGrant stilzwijgend een token voor de ingelogde gebruiker; logt een
 * beheerder één keer in op app B, dan kan de backend van app B daarmee al je
 * gebruikers lezen en accounts blokkeren. Vandaar ook een lijst van clients die
 * dit mogen - standaard alleen de app van de hub zelf.
 *
 * Sluit je later een apart beheerpaneel aan, zet dan zijn client_id hierbij in
 * de .env van de hub en herstart hem.
 */
const ADMIN_CLIENTS = new Set(
    (process.env.ADMIN_CLIENT_IDS ?? '{{CLIENT_ID}}')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
)

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

    if (!ADMIN_CLIENTS.has(String(accessToken.clientId))) {
        res.status(403).json({
            error:
                `De app ${String(accessToken.clientId)} mag de beheer-API niet gebruiken. ` +
                'Zet zijn client_id bij ADMIN_CLIENT_IDS in de .env van de hub en herstart hem.'
        })
        return undefined
    }

    const user = await findById(accessToken.accountId)
    if (!user || user.role !== 'admin') {
        res.status(403).json({ error: 'Alleen voor beheerders' })
        return undefined
    }

    return user
}

router.get('/admin/api/users', async (req, res, next) => {
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

/**
 * Is dit een redirect-URI waar we een gebruiker heen mogen sturen?
 *
 * Alleen http en https, en geen fragment - de rest van de schema's (javascript:,
 * data:) zijn manieren om code te laten draaien op het moment dat de hub je
 * terugstuurt. http staat toe omdat je lokaal ontwikkelt; buiten localhost
 * hoort het https te zijn.
 */
function geldigeRedirect(waarde: unknown): waarde is string {
    if (typeof waarde !== 'string' || waarde.length > 2000) return false

    let url: URL
    try {
        url = new URL(waarde)
    } catch {
        return false
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.hash) return false

    const lokaal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost')
    return url.protocol === 'https:' || lokaal
}

/**
 * Een app aanmelden bij de hub.
 *
 * Hier komt `starter-cli` langs als je een nieuw project op deze hub aansluit.
 * Beveiligd met een eigen token uit .env en niet met een admin-sessie: de CLI
 * heeft geen ingelogde gebruiker, en zonder token zou iedereen die de hub kan
 * bereiken zich kunnen aanmelden.
 *
 * Laat je HUB_REGISTRATION_TOKEN leeg, dan staat dit eindpunt uit.
 */
router.post('/admin/api/clients', express.json(), remAanmelden, async (req, res, next) => {
    try {
        const expected = process.env.HUB_REGISTRATION_TOKEN ?? ''
        if (!expected) {
            res.status(503).json({ error: 'Aanmelden staat uit: HUB_REGISTRATION_TOKEN is leeg.' })
            return
        }

        const header = req.headers.authorization ?? ''
        const token = header.startsWith('Bearer ') ? header.slice(7) : ''
        // Vergelijken op lengte én inhoud; timingSafeEqual gooit bij ongelijke
        // lengtes, dus die controleren we eerst.
        const ok =
            token.length === expected.length &&
            timingSafeEqual(Buffer.from(token), Buffer.from(expected))
        if (!ok) {
            res.status(401).json({ error: 'Ongeldig registratietoken' })
            return
        }

        const body = req.body as {
            client_id?: string
            client_secret?: string
            name?: string
            redirect_uris?: string[]
            post_logout_redirect_uris?: string[]
            allow_registration?: boolean
        }

        if (!body.client_id || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
            res.status(400).json({ error: 'client_id en minstens een redirect_uri zijn verplicht.' })
            return
        }

        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.client_id)) {
            res.status(400).json({ error: 'client_id mag alleen kleine letters, cijfers en streepjes bevatten.' })
            return
        }

        // Alleen toevoegen, nooit overschrijven. Het registratietoken gaat per
        // ontwerp rond bij iedereen die een app aansluit; met een upsert zou
        // een van hen de redirect_uris van een draaiende app kunnen vervangen
        // door zijn eigen adres en zo de autorisatiecodes van je gebruikers
        // opvangen. PKCE helpt daar niet tegen: hij kiest de verifier zelf.
        if (await clientExists(body.client_id)) {
            res.status(409).json({
                error: `De client ${body.client_id} bestaat al. Wijzigen doe je in de database of via het beheerscherm.`
            })
            return
        }

        const uris = [...body.redirect_uris, ...(body.post_logout_redirect_uris ?? [])]
        const fout = uris.find(uri => !geldigeRedirect(uri))
        if (fout !== undefined) {
            res.status(400).json({
                error: `${String(fout)} is geen bruikbare redirect-URI: alleen http op localhost of https, en zonder #fragment.`
            })
            return
        }

        await registerClient({
            clientId: body.client_id,
            name: body.name ?? body.client_id,
            clientSecret: body.client_secret,
            redirectUris: body.redirect_uris,
            postLogoutRedirectUris: body.post_logout_redirect_uris ?? [],
            allowRegistration: body.allow_registration ?? false
        })

        res.status(201).json({ ok: true, client_id: body.client_id })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(501).json({ error: message })
    }
})

router.get('/admin/api/clients', async (req, res, next) => {
    try {
        if (!(await requireAdmin(req, res))) return
        res.json({
            clients: await allClients()
        })
    } catch (err) {
        next(err)
    }
})

router.post('/admin/api/users/:id/blocked', form, async (req, res, next) => {
    try {
        const admin = await requireAdmin(req, res)
        if (!admin) return
        if (req.params.id === admin.id) {
            res.status(400).json({ error: 'Je kan jezelf niet blokkeren.' })
            return
        }
        const blokkeren = String(req.body.blocked) === 'true'
        await setBlocked(req.params.id, blokkeren)

        // Blokkeren moet nu ingaan, niet pas als zijn sessie verloopt. Zonder
        // dit houdt hij tot veertien dagen een geldige SSO-sessie.
        if (blokkeren) await revokeForAccount(req.params.id)

        res.json({ ok: true })
    } catch (err) {
        next(err)
    }
})

// Als laatste: alles wat we hierboven niet zelf afhandelen is van
// oidc-provider (/auth, /token, /jwks, /.well-known, ...).
router.use(provider.callback())
