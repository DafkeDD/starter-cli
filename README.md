# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

Op dit moment zijn er zeven vragen:

1. **Welke frontend?** — Next.js (altijd de laatste versie, via
   `create-next-app@latest`) of geen. Komt in `frontend/`, met TypeScript,
   Tailwind CSS, ESLint, **next-intl**, **light/dark mode** en **Prettier**.
2. **Custom UI installeren?** — kopieert de 68 componenten van
   `github:DafkeDD/projectx-ui` als broncode in de frontend, en neemt de design
   tokens over in `globals.css`. Zo ziet elke app er hetzelfde uit.
3. **Welke backend?** — Node.js + Express, NestJS of geen. Komt in `backend/`,
   in TypeScript, **altijd op poort 5000**, ook met **Prettier**.
4. **Welke database voor de backend?** — PostgreSQL of geen. Eigen datalaag,
   geen ORM.
5. **OIDC / SSO?** — een nieuwe OIDC-server opzetten (deze app wordt de hub),
   aansluiten op een bestaande, of niets.
6. **Welke database voor de OIDC-hub?** — alleen bij een nieuwe hub. Mag een
   aparte database zijn, los van die van de backend.
7. **GitHub gebruiken?** — bij ja vraagt hij de projectnaam, en maakt hij een
   repo met die naam aan en pusht meteen.

`frontend/` en `backend/` krijgen exact dezelfde Prettier-instellingen.

```bash
mkdir mijn-project
cd mijn-project
npx github:DafkeDD/starter-cli
```

---

## Harde regels

Deze liggen vast en zijn bewust geen vraag in de CLI:

1. **next-intl, altijd** — 4 talen (`en`, `de`, `nl`, `fr`), standaard Engels,
   en de taal staat nooit in de URL.
2. **UI-componenten worden altijd zelf gebouwd** — niets uit shadcn/ui, Radix,
   MUI, Chakra, Ant Design, HeadlessUI, DaisyUI of NextUI. Iconen uitsluitend
   uit `react-icons`, nooit `lucide-react`.
3. **Geen ORM** - de datalaag is zelf geschreven: de kale `pg`-driver met een
   dunne eigen laag erboven. Geen Prisma, TypeORM of Drizzle.
4. **Light/dark mode, altijd** — class-based, voorkeur in een cookie, met een
   toggle in de UI.
5. **De poort komt uit `PORT` in `.env`**, met een terugval in de code —
   standaard 5000 voor de backend. Draait er al een ander project, dan kiest de
   CLI bij het scaffolden 5001. Zo werkt hetzelfde project ook in Docker.

Ze worden ook in het gegenereerde project vastgelegd, in `PROJECT-RULES.md` en
als `project-rules`-blok in `AGENTS.md` — die Claude Code automatisch meeleest
via `CLAUDE.md` → `@AGENTS.md`.

---

## Wat er in `frontend/` komt

```
frontend/
├─ AGENTS.md                     # bevat het project-rules blok
├─ PROJECT-RULES.md              # i18n + UI + theme regels, volledig
├─ next.config.ts                # next-intl plugin + redirect-vangnet
├─ .prettierrc / .prettierignore
├─ messages/
│  ├─ en.json  de.json  nl.json  fr.json
└─ src/
   ├─ proxy.ts                   # next-intl middleware (Next 16-naam)
   ├─ i18n/
   │  ├─ routing.ts              # locales + defaultLocale + localePrefix
   │  ├─ navigation.ts           # Link, useRouter, redirect, usePathname
   │  └─ request.ts              # laadt messages server-side
   ├─ app/
   │  ├─ globals.css             # design tokens light + dark
   │  └─ [locale]/
   │     ├─ layout.tsx           # locale + theme uit cookie, providers
   │     └─ page.tsx             # demo met taalkiezer en theme-toggle
   └─ components/
      ├─ LocaleSwitcher.tsx
      └─ theme/
         ├─ ThemeProvider.tsx
         └─ ThemeToggle.tsx
```

`create-next-app` draait met `--disable-git`, dus `frontend/` krijgt géén eigen
`.git`. Anders zou het een genest repo worden en committeert je frontend niet
mee in de projectrepo.

---

## Database

De vraag komt twee keer: een keer voor de backend, een keer voor de OIDC-hub.
Die twee mogen op een aparte database draaien.

**PostgreSQL**, en alleen PostgreSQL. Geen ORM - de laag is zelf geschreven, met
de officiele `pg`-driver eronder. Doordat er maar een database is, is er ook geen
dialect-abstractie nodig: de SQL in je migraties is de SQL die echt draait.

```
src/db/
  types.ts        Db-interface, DbConfig, ColumnSpec
  sql.ts          de sql``-tag, id(), raw(), list(), join(), quote()
  index.ts        connect(), readConfig(), en de Db zelf
  schema.ts       TableBuilder voor de migraties
  migrate.ts      de migratieloper (up / down / status)
  migrations/     001_init.ts
```

Zes bestanden, een dependency (`pg`). Wil je er later een tweede database bij,
dan is `Db` in `types.ts` het aangrijpingspunt: je schrijft een tweede
implementatie en de rest van je code blijft ongewijzigd.

### Queries

```ts
import { connect, sql, id, list } from './db/index.js'

const db = await connect()

// Alles met ${...} wordt een parameter, nooit tekst in de query.
// SQL-injectie is daarmee uitgesloten, ook als de waarde van een gebruiker komt.
const user = await db.one(sql`select * from users where email = ${email}`)

// Tabel- en kolomnamen via id(): die worden gequote.
const rows = await db.query(sql`select * from ${id('users')} where ${id('id')} in ${list([1, 2, 3])}`)

// insert geeft de volledige nieuwe rij terug, via RETURNING.
const nieuw = await db.insert('users', { email, password_hash: hash })

await db.transaction(async tx => {
    await tx.execute(sql`update users set name = ${naam} where id = ${userId}`)
})
```

`one()` gooit als er meer dan een rij terugkomt, `only()` gooit ook als er geen
is. Zo merk je een verkeerde where meteen, in plaats van stilletjes de eerste
rij te krijgen.

### Migraties

```ts
export async function up(s: Schema): Promise<void> {
    await s.createTable('users', t => {
        t.id()                          // bigserial primary key
        t.string('email', 255).unique() // varchar(255) not null + unique constraint
        t.bool('active').default(true)  // boolean not null default true
        t.timestamps()                  // created_at + updated_at, timestamptz default now()
    })
}

export async function down(s: Schema): Promise<void> {
    await s.dropTable('users')
}
```

Past iets niet in de bouwer - een view, een trigger, een index met een `where` -
dan schrijf je het met `s.raw('...')` als gewone SQL.

```
npm run db:migrate           openstaande migraties uitvoeren
npm run db:migrate:status    tonen wat er open staat
npm run db:rollback          de laatste terugdraaien
```

Na een build wijs je naar de gecompileerde map:

```
DB_MIGRATIONS_DIR=dist/db/migrations node dist/db/migrate.js up
```

De naam in `_migrations` is de bestandsnaam **zonder** extensie, zodat
ontwikkeling (`001_init.ts`) en productie (`001_init.js`) dezelfde migratie zien.

PostgreSQL doet ook DDL binnen een transactie: mislukt een migratie halverwege,
dan is er niets gebeurd.

### Lokaal draaien

Een commando:

```
cd backend
npm run db:up
```

Dat start de database, wacht tot hij **echt** klaar is, en migreert dan pas.

Waarom dat niet twee commando's zijn: `docker compose up -d` geeft de prompt
terug zodra de container *gestart* is, niet als PostgreSQL klaar is om te
antwoorden. Migreer je meteen daarna, dan krijg je
`Connection terminated unexpectedly` - de database accepteert je verbinding al
terwijl hij nog initialiseert, en verbreekt hem weer. De `--wait` in het script
lost dat op, en `start_period` in de healthcheck zorgt dat een trage eerste
start (initdb plus het aanmaken van de databases) niet als mislukt geldt.

Er is nog een tweede vangnet: `connect()` probeert het tien keer met een
seconde ertussen, met een melding per poging. Start je de database dus met de
hand zonder `--wait`, dan wacht de migratie alsnog tot hij er klaar voor is.

De andere scripts:

```
npm run db:migrate           openstaande migraties uitvoeren
npm run db:migrate:status    tonen wat er open staat
npm run db:rollback          de laatste terugdraaien
npm run db:reset             ALLES wissen en opnieuw opbouwen
```

Er is een `docker-compose.yml`, in de hoofdmap van het project. Wil je alleen de
database en de apps met npm draaien, dan is `npm run db:up` genoeg - dat start
enkel de `db`-service. Wil je alles in containers, zie de sectie Docker.

`.env` krijgt een gegenereerd wachtwoord. `.env` staat in `.gitignore`,
`.env.example` niet. Schrijven meerdere stappen in dezelfde `.env` - de database
en daarna de OIDC-client - dan worden de sleutels samengevoegd, niet overschreven.

### Twee dingen om te weten

1. **PostgreSQL geeft `bigint` terug als string**, niet als number - anders zou
   je boven 2^53 precisie verliezen. Je `id` komt dus binnen als `"1"`.
2. **De pool vangt zijn eigen verbindingsfouten op.** Gaat de database onderuit
   terwijl er verbindingen inactief staan, dan stuurt `pg` een `error`-event; zonder
   luisteraar stopt Node het hele proces. Die luisteraar staat in `connect()`, dus
   je server blijft draaien en verbindt vanzelf opnieuw.

### Wat er getest is

Tegen een echte PostgreSQL 16, met Express en met NestJS:

- migraties `up`, `down` en `status`, in ontwikkeling en na een build
- insert met `returning`, `one()`, `only()`, `in (...)`, lege `in`-lijst, paginatie
- transactie met commit en met rollback na een fout
- unieke sleutels, foreign keys, `addColumn` / `dropColumn`
- een injectiepoging (`' or 1=1 --` levert 0 rijen)
- `/health` gaat naar 503 als de database wegvalt, terug naar 200 zodra hij er
  weer is, en het proces blijft in beide gevallen leven

---

## Poorten en meerdere projecten

De poort van een gegenereerde app komt uit `PORT` in `.env`, met een terugval in
de code. De CLI kiest de waarde bij het scaffolden.

Maar draai je twee projecten naast elkaar, dan botsen ze: de backend valt om met
`EADDRINUSE`, en `docker compose up` weigert de database omdat de poort al bezet
is. Next.js schuift zelf op naar 3001, maar dan wijzen `FRONTEND_URL` en de
`post_logout_redirect_uris` van de hub nog naar 3000 en breekt je uitlog-redirect.

Daarom kiest de CLI de poorten **bij het scaffolden** en zet die vast in de code:

| | eerste project | tweede project |
|---|---|---|
| frontend | 3000 | 3001 |
| backend | 5000 | 5001 |
| database backend | 5432 | 5434 |

**De OIDC-hub is de uitzondering.** Die draait er maar een, gedeeld door al je
apps, en blijft dus gewoon op 9000. Een project claimt alleen een hub-poort als
het zelf een nieuwe hub opzet; kies je "aansluiten op een bestaande", dan
reserveert het niets - anders zou het volgende project 9001 krijgen voor een hub
die helemaal niet bestaat.

```
project A  nieuwe hub        frontend 3000  backend 5000  db 5432  hub 9000  hub-db 5433
project B  sluit aan op A    frontend 3001  backend 5001  db 5434
project C  sluit aan op A    frontend 3002  backend 5002  db 5435
```

Dat werkt in beide volgordes: zet je eerst twee aansluitende projecten op en
daarna pas de hub, dan krijgt die hub nog steeds 9000.

Alle afgeleide URL's worden meteen kloppend gegenereerd: `OIDC_REDIRECT_URI`,
`OIDC_ISSUER`, `FRONTEND_URL`, `BACKEND_URL`, de CORS-instelling en de
`redirect_uris` in `clients.ts`. De frontend krijgt `next dev -p <poort>` in
zijn dev-script - Next.js leest `PORT` namelijk alleen als echte
omgevingsvariabele en niet uit een `.env`-bestand.

### Hoe de keuze tot stand komt

Alleen kijken of een poort nu vrij is, is niet genoeg. De CLI kijkt daarom naar
drie dingen:

1. **Kan hij de poort zelf openen?** Het gewone geval.
2. **Antwoordt er iets als hij verbindt?** Vangt het geval waarin iets anders al
   luistert maar het openen tóch lukt - dat kan bij poorten die Docker Desktop
   doorgeeft, want die worden anders vastgehouden dan door een gewoon proces.
3. **Wat heeft Docker al opgeeist?** Via `docker inspect` op alle containers,
   ook de **gestopte**. Dat laatste is essentieel: de gegenereerde compose
   gebruikt `restart: unless-stopped`, dus zo'n container komt vanzelf terug
   zodra Docker Desktop start. Stond hij even uit toen je scaffoldde, dan leek
   de poort vrij en botste je er later alsnog op met
   `Bind for 0.0.0.0:5432 failed: port is already allocated`.

Daarbovenop houdt de CLI bij wat hij eerder heeft uitgedeeld, in
`~/.starter-cli/ports.json` - en alleen de poorten die een project echt gebruikt
komen daarin terecht. Heb je geen Docker, dan valt stap 3 gewoon weg.

Drie gedragingen die daaruit volgen:

- **Dezelfde map opnieuw scaffolden houdt dezelfde poorten.** Anders zouden de
  URL's in `.env` en in de OIDC-client niet meer kloppen.
- **Een project dat je verwijdert geeft zijn poorten terug**, zodat de nummers
  niet eindeloos oplopen.
- **Kan de CLI het bestand niet schrijven** - geen rechten in je thuismap - dan
  stopt hij niet; hij onthoudt het dan alleen niet tussen projecten door.

Wil je andere startwaarden, pas dan `DEFAULT_PORTS` aan in `src/utils/ports.ts`.

### Wat er getest is

Twee volledige projecten naast elkaar: vier apps tegelijk (twee backends, twee
hubs) op 5001, 5002, 9000 en 9001, elk met een eigen database. Beide
OIDC-flows compleet doorlopen - registreren, code inwisselen, `/me` - waarbij
elke hub keurig naar zijn eigen backend terugstuurt. Plus het opnieuw scaffolden
van een bestaande map (poorten blijven gelijk) en het vrijgeven van poorten van
een verwijderd project. En het hub-scenario in beide volgordes: aansluitende
projecten claimen geen 9000, en een hub die later wordt opgezet krijgt hem
alsnog.

---

## Docker

Naast de npm-manier komt er een Dockerfile per app en een `docker-compose.yml`
in de hoofdmap. Beide manieren blijven werken; Docker is een tweede manier om
hetzelfde project te draaien, geen vervanging.

```
docker compose up -d --build --wait
docker compose exec backend npm run db:migrate
docker compose exec oidc npm run db:migrate
```

Stoppen met `docker compose down`, alles wissen met `docker compose down -v`.

### De valkuil die dit oplost: de OIDC-issuer

De issuer van een OIDC-server moet voor **iedereen** dezelfde URL zijn. Je
browser praat met de hub, en je backend praat er server-to-server mee. Gebruiken
die twee een andere naam, dan komt de `iss` in het id_token niet overeen met wat
de client verwacht en faalt de validatie - met een foutmelding die nergens naar
wijst.

- `localhost` werkt niet: binnen een container wijst dat naar de container zelf.
- De servicenaam `oidc` werkt niet: die kent je browser niet.

Daarom draait de hub op **`oidc.localhost`**. Browsers lossen elke naam die op
`.localhost` eindigt zelf op naar 127.0.0.1 (RFC 6761), en binnen het
compose-netwerk verwijst een alias die naam naar de hub-container. Dezelfde URL
aan beide kanten, dus de validatie klopt.

`oidc-provider` bouwt zijn endpoints op basis van de host waarmee je binnenkomt,
maar houdt de issuer vast. Je browser krijgt dus `http://localhost:9000/auth` en
je backend `http://oidc.localhost:9000/auth`, met in beide gevallen dezelfde
issuer. Precies wat je wil.

### Twee databases uit een postgres-image

Het `postgres`-image maakt maar een database aan. De hub heeft een eigen
database, dus `docker/init-oidc-db.sh` maakt er bij de eerste start een tweede
bij. Zonder dat script start de hub niet op: `database "oidc" does not exist`.

Dat script draait alleen als het volume nog leeg is. Bestaat de database al, dan
gebeurt er niets.

### PORT komt uit .env

De poort van een app komt uit `PORT` in `.env`, met een terugval in de code.
Binnen Docker zet compose die variabele, buiten Docker leest de app zijn `.env`.
Een app, twee manieren van draaien, geen aparte code.

**Uitzondering: de frontend.** Next.js leest `PORT` alleen als echte
omgevingsvariabele, *niet* uit een `.env`-bestand - dat is uitgeprobeerd. Daarom
staat de poort van de frontend in `package.json` als `next dev -p <poort>`, met
dezelfde waarde die compose meegeeft.

### Wat er getest is

Dit is echt gedraaid, niet alleen geschreven:

- `docker compose up -d` vanaf een leeg volume: database gezond, hub en backend
  op, tweede database automatisch aangemaakt
- migraties uitgevoerd van binnen de containers
- discovery vanuit de backend-container naar `oidc.localhost` met kloppende
  issuer-validatie door `openid-client`
- de volledige SSO-flow van buitenaf: backend -> hub -> registreren -> terug naar
  de callback -> `/auth/me` geeft de ingelogde gebruiker

Een kanttekening bij die tests: Docker Hub is in mijn omgeving geblokkeerd, dus
ik heb `node:22-alpine` en `postgres:17-alpine` vervangen door images die ik
lokaal heb samengesteld uit dezelfde Node- en PostgreSQL-versies. De bedrading -
netwerk, servicenamen, poorten, issuer, initscript, migraties - is dus met echte
containers getest; wat ik niet heb kunnen testen is het binnenhalen van die twee
officiele images en de `npm install` die daarin gebeurt.

---

## OIDC-hub op een database

Kies je een database voor de hub, dan verandert er meer dan de opslag:

- De waarschuwing `a quick start development-only in-memory adapter is used`
  verdwijnt. Sessies en tokens overleven een herstart, en twee exemplaren van de
  hub achter een loadbalancer delen dezelfde staat.
- Wachtwoorden worden gehasht met **scrypt uit `node:crypto`** in plaats van
  `bcryptjs`. Een dependency minder.
- Verlopen rijen worden bij het opstarten en daarna elk uur opgeruimd.

Drie tabellen: `oidc_payloads` (alles wat oidc-provider bewaart, met `type` als
onderscheid), `users` en `clients`.

Getest tegen PostgreSQL: registreren, de volledige authorization-code-flow met
PKCE, inloggen met een fout wachtwoord, een geblokkeerd account, een code die
maar een keer werkt, en het opruimen van verlopen rijen.

`index.ts` weet niet waar de gegevens staan. Beide varianten van `adapter.ts`
exporteren dezelfde twee namen - `StorageAdapter` en `initStorage()` - dus het
verschil zit volledig in dat ene bestand.

---

## Custom UI

De vraag **"Wil je onze custom UI installeren?"** komt meteen na de
frontend-vraag, en alleen als er een frontend is.

`projectx-ui` is **geen runtime-dependency**. Het is een monorepo met een
registry, net zoals de shadcn-CLI: de componenten worden als **broncode** in je
project gekopieerd, zodat je ze per app kan aanpassen zonder een fork.

Bij ja gebeurt dit:

1. `github:DafkeDD/projectx-ui` komt als **devDependency** in `frontend/` — enkel
   om later opnieuw `add` te kunnen draaien.
2. `frontend/projectx-ui.json` wordt geschreven met onze paden.
3. `projectx-ui init` kopieert de design tokens, de basislaag en de hulpfuncties.
4. `projectx-ui add --all` kopieert alle 68 componenten.
5. `frontend/src/app/globals.css` wordt **overschreven** door de variant die de
   tokens van de custom UI gebruikt.

Resultaat in `frontend/`:

```
projectx-ui.json              # config van de projectx-ui CLI
src/components/ui/
  ui.css                      # verzamelbestand, importeert alle component-CSS
  tokens.css                  # alle kleuren, radius, typografie
  base.css                    # body, typografie, scrollbars
  button.tsx  button.css      # 68 componenten, elk .tsx + .css
  ...
src/app/globals.css           # importeert ui.css + koppelt Tailwind aan de tokens
```

Importeren doe je per component:

```tsx
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
```

De componenten hebben **nul externe dependencies** — alleen `react` en
`react-dom`. Geen shadcn, geen Radix, precies zoals de projectregel voorschrijft.

### Hoe zie je dat globals.css echt overgenomen is?

Zonder custom UI staat er `--primary: 160 84% 39%` (groen, HSL) in
`globals.css`. Mét custom UI staat er bovenaan:

```css
@import 'tailwindcss';
@import '../components/ui/ui.css';
```

en verderop een `@theme inline` die naar `var(--bg)`, `var(--accent)`,
`var(--surface)` wijst in plaats van naar HSL-waarden. Snel te controleren:

```
findstr /C:"components/ui/ui.css" frontend\src\app\globals.css
```

De accentkleur wordt teal (`#0d9488` in light, `#2dd4bf` in dark).

### Light/dark blijft werken

projectx-ui schakelt met `[data-theme]` op `<html>`, de CLI gebruikt daarnaast de
class `.dark` / `.theme-system` voor Tailwind's `dark:`-utilities. De layout zet
**allebei**, dus ze schakelen samen om:

```html
<html lang="en" class="dark" data-theme="dark">   <!-- cookie theme=dark -->
<html lang="en" data-theme="light">               <!-- cookie theme=light -->
<html lang="en" class="theme-system">             <!-- system: CSS kijkt zelf -->
```

### Bijwerken

Nieuwe versie van de componenten ophalen:

```
cd frontend
npm install --save-dev github:DafkeDD/projectx-ui
npx projectx-ui add --all --force
```

Zonder `--force` blijven jouw aanpassingen staan en krijg je per bestand een
melding dat het al bestaat.

### Als het misloopt

Lukt het niet - geen netwerk, repo verplaatst - dan **stopt de CLI niet**. Je
krijgt een waarschuwing met de commando's om het later alsnog te doen, en de
rest van je project is gewoon af:

```
!  Custom UI installeren is niet gelukt: ... (exit code 128).
   De frontend houdt zijn eigen tokens en componenten — verder werkt alles.
   Later alsnog:
     cd frontend && npm install --save-dev github:DafkeDD/projectx-ui
     npx projectx-ui init --yes && npx projectx-ui add --all
```

De repo staat als `UI_PACKAGE` bovenaan `src/steps/ui.ts` - daar wijzig je hem.

---

## Backend

| | |
|---|---|
| Locatie | `backend/` |
| Poort | **altijd 5000** — hard gezet, geen `PORT`-env-override |
| Taal | TypeScript |
| Prettier | zelfde projectsettings als de frontend, zonder de tailwind-plugin |

### Node.js + Express

Een minimale, expliciete setup — geen generator, dus geen ballast:

```
backend/
├─ .gitignore
├─ .prettierrc / .prettierignore
├─ package.json          # dev (tsx watch), build (tsc), start
├─ tsconfig.json
└─ src/index.ts          # express-app met GET /health
```

```bash
cd backend
npm run dev              # http://localhost:5000/health -> {"status":"ok"}
```

### NestJS

Gegenereerd met `@nestjs/cli@latest new --strict --skip-git`, daarna aangepast:

- `src/main.ts` luistert op `5000` in plaats van 3000
- de meegeleverde `.prettierrc` van Nest wordt vervangen door de onze
- er wordt een `.gitignore` toegevoegd (die maakt Nest niet aan bij `--skip-git`)

```bash
cd backend
npm run start:dev        # http://localhost:5000
```

---

## OIDC / SSO

```
OIDC / SSO?
  - Nieuwe OIDC-server        -> ./oidc op poort 9000
  - Aansluiten op bestaande   -> vraagt de issuer-URL
  - Geen

(alleen bij aansluiten)  Is dit project het beheerpaneel?
  - Nee, gewone app
  - Ja, dit is het beheerpaneel
```

### Nieuwe OIDC-server

Komt in `oidc/` op poort 9000 en draait op
[`oidc-provider`](https://github.com/panva/node-oidc-provider):

```
oidc/
|- package.json
`- src/
   |- index.ts      # provider, login/registratie-routes, admin-API
   |- clients.ts    # aangesloten apps + hun branding
   |- users.ts      # gebruikers, rollen, blokkeren
   |- views.ts      # login- en registratieschermen
   |- adapter.ts    # opslag van sessies, grants en tokens
   |- storage.ts    # JSON-bestanden in .data/ (vervang door Postgres)
   `- keys.ts       # ondertekeningssleutels, een keer aangemaakt
```

Het project zelf wordt meteen als eerste client geregistreerd, met een
gegenereerd `client_secret`. De eerste gebruiker die zich registreert wordt
admin.

**Het loginscherm past zich aan de app aan.** De hub leest de `client_id` uit de
authorization request en toont naam, kleur en tagline van die app. Zo heeft elke
app zijn eigen look, terwijl het wachtwoord alleen bij de hub komt.

### De client-kant in de backend

Bij **beide** keuzes (nieuwe server of aansluiten) wordt je backend een
OIDC-client. Wat erbij komt:

```
backend/
|- .env / .env.example   # issuer, client_id, client_secret, session_secret
|- src/env.ts            # leest .env in, eerste import in index.ts
`- src/auth/
   |- oidc.ts            # verbinding met de hub, lui opgezet
   |- routes.ts          # /auth/start, /auth/callback, /auth/me, /auth/logout
   |- require-auth.ts    # requireAuth en requireAdmin middleware
   `- admin.ts           # beheer-endpoints (leeg als dit geen beheerpaneel is)
```

Bij NestJS wordt dat een `AuthModule` met `auth.controller.ts`,
`auth.service.ts` en `admin.controller.ts` in plaats van losse Express-routes.
De code past zich dus aan je backend-keuze aan.

| endpoint | doet |
|---|---|
| `GET /auth/start` | stuurt door naar de hub, met PKCE |
| `GET /auth/callback` | wisselt de code in, haalt het profiel op, zet de sessie |
| `GET /auth/me` | wie ben ik - de frontend gebruikt dit |
| `GET /auth/logout` | wist de sessie van deze app |

Drie dingen die bewust zo zijn:

1. **Het access token blijft server-side.** `/auth/me` geeft naam, e-mail en rol
   terug, nooit het token.
2. **De discovery gebeurt lui**, pas bij de eerste login. Je backend start dus
   ook als de hub even niet draait, met een nette foutmelding in plaats van een
   crash.
3. **De `.env` wordt echt ingelezen** via `process.loadEnvFile()` in
   `src/env.ts`, dat als eerste import binnenkomt. Geen `dotenv`-package, en
   geen vlaggen in de npm-scripts - die vragen quotes, en cmd quote anders dan
   bash.

Is dit project het beheerpaneel, dan komen daar `/api/admin/users`,
`/api/admin/clients` en `/api/admin/users/:id/blocked` bij. Die praten met de
admin-API van de hub namens de ingelogde beheerder. De hub controleert de rol
daarna nog eens zelf - de autorisatie zit dus niet alleen in de backend.

### De frontend

Bij **beide** keuzes komt er ook een loginpagina in de frontend, in jouw stijl:

```
frontend/
|- .env.local                        # BACKEND_URL + NEXT_PUBLIC_BACKEND_URL
`- src/
   |- proxy.ts                       # krijgt er een auth-check bij
   |- lib/auth.ts                    # getUser(), loginUrl(), backendFetch()
   |- app/[locale]/login/page.tsx    # jouw eigen loginpagina
   `- components/auth/UserBadge.tsx  # wie is ingelogd + uitloggen
```

Is dit project het beheerpaneel, dan komt daar `app/[locale]/admin/page.tsx` en
`components/admin/UserTable.tsx` bij: gebruikers, aangesloten apps, en knoppen om
te blokkeren.

Alles volgt de harde regels: **vertaald in vier talen**, **design tokens** (dus
dark mode werkt), en **zelf gebouwde componenten**.

**Op de loginpagina staat geen wachtwoordveld.** Er staat een knop die naar de
OIDC-server gaat. Dat is precies wat SSO mogelijk maakt: het wachtwoord komt
alleen bij de hub, en ben je daar al ingelogd via een andere app, dan kom je
meteen binnen.

De auth-check in `proxy.ts` kijkt alleen of er een sessiecookie is. Bewust geen
call naar de backend, want middleware draait bij elk request. De echte controle
gebeurt server-side in de pagina en nog eens in de backend - een cookie bewijst
niets.

### Aansluiten op een bestaande server

De CLI vraagt de issuer-URL en of dit project het beheerpaneel is. Dat
beheerpaneel is namelijk gewoon een client-app zoals elke andere, alleen met een
rol-check erbij.

---

## GitHub

Zeg je ja op vraag 5, dan vraagt de CLI hoe je het project wil noemen. Die naam
wordt **ook de naam van de repo** op GitHub. Daarna vraagt hij nog of de repo
privé (standaard) of openbaar moet zijn.

Wat er dan gebeurt:

1. Een root-`.gitignore` en root-`README.md` (met de projectnaam) worden
   aangemaakt, als ze nog niet bestaan.
2. `.git`-mappen in submappen worden verwijderd — anders committeert git die
   als lege "embedded repository" en mist je code.
3. `git init`, `git add .`, commit op branch `main`. Heeft git nog geen
   `user.name`/`user.email`, dan wordt er een fallback-identiteit gebruikt voor
   die ene commit.
4. Een bestaande `origin` wordt verwijderd, zodat stap 5 niet faalt.
5. `gh repo create <projectnaam> --private --source=. --remote=origin --push`

Hiervoor heb je de [GitHub CLI](https://cli.github.com) nodig, ingelogd met
`gh auth login`. Ontbreekt die, dan slaat de CLI het pushen over en toont hij de
commando's om het handmatig te doen — de rest van je project blijft gewoon staan.

---

## i18n

| | |
|---|---|
| Talen | `en`, `de`, `nl`, `fr` |
| Standaardtaal | `en` |
| URL-prefix | `never` — de taal staat in de `NEXT_LOCALE`-cookie, niet in de URL |
| Vertalingen | `messages/en.json`, `de.json`, `nl.json`, `fr.json` |
| Routing | `src/app/[locale]/...` |

De talen wijzig je op één plek: `LOCALES` en `DEFAULT_LOCALE` bovenaan
`src/steps/i18n.ts`.

### De taal komt nooit in de URL

Daar zorgen twee dingen voor:

1. `localePrefix: 'never'` in `src/i18n/routing.ts`, afgedwongen door
   `src/proxy.ts`.
2. Een vangnet in `next.config.ts` dat vóór de middleware draait en `/nl`,
   `/en`, `/fr`, `/de` (en `/nl/iets`) hoe dan ook naar de versie zonder prefix
   redirect — ook als de proxy ooit niet meedraait.

De `LocaleSwitcher` navigeert daarom **niet**. Hij zet de cookie en vraagt een
re-render:

```tsx
document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`
startTransition(() => router.refresh())
```

> Gebruik hier **geen** `router.replace(pathname, { locale })`. Dat navigeert via
> de URL en zet er alsnog `/fr` of `/nl` voor.

### Vertalingen gebruiken

```tsx
// Server component
import { getTranslations } from 'next-intl/server'

export default async function Page() {
    const t = await getTranslations('HomePage')
    return <h1>{t('title')}</h1>
}
```

```tsx
// Client component
'use client'
import { useTranslations } from 'next-intl'

export default function Widget() {
    const t = useTranslations('HomePage')
    return <p>{t('description')}</p>
}
```

In ICU-messages zijn `{` `}` placeholders en `<` `>` tags. Wil je die letterlijk
tonen, escape je met apostrofs: `'{'` of `'<'`.

---

## Light/dark mode

Class-based dark mode (Tailwind 4 `@custom-variant`), met design tokens in
`globals.css` en de voorkeur in de `theme`-cookie — nooit localStorage. De class
wordt **server-side** gezet, dus geen flits en geen inline script:

| cookie | `<html>` | resultaat |
|---|---|---|
| `dark` | `class="dark"` | altijd donker |
| `light` | *(geen class)* | altijd licht |
| `system` of geen | `class="theme-system"` | CSS volgt `prefers-color-scheme` |

- `src/app/globals.css` — tokens voor light en dark + `@theme inline`-mapping
- `src/components/theme/ThemeProvider.tsx` — `useTheme()`, `setTheme()`, `cycleTheme()`
- `src/components/theme/ThemeToggle.tsx` — knop die wisselt tussen
  light → dark → system, met `react-icons` en vertaalde labels

Gebruik in componenten altijd de tokens (`bg-background`, `text-foreground`,
`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, ...) en nooit
`bg-white` / `text-black`, anders breekt dark mode.

---

## Prettier

De frontend krijgt automatisch een `.prettierrc` (single quotes, geen
puntkomma's, tab width 4, print width 120, `prettier-plugin-tailwindcss` voor het
sorteren van class-namen), een `.prettierignore`, en de scripts `format` en
`format:check`. De gegenereerde code wordt meteen in die stijl geformatteerd.

De backend krijgt exact dezelfde instellingen, alleen zonder
`prettier-plugin-tailwindcss` — die heeft daar geen nut.

De config staat in `src/utils/prettier.ts` in de functie `buildConfig()` — pas
die aan om je huisstijl te wijzigen.

---

## Installeren

### Vanaf GitHub, zonder installatie

```bash
mkdir mijn-project
cd mijn-project
npx github:DafkeDD/starter-cli
```

npm cloneert de repo, draait automatisch de build (`prepare` → `tsc`) en start de
CLI. Je hoeft dus niets op npm te publiceren.

npx cachet git-installaties. Blijft hij op oude code hangen, dan helpt
`npm cache clean --force`.

### Of globaal

```bash
npm install -g github:DafkeDD/starter-cli
starter-cli
```

Dit is de rustigste manier: geen npx-vraag, geen download bij elke run. Opnieuw
draaien van dat install-commando is meteen ook de update.

---

## Lokaal ontwikkelen

```bash
npm install
npm run dev      # draait src/index.ts rechtstreeks via tsx
npm run build    # compileert naar dist/
npm start        # draait dist/index.js
```

Uitproberen zonder te publiceren:

```bash
npm run build
npm link                 # in de starter-cli map
cd /pad/naar/testmap
starter-cli
```

### Structuur

```
starter-cli/
├─ package.json          # bin: starter-cli -> dist/index.js
├─ tsconfig.json
├─ templates/            # échte bestanden, geen strings in de code
│  ├─ oidc-server/               # wordt oidc/ in het project
│  ├─ oidc-client-express/  (+ -admin)   # backend als OIDC-client
│  ├─ oidc-frontend/        (+ -admin)   # loginpagina en beheerscherm
│  └─ oidc-client-nest/     (+ -admin)
└─ src/
   ├─ index.ts           # flow: vragen -> overzicht -> genereren
   ├─ types.ts
   ├─ steps/
   │  ├─ frontend.ts     # vraag 1 + scaffold van Next.js
   │  ├─ ui.ts           # vraag 2 + custom UI installeren
   │  ├─ backend.ts      # vraag 3 + scaffold van Express of NestJS
   │  ├─ github.ts       # vraag 5 + repo aanmaken en pushen
   │  ├─ i18n.ts         # next-intl (altijd, 4 talen, standaard en)
   │  ├─ oidc.ts         # vraag 4 + de OIDC-server
   │  ├─ theme.ts        # light/dark mode + design tokens
   │  └─ rules.ts        # PROJECT-RULES.md + AGENTS.md-blok
   └─ utils/
      ├─ exec.ts         # commando's draaien (Windows-proof)
      ├─ install.ts      # (dev)dependencies toevoegen
      ├─ prettier.ts     # .prettierrc + plugin + formatteren
      ├─ progress.ts     # één progress-bar per onderdeel
      └─ template.ts     # templates/ kopiëren en {{VARS}} invullen
```

### Een nieuwe vraag toevoegen

1. Maak `src/steps/<naam>.ts` met een `ask<Naam>()` en een `scaffold<Naam>()`.
2. Importeer beide in `src/index.ts`.
3. Roep `ask<Naam>()` aan bij de vragen en `scaffold<Naam>()` bij het genereren.
4. Voeg een regel toe aan het overzicht (`p.note`).

Gebruik in `scaffold<Naam>()` **één** `withProgress(...)` voor het hele
onderdeel. Deelstappen benoem je met de meegegeven `update('...')`, zodat het
bij één bar blijft in plaats van meerdere onder elkaar.

De CLI vraagt geen bevestiging meer — na je keuzes begint hij meteen.

---

## Vereisten

- Node.js 18.18 of hoger
- Git (voor installatie vanaf GitHub)
- GitHub CLI (`gh`), ingelogd — alleen als je vraag 5 met ja beantwoordt

## Licentie

MIT
