import express from 'express'
import { ISSUER, MOUNT, PORT, router } from './hub.js'
import * as screens from './screens.js'

/**
 * Het opstartbestand van de hub.
 *
 * Bewust dun: alle routes zitten in hub.ts. Draait de hub als eigen server, dan
 * is MOUNT leeg en hangt hij op de wortel. Zit hij in je eigen app, dan is MOUNT
 * "/oidc" en houdt hij ruimte over voor je eigen schermen - die de schermlaag
 * er hieronder achter hangt. Dit bestand is voor beide gevallen hetzelfde.
 */
const app = express()

// Eerst de schermlaag: die mag routes hangen die vóór de hub komen.
await screens.attach(app)

// Express slikt geen leeg mountpad, vandaar de val terug op de wortel.
app.use(MOUNT || '/', router)

// En als laatste alles wat de hub niet kent.
screens.fallback(app)

app.listen(PORT, () => {
    console.log(`OIDC-hub luistert op ${ISSUER}`)
})
