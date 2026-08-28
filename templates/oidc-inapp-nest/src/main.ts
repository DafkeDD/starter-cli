import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { NextFilter } from './next.filter.js'
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
 *     geregistreerd is, dus de hub-router moet erop staan voordat Nest tijdens
 *     init() zijn eigen routes ophangt.
 *
 *  3. Next als exception filter, niet als middleware achteraan. Nest zet bij
 *     init() een 404 achter je controllers; middleware daarna komt nooit aan
 *     de beurt en dan geeft hij {"message":"Cannot GET /_next/..."} terug -
 *     met een pagina zonder opmaak als resultaat.
 */
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
const server = app.getHttpAdapter().getInstance()

// Next opstarten (compileert in ontwikkeling; dat duurt even).
await screens.attach(server)

// De hub eerst: /oidc/auth, /oidc/token, /oidc/interaction/...
server.use(MOUNT || '/', router)

// En wat Nest niet kent, is een pagina van Next.
app.useGlobalFilters(new NextFilter())

await app.listen(PORT)
console.log(`OIDC-hub luistert op ${ISSUER}`)
