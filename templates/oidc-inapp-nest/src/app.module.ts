import { Module } from '@nestjs/common'
import { AppController } from './app.controller.js'

/**
 * Hier hangt je eigen API.
 *
 * De hub zelf zit niet in deze module: die is een Express-router (src/hub.ts)
 * die in main.ts voor Nest wordt gehangen. Dat scheelt het herschrijven van
 * oidc-provider naar controllers, en het houdt identiteit en applicatie uit
 * elkaar - ook al draaien ze in hetzelfde proces.
 */
@Module({
    imports: [],
    controllers: [AppController],
    providers: []
})
export class AppModule {}
