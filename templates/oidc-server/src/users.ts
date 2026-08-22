import bcrypt from 'bcryptjs'
import { load, save } from './storage.js'

/**
 * Gebruikersopslag. In het echt is dit Postgres; voor de proefopstelling
 * houden we het in het geheugen — herstart je de hub, dan ben je ze kwijt.
 *
 * De eerste geregistreerde gebruiker wordt admin. Dat is een demo-regel; in het
 * echt zet je de eerste admin via een seed of een migratie.
 */
export type Role = 'admin' | 'user'

export interface User {
    id: string
    email: string
    name: string
    role: Role
    blocked: boolean
    createdAt: string
    passwordHash: string
}

const users = new Map<string, User>(Object.entries(load<Record<string, User>>('users', {})))

function persist(): void {
    save('users', Object.fromEntries(users))
}

export async function all(): Promise<User[]> {
    return [...users.values()]
}

export async function findByEmail(email: string): Promise<User | undefined> {
    return [...users.values()].find(u => u.email === email.toLowerCase())
}

export async function findById(id: string): Promise<User | undefined> {
    return users.get(id)
}

export async function register(email: string, name: string, password: string): Promise<User> {
    if (await findByEmail(email)) throw new Error('Dit e-mailadres is al geregistreerd.')
    const id = `u${users.size + 1}`
    const user: User = {
        id,
        email: email.toLowerCase(),
        name,
        role: users.size === 0 ? 'admin' : 'user',
        blocked: false,
        createdAt: new Date().toISOString(),
        passwordHash: await bcrypt.hash(password, 10)
    }
    users.set(id, user)
    persist()
    return user
}

/** Geeft de gebruiker terug, of een reden waarom inloggen niet mag. */
export async function verify(email: string, password: string): Promise<{ user?: User; error?: string }> {
    const user = await findByEmail(email)
    if (!user) return { error: 'Onbekend e-mailadres of wachtwoord.' }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
        return { error: 'Onbekend e-mailadres of wachtwoord.' }
    }
    if (user.blocked) return { error: 'Dit account is geblokkeerd door een beheerder.' }
    return { user }
}

/** Blokkeert of deblokkeert een gebruiker. Een admin kan zichzelf niet blokkeren. */
export async function setBlocked(id: string, blocked: boolean): Promise<void> {
    const user = users.get(id)
    if (!user) return
    user.blocked = blocked
    persist()
}
