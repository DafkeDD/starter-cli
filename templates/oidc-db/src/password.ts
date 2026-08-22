import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Wachtwoorden hashen met scrypt uit node:crypto. Geen bcryptjs, geen argon2:
 * scrypt zit in Node zelf en is een prima keuze voor wachtwoorden.
 *
 * Het opgeslagen formaat bevat de parameters, zodat je ze later kan verzwaren
 * zonder bestaande wachtwoorden ongeldig te maken:
 *
 *   scrypt$16384$8$1$<salt base64>$<hash base64>
 */

const scryptAsync = promisify(scrypt) as (
    password: string,
    salt: Buffer,
    keylen: number,
    options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

/** Kostparameters. Zwaarder = trager voor jou en voor een aanvaller. */
const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64

/** scrypt heeft ongeveer 128 * N * r bytes nodig; ruim nemen. */
const MAXMEM = 64 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16)
    // NFKC: anders geeft hetzelfde wachtwoord met een andere toetsenbordlayout
    // een andere hash.
    const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
        N,
        r: R,
        p: P,
        maxmem: MAXMEM
    })

    return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

/**
 * Controleert een wachtwoord tegen een opgeslagen hash.
 *
 * De vergelijking gebeurt met timingSafeEqual: een gewone === lekt via de tijd
 * die hij nodig heeft informatie over hoeveel tekens klopten.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false

    const [, n, r, p, saltEncoded, keyEncoded] = parts
    const salt = Buffer.from(saltEncoded!, 'base64')
    const expected = Buffer.from(keyEncoded!, 'base64')

    const key = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: MAXMEM
    })

    return key.length === expected.length && timingSafeEqual(key, expected)
}
