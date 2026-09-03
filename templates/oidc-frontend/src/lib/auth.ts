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

/**
 * De cookies van de bezoeker als Cookie-header.
 *
 * Bewust getAll() en niet cookieStore.toString(): die laatste geeft in Next 16
 * een lege string terug, waardoor getUser() altijd null teruggaf en je scherm
 * "je bent niet ingelogd" bleef tonen terwijl je sessie prima bestond.
 */
async function cookieHeader(): Promise<string> {
    const cookieStore = await cookies()
    return cookieStore
        .getAll()
        .map(c => `${c.name}=${c.value}`)
        .join('; ')
}

/**
 * Wie is er ingelogd?
 *
 * Drie uitkomsten, en dat verschil is belangrijk:
 *
 *   een User   ingelogd
 *   null       niet ingelogd - de backend zei 401
 *   'onbekend' de backend antwoordde niet
 *
 * Dat laatste apart houden, want anders laat elke hik van je backend iedereen
 * uitgelogd lijken: de schil verdwijnt, /admin stuurt je naar het inlogscherm,
 * en de gebruiker denkt dat hij eruit gegooid is terwijl hij gewoon moet
 * wachten.
 */
export type UserOfFout = User | null | 'onbekend'

export async function fetchUser(): Promise<UserOfFout> {
    const cookie = await cookieHeader()
    if (!cookie) return null

    try {
        const res = await fetch(`${BACKEND_URL}/auth/me`, {
            headers: { cookie },
            // Nooit cachen: dit hangt van de bezoeker af.
            cache: 'no-store',
            // Zonder deze grens laat een backend die blijft hangen ook elke
            // server-render van je pagina hangen.
            signal: AbortSignal.timeout(5000)
        })
        if (res.status === 401) return null
        if (!res.ok) return 'onbekend'
        const data = (await res.json()) as { user: User | null }
        return data.user
    } catch {
        return 'onbekend'
    }
}

/** Zoals fetchUser, maar "onbekend" telt als niet ingelogd. */
export async function getUser(): Promise<User | null> {
    const uitslag = await fetchUser()
    return uitslag === 'onbekend' ? null : uitslag
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
    // Via Headers en niet met een spread: init.headers mag ook een Headers-
    // object of een array van paren zijn, en die overleven een spread niet - je
    // content-type verdween dan stilletjes en de backend antwoordde 415.
    const headers = new Headers(init?.headers)
    headers.set('cookie', await cookieHeader())

    return fetch(`${BACKEND_URL}${path}`, {
        ...init,
        headers,
        cache: 'no-store'
    })
}
