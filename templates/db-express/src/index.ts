// Leest .env in. Moet de eerste import blijven - zie src/env.ts.
import './env.js'

import express from 'express'
import { connect, sql } from './db/index.js'
import type { Db } from './db/types.js'

const app = express()

/** De backend draait ALTIJD op poort {{PORT}}. */
const PORT = {{PORT}}

app.use(express.json())

/** Wordt gevuld voor de server begint te luisteren. */
let db: Db

/**
 * GET /health - zegt of de app draait en of de database bereikbaar is.
 *
 * Geeft 503 als de database wegvalt, zodat een loadbalancer of container-
 * orchestrator dit exemplaar uit de rotatie haalt.
 */
app.get('/health', async (_req, res) => {
    try {
        await db.query(sql`select 1`)
        res.json({ status: 'ok', database: 'postgres' })
    } catch (error) {
        res.status(503).json({
            status: 'degraded',
            database: 'postgres',
            error: error instanceof Error ? error.message : String(error)
        })
    }
})

/**
 * Voorbeeld: alle gebruikers uit de tabel van migratie 001.
 * Verwijder dit gerust zodra je eigen routes er staan.
 */
app.get('/users', async (_req, res, next) => {
    try {
        const users = await db.query(sql`select id, email, name, active from users order by id`)
        res.json(users)
    } catch (error) {
        next(error)
    }
})

/**
 * Vangt alles op wat een route doorgeeft aan next(). Zonder dit stuurt Express
 * een HTML-pagina met de volledige stacktrace terug - niet wat je wil, zeker
 * niet in productie.
 */
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    res.status(500).json({
        error: 'Er ging iets mis',
        // In productie geef je de details niet prijs aan de buitenwereld.
        detail: process.env.NODE_ENV === 'production' ? undefined : message
    })
})

async function main(): Promise<void> {
    // Eerst verbinden, dan pas luisteren: anders krijgt het eerste verzoek een
    // halve applicatie te zien.
    db = await connect()
    console.log('Verbonden met de database')

    app.listen(PORT, () => {
        console.log(`Backend luistert op http://localhost:${PORT}`)
    })
}

main().catch((error: unknown) => {
    console.error('Opstarten mislukt:', error instanceof Error ? error.message : error)
    process.exit(1)
})
