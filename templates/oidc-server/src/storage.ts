import fs from 'node:fs'
import path from 'node:path'

/**
 * Piepkleine JSON-opslag op schijf. In het echt vervang je dit door Postgres —
 * dit bestaat alleen zodat de proefopstelling een herstart overleeft.
 */
const DIR = path.join(process.cwd(), '.data')

function file(name: string): string {
    return path.join(DIR, `${name}.json`)
}

export function load<T>(name: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(file(name), 'utf8')) as T
    } catch {
        return fallback
    }
}

let pending: Record<string, NodeJS.Timeout> = {}

/** Schrijft weg, maar niet vaker dan één keer per 200 ms per bestand. */
export function save(name: string, data: unknown): void {
    clearTimeout(pending[name])
    pending[name] = setTimeout(() => {
        fs.mkdirSync(DIR, { recursive: true })
        fs.writeFileSync(file(name), JSON.stringify(data), 'utf8')
    }, 200)
}
