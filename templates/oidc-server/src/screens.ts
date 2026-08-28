import type { NextFunction, Request, Response } from 'express'
import type { Express } from 'express'
import { loginPage, registerPage } from './views.js'
import type { Branding } from './clients.js'

/**
 * Waar de schermen van de hub vandaan komen.
 *
 * Dit bestand is een naad. De hub weet alleen "toon het inlogscherm" en niet
 * hoe dat scherm gemaakt wordt. Deze versie rendert het zelf als HTML; kies je
 * bij het scaffolden voor de Next.js-schermen, dan wordt dit bestand vervangen
 * door een versie die naar die app proxyt. De routes in index.ts blijven gelijk.
 */
export interface ScreenContext {
    uid: string
    brand?: Branding
    /** Waar in de inlogflow je zit. */
    step?: 'idle' | 'mfa'
    error?: string
    email?: string
}

/** Eenmalig, bij het opstarten. Hier valt in deze versie niets te doen. */
export function attach(_app: Express): void {}

export function showLogin(_req: Request, res: Response, _next: NextFunction, ctx: ScreenContext): void {
    res.send(loginPage(ctx.brand, ctx.uid, ctx.error))
}

export function showRegister(_req: Request, res: Response, _next: NextFunction, ctx: ScreenContext): void {
    res.send(registerPage(ctx.brand, ctx.uid, ctx.error))
}
