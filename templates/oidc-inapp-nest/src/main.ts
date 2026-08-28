import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { ISSUER, MOUNT, PORT, router } from './hub.js'
import * as screens from './screens.js'

/**
 * De hub, met NestJS als server en Next.js voor de schermen - één proces.
 *
 * Drie dingen zitten hier bewust zo, en alle drie kosten ze een avond als je ze
 * mist:
 *
 *  1. bodyParser: false. Nest zet er standaard een aan, en oidc-provider
 *     waarschuwt terecht als de body al gelezen is voor hij erbij komt. De
 *     router van de hub parst zelf, alleen op de routes die het nodig hebben.
 *
 *  2. De volgorde. Express voert middleware uit in de volgorde waarin het
 *     geregistreerd is, en Nest hangt zijn eigen routes pas op tijdens init().
 *     Dus: hub-router, dan init(), dan pas Next als vangnet.
 *
 *  3. init() apart van listen(). Zou je meteen listen() doen, dan staat Next
 *     vóór je controllers en vangt hij ze allemaal af.
 */
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
const server = app.getHttpAdapter().getInstance()

// Next opstarten (compileert in ontwikkeling; dat duurt even).
await screens.attach(server)

// De hub eerst: /oidc/auth, /oidc/token, /oidc/interaction/...
server.use(MOUNT || '/', router)

// Dan de controllers van Nest.
await app.init()

// En als laatste alles wat overblijft: jouw schermen.
screens.fallback(server)

await app.listen(PORT)
console.log(`OIDC-hub luistert op ${ISSUER}`)
