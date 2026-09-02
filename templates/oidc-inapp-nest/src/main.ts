import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { ISSUER, MOUNT, PORT, router } from './hub.js'

/**
 * De hub met NestJS, achter de Next-app.
 *
 * Next staat vooraan op de publieke poort en stuurt {{MOUNT}}/... hierheen (zie
 * next.config.ts). Dit proces luistert dus intern; je browser komt er nooit
 * rechtstreeks op uit.
 *
 * Twee dingen zitten hier bewust zo:
 *
 *  1. bodyParser: false. Nest zet er standaard een aan, en oidc-provider
 *     waarschuwt terecht als de body al gelezen is voor hij erbij komt. De
 *     router van de hub parst zelf, alleen op de routes die het nodig hebben.
 *
 *  2. De hub-router vóór listen(). Express voert middleware uit in de volgorde
 *     waarin het geregistreerd is, en Nest hangt zijn eigen routes pas op
 *     tijdens init(). Zo komt de hub eerst en je eigen API daarna.
 */
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
const server = app.getHttpAdapter().getInstance()

// Express slikt geen leeg mountpad, vandaar de val terug op de wortel.
server.use(MOUNT || '/', router)

await app.listen(PORT)
console.log(`OIDC-hub luistert op ${ISSUER}`)
