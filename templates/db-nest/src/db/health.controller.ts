import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common'
import { DbService } from './db.service.js'
import { sql } from './sql.js'

interface Health {
    status: string
    database: string
}

/**
 * GET /health (en /api/health) - zegt of de app draait en of de database
 * bereikbaar is.
 *
 * Geeft 503 als de database wegvalt, zodat een loadbalancer of container-
 * orchestrator dit exemplaar uit de rotatie haalt. Een kale throw zou 500
 * geven, en dat betekent iets anders: "de app is stuk" in plaats van "de app
 * kan er even niet bij".
 */
// Twee paden, hetzelfde antwoord. In een gewone backend luistert Nest zelf op
// de publieke poort en is /health het gewone adres. In een hub-app staat Next
// ervoor, en die stuurt alleen /oidc, /auth en /api door - daar is /api/health
// het enige dat van buiten bestaat.
@Controller(['health', 'api/health'])
export class HealthController {
    constructor(private readonly database: DbService) {}

    @Get()
    async check(): Promise<Health> {
        try {
            await this.database.db.query(sql`select 1`)
            return { status: 'ok', database: 'postgres' }
        } catch (error) {
            throw new HttpException(
                {
                    status: 'degraded',
                    database: 'postgres',
                    error: error instanceof Error ? error.message : String(error)
                },
                HttpStatus.SERVICE_UNAVAILABLE
            )
        }
    }
}
