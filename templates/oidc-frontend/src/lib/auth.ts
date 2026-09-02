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

export async function getUser(): Promise<User | null> {
    const cookie = await cookieHeader()
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
    return fetch(`${BACKEND_URL}${path}`, {
        ...init,
        headers: { ...(init?.headers ?? {}), cookie: await cookieHeader() },
        cache: 'no-store'
    })
}
