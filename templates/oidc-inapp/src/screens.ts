import next from 'next'
import type { NextFunction, Request, Response, Express } from 'express'
import type { Branding } from './clients.js'
import { MOUNT } from './hub.js'

/**
 * De schermen komen uit de Next.js-app in deze map.
 *
 * Geen proxy, geen tweede proces: Next draait in dezelfde server. "Toon het
 * inlogscherm" is hier gewoon een functieaanroep. Dat de browser nooit een
 * andere origin ziet is niet alleen netjes maar noodzakelijk - oidc-provider
 * zet zijn interaction-cookie op het pad {{MOUNT}}/interaction/<uid>, en die
 * cookie moet bij het versturen van het formulier gewoon meegaan.
 */
export interface ScreenContext {
    uid: string
    brand?: Branding
    step?: 'idle' | 'mfa'
    error?: string
    email?: string
}

const dev = process.env.NODE_ENV !== 'production'

let handle: ((req: Request, res: Response) => Promise<void>) | undefined

/**
 * Next opstarten. Duurt even in ontwikkeling, want hij compileert dan.
 *
 * Gebeurt VOOR de routes van de hub, maar hangt zelf nog niets op: de
 * afhandeling hoort helemaal achteraan, anders vangt Next de OIDC-endpoints af.
 */
export async function attach(_app: Express): Promise<void> {
    const app = next({ dev, dir: process.cwd() })
    await app.prepare()
    handle = app.getRequestHandler() as (req: Request, res: Response) => Promise<void>
}

/** Alles wat de hub niet zelf afhandelt is een pagina van je app. */
export function fallback(app: Express): void {
    // Express 5 wil een naam achter de ster; een kale '*' is er geen geldig
    // patroon meer sinds path-to-regexp 8.
    app.all('/*splat', (req, res) => {
        void handle?.(req, res)
    })
}

export function showLogin(req: Request, res: Response, next: NextFunction, ctx: ScreenContext): void {
    show(req, res, next, `${MOUNT}/interaction/${encodeURIComponent(ctx.uid)}`, ctx)
}

export function showRegister(req: Request, res: Response, next: NextFunction, ctx: ScreenContext): void {
    show(req, res, next, `${MOUNT}/interaction/${encodeURIComponent(ctx.uid)}/register`, ctx)
}

/**
 * Een GET laat Next renderen; op een POST kan dat niet.
 *
 * Na een mislukte post is de body al gelezen en zou Next een formulier-post
 * moeten renderen die hij niet kent. Daarom sturen we de browser terug met een
 * 303: die doet dan een verse GET, met de foutmelding in de query.
 */
function show(req: Request, res: Response, _next: NextFunction, path: string, ctx: ScreenContext): void {
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

    req.url = target
    void handle?.(req, res)
}

/** Express geeft bij een dubbele parameter een array terug; wij willen er één. */
function one(value: unknown): string | undefined {
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    return undefined
}
