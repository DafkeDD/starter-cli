/**
 * Het registratietoken van deze hub tonen of vervangen.
 *
 *   npm run hub:token         laat zien welk token er nu geldt
 *   npm run hub:token:nieuw   zet er een nieuw in .env
 *
 * Dit token is geen eenmalige code: het is de vaste sleutel waarmee
 * `starter-cli` een nieuwe app bij deze hub aanmeldt. Elke app gebruikt
 * dezelfde. Vervang hem als hij ergens rondgeslingerd heeft - apps die al
 * aangemeld zijn merken daar niets van, want het token beveiligt alleen het
 * aanmelden zelf en niet het inloggen.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const SLEUTEL = 'HUB_REGISTRATION_TOKEN'
const BESTAND = path.join(process.cwd(), '.env')

const kleur = {
    cyaan: '\x1b[36m',
    geel: '\x1b[33m',
    dim: '\x1b[2m',
    uit: '\x1b[0m'
}

function lees(): string {
    if (!fs.existsSync(BESTAND)) return ''
    const regel = new RegExp(`^${SLEUTEL}=(.*)$`, 'm').exec(fs.readFileSync(BESTAND, 'utf8'))
    return (regel?.[1] ?? '').trim()
}

function schrijf(token: string): void {
    const bestaat = fs.existsSync(BESTAND)
    const inhoud = bestaat ? fs.readFileSync(BESTAND, 'utf8') : ''
    const regel = new RegExp(`^${SLEUTEL}=.*$`, 'm')

    if (regel.test(inhoud)) {
        fs.writeFileSync(BESTAND, inhoud.replace(regel, `${SLEUTEL}=${token}`), 'utf8')
        return
    }

    // Nog geen regel: erbij zetten, met de uitleg erboven zodat het bestand
    // zichzelf blijft verklaren.
    const blok =
        (inhoud.endsWith('\n') || inhoud === '' ? '' : '\n') +
        '\n# Waarmee starter-cli een nieuwe app bij deze hub aanmeldt. Geef dit\n' +
        '# door als je een volgend project aansluit. Leeg = aanmelden staat uit.\n' +
        `${SLEUTEL}=${token}\n`
    fs.writeFileSync(BESTAND, inhoud + blok, 'utf8')
}

const nieuw = process.argv.includes('--nieuw')

if (!fs.existsSync(BESTAND)) {
    console.error(`\nGeen .env gevonden in ${process.cwd()}.`)
    console.error('Draai dit vanuit de map van de hub.\n')
    process.exit(1)
}

if (nieuw) {
    const token = crypto.randomBytes(24).toString('hex')
    schrijf(token)
    console.log(`\n  ${kleur.dim}Nieuw registratietoken van deze hub${kleur.uit}`)
    console.log(`  ${kleur.cyaan}${token}${kleur.uit}\n`)
    console.log(`  ${kleur.geel}Herstart de hub${kleur.uit} - hij leest .env alleen bij het opstarten.`)
    console.log(`  ${kleur.dim}Al aangemelde apps blijven gewoon werken.${kleur.uit}\n`)
} else {
    const token = lees()
    if (!token) {
        console.log(`\n  ${kleur.geel}Er staat geen ${SLEUTEL} in .env.${kleur.uit}`)
        console.log(`  Aanmelden staat dus uit. Maak er een met:\n`)
        console.log(`      npm run hub:token:nieuw\n`)
        process.exit(0)
    }
    console.log(`\n  ${kleur.dim}Registratietoken van deze hub${kleur.uit}`)
    console.log(`  ${kleur.cyaan}${token}${kleur.uit}\n`)
    console.log(`  ${kleur.dim}Gebruik dit als starter-cli erom vraagt bij een volgende app.${kleur.uit}\n`)
}
