import { Global, Module } from '@nestjs/common'
import { DbService } from './db.service.js'
import { HealthController } from './health.controller.js'

/**
 * Maakt de database in de hele applicatie beschikbaar.
 *
 * @Global betekent: je hoeft DbModule niet in elke module opnieuw te
 * importeren. Injecteer gewoon DbService waar je hem nodig hebt.
 */
@Global()
@Module({
    controllers: [HealthController],
    providers: [DbService],
    exports: [DbService]
})
export class DbModule {}
