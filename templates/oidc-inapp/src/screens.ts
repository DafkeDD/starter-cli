import type { NextFunction, Request, Response, Express } from 'express'
import type { Branding } from './clients.js'
import { MOUNT } from './hub.js'

/**
 * De schermen van de hub zijn pagina's van de Next-app ervoor.
 *
 * De hub rendert hier dus niets: hij stuurt je naar het juiste pad en Next doet
 * de rest. Dat kan omdat beide achter dezelfde origin zitten — Next staat
 * vooraan en proxyt {{MOUNT}}/... naar dit proces (zie next.config.ts).
 *
 * De paden zijn bewust zo gekozen dat geen enkel pad tegelijk een pagina én een
 * formulierdoel is:
 *
 *   GET  {{MOUNT}}/interaction/<uid>            de hub: inloggen of consent?
 *   GET  {{MOUNT}}/aanmelden/<uid>              pagina in Next  (inloggen)
 *   GET  {{MOUNT}}/aanmelden/<uid>/nieuw        pagina in Next  (registreren)
 *   POST {{MOUNT}}/interaction/<uid>/login      de hub
 *   POST {{MOUNT}}/interaction/<uid>/register   de hub
 *
 * /interaction blijft bewust van de hub. Daar wordt beslist of je een scherm
 * moet zien of dat de consent stil afgerond kan worden - en dat kan Next niet
 * weten. Zou een pagina op dat pad staan, dan zou Next hem opvangen en zou een
 * ingelogde gebruiker eindeloos een inlogscherm blijven zien.
 */
export interface ScreenContext {
    uid: string
    brand?: Branding
    step?: 'idle' | 'mfa'
    error?: string
    email?: string
    /**
     * Mag je vanuit de app waar je vandaan komt een account aanmaken?
     *
     * Staat per client (allow_registration). De route is sowieso dicht als het
     * niet mag; dit zorgt dat er dan ook geen knop staat die daarna 403 geeft.
     */
    mayRegister?: boolean
}

/** Niets te doen: Next draait als eigen proces ervoor. */
export async function attach(_app: Express): Promise<void> {}

/** Idem. Alles wat de hub niet kent hoort hier een 404 te zijn. */
export function fallback(_app: Express): void {}

export function showLogin(req: Request, res: Response, next: NextFunction, ctx: ScreenContext): void {
    show(req, res, next, `${MOUNT}/aanmelden/${encodeURIComponent(ctx.uid)}`, ctx)
}

export function showRegister(req: Request, res: Response, next: NextFunction, ctx: ScreenContext): void {
    show(req, res, next, `${MOUNT}/aanmelden/${encodeURIComponent(ctx.uid)}/nieuw`, ctx)
}

/**
 * Altijd een redirect, ook op een GET.
 *
 * De hub kan de pagina niet zelf renderen — die staat in een ander proces. Met
 * 303 doet de browser sowieso een GET, ook na een mislukt formulier, en reist
 * de foutmelding mee in de query.
 */
function show(req: Request, res: Response, _next: NextFunction, path: string, ctx: ScreenContext): void {
    const step = ctx.step && ctx.step !== 'idle' ? ctx.step : one(req.query.step)
    const error = ctx.error ?? one(req.query.error)
    const email = ctx.email ?? one(req.query.email)

    const query = new URLSearchParams()
    if (step && step !== 'idle') query.set('step', step)
    if (error) query.set('error', error)
    if (email) query.set('email', email)
    // De pagina staat in een ander proces en kan de clients niet bevragen, dus
    // reist de vlag mee in de URL.
    if (ctx.mayRegister) query.set('reg', '1')

    res.redirect(303, query.size > 0 ? `${path}?${query.toString()}` : path)
}

/** Express geeft bij een dubbele parameter een array terug; wij willen er één. */
function one(value: unknown): string | undefined {
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    return undefined
}
