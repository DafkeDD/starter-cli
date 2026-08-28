import { createProxyMiddleware } from 'http-proxy-middleware'
import type { NextFunction, Request, Response, Express } from 'express'
import type { Branding } from './clients.js'

/**
 * De schermen van de hub komen uit de Next.js-app in ../oidc-web.
 *
 * Belangrijk: de browser praat NOOIT rechtstreeks met die app. De hub proxyt
 * hem, zodat alles op één origin staat. Dat is geen netheid maar noodzaak —
 * oidc-provider zet zijn _interaction-cookie op de origin van de hub, en een
 * formulier dat vanaf een andere origin post krijgt die cookie niet mee zodra
 * hub en UI verschillende hostnamen hebben (precies wat er in Docker gebeurt,
 * waar de hub oidc.localhost heet).
 *
 * Alleen GET-verkeer gaat door naar Next. De formulieren posten naar de hub
 * zelf; die kent de sessie en beslist wat er daarna gebeurt.
 */
export interface ScreenContext {
    uid: string
    brand?: Branding
    step?: 'idle' | 'mfa'
    error?: string
    email?: string
}

/** Waar de UI-app draait. In Docker is dat de servicenaam, lokaal localhost. */
const UI_URL = process.env.OIDC_WEB_URL ?? 'http://localhost:{{OIDC_WEB_PORT}}'

const uiProxy = createProxyMiddleware({
    target: UI_URL,
    changeOrigin: false,
    // Next stuurt bij een fout zijn eigen pagina; die willen we gewoon zien.
    on: {
        error(err, _req, res) {
            const message =
                `De schermen van de hub draaien niet.\n\n` +
                `Verwacht op ${UI_URL} — start ze met:\n` +
                `  cd oidc-web && npm run dev\n\n` +
                `(${err.message})`
            if ('writeHead' in res) {
                res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
                res.end(message)
            }
        }
    }
})

/**
 * Hangt de assets van Next aan de hub.
 *
 * Zonder dit laadt de pagina wel, maar zonder CSS en zonder JavaScript: die
 * bestanden staan allemaal onder /_next.
 */
export function attach(app: Express): void {
    // Bewust pathFilter en geen app.use('/_next', ...): Express knipt bij een
    // mountpad het voorvoegsel van req.url af, en dan vraagt de proxy
    // /static/... op in plaats van /_next/static/... - waarop Next zijn eigen
    // 404-pagina teruggeeft en je scherm zonder opmaak staat.
    app.use(
        createProxyMiddleware({
            target: UI_URL,
            changeOrigin: false,
            ws: true,
            // Een functie en geen glob: dit is precies te lezen en het scheelt
            // gedoe met de matcher.
            pathFilter: (pathname) => pathname.startsWith('/_next') || pathname.startsWith('/__nextjs')
        })
    )
}

export function showLogin(req: Request, res: Response, next: NextFunction, ctx: ScreenContext): void {
    show(req, res, next, `/interaction/${encodeURIComponent(ctx.uid)}`, ctx)
}

export function showRegister(req: Request, res: Response, next: NextFunction, ctx: ScreenContext): void {
    show(req, res, next, `/interaction/${encodeURIComponent(ctx.uid)}/register`, ctx)
}

/**
 * Een GET proxyt door naar Next; een POST kan dat niet.
 *
 * Bij een POST is de body al ingelezen en zou doorproxyen betekenen dat Next
 * een formulier-post moet renderen die hij niet kent. Daarom sturen we de
 * browser terug met een 303: die doet dan een verse GET, en de foutmelding
 * reist mee in de query.
 */
function show(req: Request, res: Response, next: NextFunction, path: string, ctx: ScreenContext): void {
    // De hub-routes kennen deze parameters niet; ze komen van een eerdere
    // mislukte post die hierheen terugverwees. Wat de aanroeper meegeeft wint,
    // de rest houden we vast - anders is je foutmelding na de redirect weg.
    const step = ctx.step && ctx.step !== 'idle' ? ctx.step : one(req.query.step)
    const error = ctx.error ?? one(req.query.error)
    const email = ctx.email ?? one(req.query.email)

    const query = new URLSearchParams()
    if (step && step !== 'idle') query.set('step', step)
    if (error) query.set('error', error)
    if (email) query.set('email', email)

    const target = query.size > 0 ? `${path}?${query.toString()}` : path

    if (req.method !== 'GET') {
        res.redirect(303, target)
        return
    }

    // De proxy stuurt req.url door; die zetten we op het pad dat Next kent.
    req.url = target
    uiProxy(req, res, next)
}

/** Express geeft bij een dubbele parameter een array terug; wij willen er één. */
function one(value: unknown): string | undefined {
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    return undefined
}
