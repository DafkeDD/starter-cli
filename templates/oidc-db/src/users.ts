import { sql, id } from './db/sql.js'
import { hashPassword, verifyPassword } from './password.js'
import type { Db } from './db/types.js'

/**
 * Gebruikers, nu in de database.
 *
 * Registreren gebeurt alleen hier, op de hub. De aangesloten applicaties tonen
 * wel een eigen loginscherm, maar sturen je voor het invullen van je wachtwoord
 * altijd naar de hub - anders zou elke applicatie je wachtwoord zien, en dat is
 * precies wat single sign-on moet voorkomen.
 *
 * De eerste geregistreerde gebruiker wordt admin. Handig om te starten; in
 * productie zet je de eerste admin liever met een seed of een migratie.
 */
export type Role = 'admin' | 'user'

export interface User {
    id: string
    email: string
    name: string
    role: Role
    blocked: boolean
    createdAt: string
}

interface UserRow {
    id: number | string
    email: string
    name: string
    role: string
    blocked: boolean
    password_hash: string
    created_at: Date | string
}

let db: Db | null = null

export function useDatabase(connection: Db): void {
    db = connection
}

function database(): Db {
    if (!db) throw new Error('Gebruikersopslag heeft nog geen database.')
    return db
}

/** Zet een rij om naar een User, zonder de wachtwoordhash. */
function toUser(row: UserRow): User {
    return {
        // PostgreSQL geeft bigint terug als string; consequent tekst maken.
        id: String(row.id),
        email: row.email,
        name: row.name,
        role: row.role === 'admin' ? 'admin' : 'user',
        blocked: row.blocked === true,
        createdAt: new Date(row.created_at).toISOString()
    }
}

export async function all(): Promise<User[]> {
    const rows = await database().query<UserRow>(
        sql`select * from ${id('users')} order by ${id('id')}`
    )
    return rows.map(toUser)
}

export async function findByEmail(email: string): Promise<User | null> {
    const row = await database().one<UserRow>(
        sql`select * from ${id('users')} where ${id('email')} = ${email.toLowerCase()}`
    )
    return row ? toUser(row) : null
}

export async function findById(userId: string): Promise<User | null> {
    const row = await database().one<UserRow>(
        sql`select * from ${id('users')} where ${id('id')} = ${userId}`
    )
    return row ? toUser(row) : null
}

export async function count(): Promise<number> {
    const row = await database().only<{ aantal: number | string }>(
        sql`select count(*) as ${id('aantal')} from ${id('users')}`
    )
    return Number(row.aantal)
}

export async function register(email: string, name: string, password: string): Promise<User> {
    if (await findByEmail(email)) {
        throw new Error('Dit e-mailadres is al geregistreerd.')
    }

    const row = await database().insert<UserRow>('users', {
        email: email.toLowerCase(),
        name,
        password_hash: await hashPassword(password),
        // De allereerste gebruiker wordt beheerder.
        role: (await count()) === 0 ? 'admin' : 'user',
        blocked: false
    })

    return toUser(row)
}

/** Geeft de gebruiker terug, of een reden waarom inloggen niet mag. */
export async function verify(
    email: string,
    password: string
): Promise<{ user?: User; error?: string }> {
    const row = await database().one<UserRow>(
        sql`select * from ${id('users')} where ${id('email')} = ${email.toLowerCase()}`
    )

    if (!row) {
        // Toch de hash-berekening draaien, zodat een onbestaand e-mailadres
        // niet merkbaar sneller antwoordt dan een verkeerd wachtwoord.
        await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA')
        return { error: 'Onbekend e-mailadres of verkeerd wachtwoord.' }
    }

    if (!(await verifyPassword(password, row.password_hash))) {
        return { error: 'Onbekend e-mailadres of verkeerd wachtwoord.' }
    }

    const user = toUser(row)
    if (user.blocked) {
        return { error: 'Deze account is geblokkeerd. Neem contact op met de beheerder.' }
    }

    return { user }
}

export async function setBlocked(userId: string, blocked: boolean): Promise<void> {
    await database().execute(
        sql`update ${id('users')} set ${id('blocked')} = ${blocked}, ${id('updated_at')} = ${new Date()}
            where ${id('id')} = ${userId}`
    )
}

export async function setRole(userId: string, role: Role): Promise<void> {
    await database().execute(
        sql`update ${id('users')} set ${id('role')} = ${role}, ${id('updated_at')} = ${new Date()}
            where ${id('id')} = ${userId}`
    )
}
