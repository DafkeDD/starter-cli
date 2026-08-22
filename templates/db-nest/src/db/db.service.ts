import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { connect } from './index.js'
import type { Db } from './types.js'

/**
 * Beheert de verbinding met de database gedurende de levensduur van de app.
 *
 * Gebruik:
 *
 *   constructor(private readonly database: DbService) {}
 *
 *   const users = await this.database.db.query(sql`select * from users`)
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DbService.name)
    private connection: (Db & { close(): Promise<void> }) | null = null

    async onModuleInit(): Promise<void> {
        this.connection = await connect()
        this.logger.log('Verbonden met de database (PostgreSQL)')
    }

    async onModuleDestroy(): Promise<void> {
        await this.connection?.close()
        this.connection = null
    }

    /** De database. Gooit als de module nog niet gestart is. */
    get db(): Db {
        if (!this.connection) {
            throw new Error(
                'De database is nog niet verbonden. Injecteer DbService en gebruik hem ' +
                    'pas nadat Nest de module heeft opgestart, niet in een constructor.'
            )
        }
        return this.connection
    }
}
