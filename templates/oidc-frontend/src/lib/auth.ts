import { cookies } from 'next/headers'

/**
 * Wie is er ingelogd?
 *
 * De sessie leeft in de backend, niet hier. Deze helper vraagt het daar op en
 * stuurt de cookie van de bezoeker mee. Gebruik hem in server components.
 */
export const BACKEND_URL = process.env.BACKEND_URL ?? '{{BACKEND_URL}}'

export interface User {
    sub: string
    name?: string
    email?: string
    role?: string
}

export async function getUser(): Promise<User | null> {
    const cookieStore = await cookies()
    const cookie = cookieStore.toString()
    if (!cookie) return null

    try {
        const res = await fetch(`${BACKEND_URL}/auth/me`, {
            headers: { cookie },
            // Nooit cachen: dit hangt van de bezoeker af.
            cache: 'no-store'
        })
        if (!res.ok) return null
        const data = (await res.json()) as { user: User | null }
        return data.user
    } catch {
        // Backend niet bereikbaar -> behandel als niet ingelogd.
        return null
    }
}

/** De URL waar je op klikt om in te loggen. */
export function loginUrl(returnTo = '/'): string {
    return `${BACKEND_URL}/auth/start?returnTo=${encodeURIComponent(returnTo)}`
}

/** De URL om uit te loggen. */
export function logoutUrl(): string {
    return `${BACKEND_URL}/auth/logout`
}

/** Praat namens de bezoeker met de backend (bv. de beheer-endpoints). */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookieStore = await cookies()
    return fetch(`${BACKEND_URL}${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), cookie: cookieStore.toString() },
        cache: 'no-store'
    })
}
