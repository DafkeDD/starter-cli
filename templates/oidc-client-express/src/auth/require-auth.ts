import type { NextFunction, Request, Response } from 'express'
import type { SessionUser } from './oidc.js'

/** Geeft de ingelogde gebruiker, of undefined. */
export function currentUser(req: Request): SessionUser | undefined {
    return req.session?.user as SessionUser | undefined
}

/** Middleware: alleen doorlaten als er iemand ingelogd is. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!currentUser(req)) {
        res.status(401).json({ error: 'Niet ingelogd' })
        return
    }
    next()
}

/** Middleware: alleen doorlaten als de ingelogde gebruiker admin is. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = currentUser(req)
    if (!user) {
        res.status(401).json({ error: 'Niet ingelogd' })
        return
    }
    if (user.role !== 'admin') {
        res.status(403).json({ error: 'Alleen voor beheerders' })
        return
    }
    next()
}
