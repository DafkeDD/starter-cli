# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

```bash
mkdir mijn-project
cd mijn-project
npx github:DafkeDD/starter-cli
```

---

## De vragen

De meeste vragen komen vooraan. Die over de database komen **na de installatie**,
als je apps er al staan.

1. **Welke frontend?** — Next.js (altijd de laatste versie, via
   `create-next-app@latest`) of geen. Met TypeScript, Tailwind CSS, ESLint,
   **next-intl**, **light/dark mode** en **Prettier**.
2. **Custom UI installeren?** — kopieert de 68 componenten van
   `github:DafkeDD/projectx-ui` als broncode in de frontend, en neemt de design
   tokens over in `globals.css`.
3. **Welke backend?** — Node.js + Express, NestJS of geen. Komt in `backend/`,
   in TypeScript, ook met **Prettier**.
4. **OIDC / SSO?** — een nieuwe hub opzetten, aansluiten op een bestaande, of
   niets.
5. **Hoe draait de hub?** — alleen bij een nieuwe hub: als eigen server, of als
   één app samen met Next.js. En in dat laatste geval: **Express of NestJS**
   eronder. Zie [Twee vormen van een hub](#twee-vormen-van-een-hub).
6. **Basis-layout installeren?** — sidebar met navigatie en een topbar met
   avatar, uit het design. Zie [De basis-layout](#de-basis-layout).
7. **GitHub gebruiken?** — bij ja vraagt hij de projectnaam, en maakt hij een
   repo met die naam aan.

Sluit je aan op een bestaande hub, dan vraagt stap 4 ook naar de issuer-URL, of
dit project het beheerpaneel is, het **registratietoken** van die hub, en of je
vanuit deze app een account mag aanmaken. Die eerste twee worden meteen
gecontroleerd bij de hub zelf — zie [Aansluiten op een bestaande
hub](#aansluiten-op-een-bestaande-hub).

Dan wordt alles geinstalleerd. Pas daarna:

8. **Welke database?** — PostgreSQL in Docker, een PostgreSQL die je zelf
   draait, of geen. Eigen datalaag, geen ORM.
9. **Hoe moet die database heten, en met welke gebruiker en welk wachtwoord?**

En als je voor Docker koos, tot slot: **"Zal ik de database nu starten en de
migraties draaien?"** Bij ja heb je meteen een werkende database in plaats van
een lijstje commando's dat je nog moet afwerken.

Waarom de database achteraan: je ziet dan dat de installatie gelukt is voor je
beslist waar je data heen gaat. En het installeren duurt een paar minuten — die
tijd zit je liever niet te wachten op een keuze die je al gemaakt hebt.

---

## Twee vormen van een hub

Zet je een nieuwe OIDC-server op, dan kan dat op twee manieren.

### Als eigen server — `./oidc`

Een kaal servertje op poort 9000 dat zijn inlogschermen als HTML rendert. Niets
extra's, en de hub staat volledig op zichzelf. Je frontend en backend staan
ernaast in `./frontend` en `./backend`.

```
project/
├─ frontend/     Next.js            :3000
├─ backend/      Express of Nest    :5000   OIDC-client
└─ oidc/         de hub             :9000
```

### Als één app met Next.js — `./app`

De hub draait in **hetzelfde proces** als je Next-frontend. Eén map, één poort,
één origin. De hub hangt op `/oidc`, het inloggen van de app zelf op `/auth`, en
de rest van de paden is van je eigen schermen.

```
project/
└─ app/          Next.js + hub      :9000
                 ├─ /            jouw schermen
                 ├─ /oidc/...    de hub
                 └─ /auth/...    inloggen op deze app zelf
```

Er is dan geen aparte `./frontend` en `./backend`, en ook maar **één database** —
de hub deelt hem met de app.

Waarom dit de moeite is: geen proxy, geen CORS, en de interaction-cookie van
`oidc-provider` klopt altijd, want alles staat op dezelfde origin. Het
inlogscherm is een gewone Next-pagina, dus het volgt je design in plaats van
losse HTML te zijn.

Onder de hub ligt Express of NestJS, dat vraagt de CLI. Nest draait zelf ook op
Express, dus de hub-router is in beide gevallen dezelfde code; alleen de
opstartkant verschilt.

> **Let op bij NestJS:** `nest build` gebruikt de programmatische compiler-API
> van TypeScript, en die is in TypeScript 7 verdwenen. De CLI pint daarom
> `typescript@^6` in een hub-app met Nest.

---

## Harde regels

Deze liggen vast en zijn bewust geen vraag in de CLI:

1. **next-intl, altijd** — 4 talen (`en`, `de`, `nl`, `fr`), standaard Engels,
   en de taal staat nooit in de URL.
2. **UI-componenten worden altijd zelf gebouwd** — niets uit shadcn/ui, Radix,
   MUI, Chakra, Ant Design, HeadlessUI, DaisyUI of NextUI. Iconen uitsluitend
   uit `react-icons`, nooit `lucide-react`.
3. **Geen ORM** — de datalaag is zelf geschreven: de kale `pg`-driver met een
   dunne eigen laag erboven. Geen Prisma, TypeORM of Drizzle.
4. **Sleutels zijn UUID's** — `gen_random_uuid()`, nooit een oplopend nummer.
5. **Light/dark mode, altijd** — class-based, voorkeur in een cookie, met een
   toggle in de UI.
6. **De poort komt uit `PORT` in `.env`**, met een terugval in de code. Draait er
   al een ander project, dan kiest de CLI bij het scaffolden de volgende. Zo
   werkt hetzelfde project ook in Docker.

Ze worden ook in het gegenereerde project vastgelegd, in `PROJECT-RULES.md` en
als `project-rules`-blok in `AGENTS.md` — die Claude Code automatisch meeleest
via `CLAUDE.md` → `@AGENTS.md`.

---

## De basis-layout

Zeg je ja op de layout-vraag, dan komt de schil uit het design mee: een sidebar
met navigatie, een topbar met themaknop en avatar, en jouw pagina ertussen.

```
src/
├─ app/
│  ├─ design.css                  # tokens en componentklassen van het design
│  └─ shell.css                   # de schil zelf
└─ components/
   ├─ design/
   │  ├─ icons.tsx                # de iconenset
   │  └─ primitives.tsx           # Avatar en andere kleine bouwstenen
   └─ shell/
      ├─ AppShell.tsx             # server component: haalt de gebruiker op
      └─ Shell.tsx                # client component: sidebar, topbar, menu
```

Twee dingen die bewust zo zijn:

**De schil verschijnt pas na het inloggen.** De sidebar en de topbar horen bij de
app; het inlogscherm hoort daar los van te staan. Is er niemand ingelogd, dan
rendert `AppShell` alleen `children`. In een project zonder login valt er niets
af te wachten en staat de schil er altijd.

**De schil zit in de `[locale]`-layout, niet in de root-layout.** Zo blijven de
schermen van de hub op `/oidc` erbuiten — daar ben je nog niet ingelogd.

De navigatie is één knop in `AppShell.tsx`; regels erbij zetten is genoeg, de
actieve staat volgt vanzelf uit het pad. Het thema komt van de `ThemeToggle` die
er al was, dus geen flits bij het laden, en er komt geen framer-motion bij: het
gebruikersmenu klapt open met CSS.

---

## Database

**PostgreSQL**, en alleen PostgreSQL. Geen ORM — de laag is zelf geschreven, met
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

### Namen kiezen

De CLI vraagt hoe de database moet heten en met welke gebruiker je erin gaat. Hij
stelt iets voor, maar je bepaalt zelf:

```
Naam van de database                 app01
Gebruiker van je PostgreSQL          postgres
Wachtwoord van postgres              ********
```

Het voorstel is `app01`, een tweede project krijgt `app02`, enzovoort. Dat moet
wel: draai je PostgreSQL zelf, dan zitten al je projecten op dezelfde server. Wat
er is uitgedeeld staat in `~/.starter-cli/databases.json`.

De hub is de uitzondering. Die database heet gewoon **`oidc`**, zonder nummer —
er draait er maar een, net zoals hij op poort 9000 blijft staan. En bij een
hub-app is er helemaal geen aparte hub-database: alles zit in die ene van de app.

Staat er al een `.env` van een eerdere run, dan blijft die leiden en stelt de CLI
geen vragen meer — anders zou je een antwoord geven dat toch niet in het bestand
belandt.

### Queries

```ts
import { connect, sql, id, list } from './db/index.js'

const db = await connect()

// Alles met ${...} wordt een parameter, nooit tekst in de query.
// SQL-injectie is daarmee uitgesloten, ook als de waarde van een gebruiker komt.
const user = await db.one(sql`select * from users where email = ${email}`)

// Tabel- en kolomnamen via id(): die worden gequote.
const rows = await db.query(sql`select * from ${id('users')} where ${id('id')} in ${list(ids)}`)

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
        t.id()                          // uuid primary key, default gen_random_uuid()
        t.string('email', 255).unique() // varchar(255) not null + unique constraint
        t.bool('active').default(true)  // boolean not null default true
        t.timestamps()                  // created_at + updated_at, timestamptz default now()
    })
}

export async function down(s: Schema): Promise<void> {
    await s.dropTable('users')
}
```

`t.id()` geeft een **UUID**, geen oplopend nummer. PostgreSQL vult hem zelf met
`gen_random_uuid()` — dat zit sinds versie 13 in de kern, dus je hoeft geen
extensie te installeren. Je krijgt dus `a3f1c2d4-...` terug en niet `1`.

Waarom dat de moeite is: een oplopend nummer verklapt hoeveel gebruikers je hebt
en laat zich raden. Een UUID niet, en hij is bovendien al bekend voordat de rij
bestaat — handig als je twee tabellen tegelijk vult.

Past iets niet in de bouwer — een view, een trigger, een index met een `where` —
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

### In Docker of zelf draaien

**PostgreSQL in Docker** (aanbevolen) — de CLI regelt alles. Het image maakt de
gebruiker en de database aan uit de naam en het wachtwoord die je gaf. Een
commando:

```
npm run db:up
```

Dat start de database, wacht tot hij **echt** klaar is, en migreert dan pas.

Waarom dat niet twee commando's zijn: `docker compose up -d` geeft de prompt
terug zodra de container *gestart* is, niet als PostgreSQL klaar is om te
antwoorden. Migreer je meteen daarna, dan krijg je
`Connection terminated unexpectedly` — de database accepteert je verbinding al
terwijl hij nog initialiseert, en verbreekt hem weer. De `--wait` in het script
lost dat op, en `start_period` in de healthcheck zorgt dat een trage eerste
start niet als mislukt geldt.

**PostgreSQL die je zelf draait** — je hebt er al een geinstalleerd, en dus ook
al een account. De CLI maakt daar **geen rol** bij aan; hij maakt alleen de
database, met jouw eigen account:

```sql
CREATE DATABASE "app01";
```

Meer niet. Zonder die database faalt de eerste migratie met
`database "app01" does not exist`, en dat is precies de stap die je anders zelf
vergeet. Bestaat hij al, dan gebeurt er niets.

De rest — de datalaag, de migraties, de scripts — is in beide gevallen gelijk.
Wisselen doe je door `DB_HOST`, `DB_PORT` en `DB_USER` in `.env` aan te passen;
aan de code verandert niets.

De andere scripts:

```
npm run db:migrate           openstaande migraties uitvoeren
npm run db:migrate:status    tonen wat er open staat
npm run db:rollback          de laatste terugdraaien
npm run db:reset             ALLES wissen en opnieuw opbouwen
npm run db:admin             pgAdmin starten op http://localhost:5050
```

### pgAdmin

pgAdmin zit in de compose, maar start **niet** vanzelf mee. Het is een zware
container en niet iedereen gebruikt hem — je hebt misschien liever DBeaver of
gewoon `psql`. Hij hangt daarom achter een profiel:

```
npm run db:admin
```

Inloggen met `PGADMIN_EMAIL` en `PGADMIN_PASSWORD` uit de `.env` in je hoofdmap
(standaard `admin@localhost` / `admin` — het draait alleen lokaal).

De serververbinding staat al klaar via `docker/pgadmin-servers.json`. Let op wat
daar staat: **host `db`, poort 5432** — niet de poort die jij op je eigen machine
ziet. pgAdmin draait namelijk zelf in het compose-netwerk en praat rechtstreeks
met de container.

Dat bestand wordt alleen gelezen bij de allereerste start, wanneer pgAdmin zijn
eigen database aanmaakt. Pas je het later aan, dan moet je het volume weggooien:
`docker compose down -v`.

`.env` staat in `.gitignore`, `.env.example` niet. Schrijven meerdere stappen in
dezelfde `.env` — de database en daarna de OIDC-client — dan worden de sleutels
samengevoegd, niet overschreven.

### Twee dingen om te weten

1. **PostgreSQL geeft `bigint` terug als string**, niet als number — anders zou
   je boven 2^53 precisie verliezen. Heb je zelf een `bigint`-kolom, dan komt die
   binnen als `"1"`. Voor de UUID-sleutels speelt dat niet.
2. **De pool vangt zijn eigen verbindingsfouten op.** Gaat de database onderuit
   terwijl er verbindingen inactief staan, dan stuurt `pg` een `error`-event;
   zonder luisteraar stopt Node het hele proces. Die luisteraar staat in
   `connect()`, dus je server blijft draaien en verbindt vanzelf opnieuw.

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

## OIDC / SSO

Eén hub deelt tokens uit, al je apps sluiten erop aan. Het wachtwoord komt alleen
bij de hub; ben je daar al ingelogd via een andere app, dan kom je bij de
volgende meteen binnen.

### Opslag: de database

De hub bewaart alles in PostgreSQL. Drie tabellen: `oidc_payloads` (alles wat
`oidc-provider` bewaart, met `type` als onderscheid), `users` en `clients`.

Dat verandert meer dan alleen waar de gegevens staan:

- De waarschuwing `a quick start development-only in-memory adapter is used`
  verdwijnt. Sessies en tokens overleven een herstart, en twee exemplaren van de
  hub achter een loadbalancer delen dezelfde staat.
- Wachtwoorden worden gehasht met **scrypt uit `node:crypto`**. Een dependency
  minder dan `bcryptjs`.
- Verlopen rijen worden bij het opstarten en daarna elk uur opgeruimd.

`index.ts` weet niet waar de gegevens staan. Beide varianten van `adapter.ts`
exporteren dezelfde twee namen — `StorageAdapter` en `initStorage()` — dus het
verschil zit volledig in dat ene bestand.

### Aangesloten apps staan in `clients`

De hub leest zijn clients uit de database, niet uit een lijst in de code. Daardoor
kan `starter-cli` een nieuwe app aanmelden zonder dat je de hub aanpast of
herstart.

Elke client heeft `allow_registration`. Staat die uit, dan kan je vanuit die app
**geen** account aanmaken: het inlogscherm toont de knop niet, en de route zelf
antwoordt 403. Een verborgen knop is geen slot, dus het is allebei dichtgezet.

Standaard staat hij alleen aan voor de hub zelf. Bij het aansluiten van een app
vraagt de CLI het:

```
Mag je vanuit deze app een account aanmaken?  (standaard: nee)
```

### Het registratietoken

In de `.env` van de hub staat `HUB_REGISTRATION_TOKEN`. Daarmee meldt
`starter-cli` een nieuwe app bij de hub aan. Het is **geen eenmalige code** maar
een vaste sleutel: elke volgende app gebruikt dezelfde.

Na het opzetten van een hub toont de CLI hem meteen. Later terugvinden of
vervangen doe je vanuit de map van de hub:

```
npm run hub:token          laat zien welk token er nu geldt
npm run hub:token:nieuw    zet er een nieuw in .env
```

Na het vervangen moet je de hub **herstarten** — hij leest `.env` alleen bij het
opstarten. Apps die al aangemeld zijn merken er niets van: het token beveiligt
alleen het aanmelden, niet het inloggen.

Is het token leeg, dan staat aanmelden helemaal uit en antwoordt het eindpunt
503.

### Aansluiten op een bestaande hub

Dit is waar het het vaakst misgaat, dus de CLI controleert het meteen in plaats
van je te laten wachten tot je eerste login.

**De issuer wordt uitgeprobeerd.** Je typt de URL, de CLI haalt
`/.well-known/openid-configuration` op. Draait de hub als één app met Next, dan
is `http://localhost:9000` de frontend en `http://localhost:9000/oidc` de hub —
dus probeert hij er zelf `/oidc` achter voor hij het opgeeft:

```
"http://localhost:9000"                          -> http://localhost:9000/oidc
"http://localhost:9000/oidc"                     -> http://localhost:9000/oidc
".../oidc/.well-known/openid-configuration"      -> http://localhost:9000/oidc
"http://localhost:9999"                          -> geen hub gevonden
```

De naam die de hub zelf teruggeeft wint, niet wat je typte: die moet exact in de
tokens staan.

**Het token wordt uitgeprobeerd.** De CLI stuurt een lege aanmelding; de hub
controleert eerst het token en pas daarna de inhoud, dus het antwoord verklapt
precies wat er aan de hand is:

| antwoord | betekenis |
|---|---|
| `400` | token klopt — hij struikelt over de ontbrekende `client_id` |
| `401` | de hub kent dit token niet |
| `503` | aanmelden staat uit; de hub heeft zelf geen token |

Laat je het leeg, dan krijg je geen stille "ok" maar een waarschuwing plus de
vraag *"Toch overslaan en de app later zelf aanmelden?"*.

**En na het aanmelden wordt nagekeken of de hub de app echt kent.** Dat gaat met
een opzettelijk onvolledig autorisatieverzoek — geen token voor nodig. Kent de
hub de `client_id` niet, dan zegt hij `invalid_client`; kent hij hem wel, dan
struikelt hij pas over de rest.

Zonder die controle merk je pas bij je eerste login dat er iets misging, en dan
als:

```
error: invalid_client
error_description: client is invalid
```

Vier manieren waarop het stil kan mislukken worden er zo uitgehaald: geen token,
een verkeerd token, een hub die niet draaide, en een hub die naar een andere
database kijkt.

Lukt het aanmelden niet, dan stopt de CLI niet — je krijgt het `curl`-commando om
het zelf te doen, met alle waarden al ingevuld.

### Het loginscherm past zich aan de app aan

De hub leest de `client_id` uit de authorization request en toont naam, kleur en
tagline van die app. Zo heeft elke app zijn eigen look, terwijl het wachtwoord
alleen bij de hub komt.

### De client-kant in de backend

Bij **beide** keuzes (nieuwe hub of aansluiten) wordt je backend een
OIDC-client:

```
backend/
├─ .env / .env.example   # issuer, client_id, client_secret, session_secret
├─ src/env.ts            # leest .env in, eerste import in index.ts
└─ src/auth/
   ├─ oidc.ts            # verbinding met de hub, lui opgezet
   ├─ routes.ts          # /auth/start, /auth/callback, /auth/me, /auth/logout
   ├─ require-auth.ts    # requireAuth en requireAdmin middleware
   └─ admin.ts           # beheer-endpoints (leeg als dit geen beheerpaneel is)
```

Bij NestJS wordt dat een `AuthModule` met `auth.controller.ts`,
`auth.service.ts` en `admin.controller.ts` in plaats van losse Express-routes.

| endpoint | doet |
|---|---|
| `GET /auth/start` | stuurt door naar de hub, met PKCE |
| `GET /auth/callback` | wisselt de code in, haalt het profiel op, zet de sessie |
| `GET /auth/me` | wie ben ik — de frontend gebruikt dit |
| `GET /auth/logout` | wist de sessie van deze app |

Drie dingen die bewust zo zijn:

1. **Het access token blijft server-side.** `/auth/me` geeft naam, e-mail en rol
   terug, nooit het token.
2. **De discovery gebeurt lui**, pas bij de eerste login. Je backend start dus
   ook als de hub even niet draait, met een nette foutmelding in plaats van een
   crash.
3. **De `.env` wordt echt ingelezen** via `process.loadEnvFile()` in
   `src/env.ts`, dat als eerste import binnenkomt. Geen `dotenv`-package, en
   geen vlaggen in de npm-scripts — die vragen quotes, en cmd quote anders dan
   bash.

Is dit project het beheerpaneel, dan komen daar `/api/admin/users`,
`/api/admin/clients` en `/api/admin/users/:id/blocked` bij. Die praten met de
admin-API van de hub namens de ingelogde beheerder. De hub controleert de rol
daarna nog eens zelf — de autorisatie zit dus niet alleen in de backend.

### De frontend

Bij **beide** keuzes komt er ook een loginpagina in de frontend, in jouw stijl:

```
frontend/
├─ .env.local                        # BACKEND_URL + NEXT_PUBLIC_BACKEND_URL
└─ src/
   ├─ proxy.ts                       # krijgt er een auth-check bij
   ├─ lib/auth.ts                    # getUser(), loginUrl(), backendFetch()
   ├─ app/[locale]/login/page.tsx    # jouw eigen loginpagina
   └─ components/auth/UserBadge.tsx  # wie is ingelogd + uitloggen
```

**Op de loginpagina staat geen wachtwoordveld.** Er staat een knop die naar de
hub gaat. Dat is precies wat SSO mogelijk maakt.

De auth-check in `proxy.ts` kijkt alleen of er een sessiecookie is. Bewust geen
call naar de backend, want middleware draait bij elk request. De echte controle
gebeurt server-side in de pagina en nog eens in de backend — een cookie bewijst
niets.

> **Een valkuil in Next 16:** `cookies().toString()` geeft een lege string
> terug. Wil je de cookies doorsturen naar je backend, gebruik dan `getAll()` en
> plak ze zelf aan elkaar. Anders is `getUser()` altijd `null` en zegt je app dat
> je niet ingelogd bent terwijl je dat wel bent.

### Wat er getest is

Met een echte hub en een echte tweede app, tegen PostgreSQL:

- de volledige authorization-code-flow met PKCE, registreren en inloggen
- een tweede app die aansluit, zich aanmeldt bij de hub en inlogt zonder dat je
  in de eerste app was ingelogd
- `allow_registration` aan en uit naast elkaar: bij de hub staat de knop
  "Account aanmaken" er, bij de app niet, en de route antwoordt daar 403
- het token vervangen: na de herstart geeft het nieuwe token 400 en het oude 401,
  terwijl al aangemelde apps gewoon blijven inloggen
- inloggen met een fout wachtwoord, een geblokkeerd account, een code die maar
  een keer werkt, en het opruimen van verlopen rijen

---

## Poorten en meerdere projecten

De poort van een gegenereerde app komt uit `PORT` in `.env`, met een terugval in
de code. De CLI kiest de waarde bij het scaffolden.

Draai je twee projecten naast elkaar, dan botsen ze: de backend valt om met
`EADDRINUSE`, en `docker compose up` weigert de database omdat de poort al bezet
is. Next.js schuift zelf op naar 3001, maar dan wijzen `FRONTEND_URL` en de
`post_logout_redirect_uris` van de hub nog naar 3000 en breekt je uitlog-redirect.

Daarom kiest de CLI de poorten **bij het scaffolden** en zet die vast in de code:

| | eerste project | tweede project |
|---|---|---|
| frontend | 3000 | 3001 |
| backend | 5000 | 5001 |
| database in Docker | 55432 | 55434 |

De database publiceert bewust **niet** op 5432. Dat is de drukste poort op een
ontwikkelmachine: een eerder geinstalleerde PostgreSQL, een container van een
ander project, of — op Windows — een poortreeks die Hyper-V en WSL voor zichzelf
reserveren. Dat laatste is gemeen, want dan bindt niets die poort meer terwijl
`netstat` niets toont. Controleren kan met:

```
netsh int ipv4 show excludedportrange protocol=tcp
```

In de container luistert PostgreSQL gewoon op 5432; alleen de poort op je eigen
machine is anders. Draai je PostgreSQL zelf, dan blijft het 5432.

**De hub is de uitzondering.** Die draait er maar een, gedeeld door al je apps,
en blijft dus gewoon op 9000. Een project claimt alleen een hub-poort als het
zelf een nieuwe hub opzet; kies je "aansluiten op een bestaande", dan reserveert
het niets — anders zou het volgende project 9001 krijgen voor een hub die
helemaal niet bestaat.

```
project A  nieuwe hub        frontend 3000  backend 5000  hub 9000
project B  sluit aan op A    frontend 3001  backend 5001
project C  sluit aan op A    frontend 3002  backend 5002
```

Een hub-app is één proces op één publieke poort: die van de hub. De frontend zit
erin, dus er is geen aparte frontend-poort.

Dat werkt in beide volgordes: zet je eerst twee aansluitende projecten op en
daarna pas de hub, dan krijgt die hub nog steeds 9000.

Alle afgeleide URL's worden meteen kloppend gegenereerd: `OIDC_REDIRECT_URI`,
`OIDC_ISSUER`, `FRONTEND_URL`, `BACKEND_URL`, de CORS-instelling en de
`redirect_uris` van de client. De frontend krijgt `next dev -p <poort>` in zijn
dev-script — Next.js leest `PORT` namelijk alleen als echte omgevingsvariabele
en niet uit een `.env`-bestand.

### Hoe de keuze tot stand komt

Alleen kijken of een poort nu vrij is, is niet genoeg. De CLI kijkt daarom naar
drie dingen:

1. **Kan hij de poort zelf openen?** Het gewone geval.
2. **Antwoordt er iets als hij verbindt?** Vangt het geval waarin iets anders al
   luistert maar het openen tóch lukt — dat kan bij poorten die Docker Desktop
   doorgeeft, want die worden anders vastgehouden dan door een gewoon proces.
3. **Wat heeft Docker al opgeeist?** Via `docker inspect` op alle containers,
   ook de **gestopte**. Dat laatste is essentieel: de gegenereerde compose
   gebruikt `restart: unless-stopped`, dus zo'n container komt vanzelf terug
   zodra Docker Desktop start. Stond hij even uit toen je scaffoldde, dan leek
   de poort vrij en botste je er later alsnog op met
   `Bind for 0.0.0.0:5432 failed: port is already allocated`.

Daarbovenop houdt de CLI bij wat hij eerder heeft uitgedeeld, in
`~/.starter-cli/ports.json` — en alleen de poorten die een project echt gebruikt
komen daarin terecht. Heb je geen Docker, dan valt stap 3 gewoon weg.

Drie gedragingen die daaruit volgen:

- **Dezelfde map opnieuw scaffolden houdt dezelfde poorten.** Anders zouden de
  URL's in `.env` en in de OIDC-client niet meer kloppen.
- **Een project dat je verwijdert geeft zijn poorten terug**, zodat de nummers
  niet eindeloos oplopen.
- **Kan de CLI het bestand niet schrijven** — geen rechten in je thuismap — dan
  stopt hij niet; hij onthoudt het dan alleen niet tussen projecten door.

Wil je andere startwaarden, pas dan `DEFAULT_PORTS` aan in `src/utils/ports.ts`.

---

## Docker

Naast de npm-manier komt er een Dockerfile per app en een `docker-compose.yml`
in de hoofdmap. Beide manieren blijven werken; Docker is een tweede manier om
hetzelfde project te draaien, geen vervanging.

```
docker compose up -d --build --wait
docker compose exec backend npm run db:migrate
```

Stoppen met `docker compose down`, alles wissen met `docker compose down -v`.

### De valkuil die dit oplost: de OIDC-issuer

De issuer van een OIDC-server moet voor **iedereen** dezelfde URL zijn. Je
browser praat met de hub, en je backend praat er server-to-server mee. Gebruiken
die twee een andere naam, dan komt de `iss` in het id_token niet overeen met wat
de client verwacht en faalt de validatie — met een foutmelding die nergens naar
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
issuer.

### PORT komt uit .env

Binnen Docker zet compose die variabele, buiten Docker leest de app zijn `.env`.
Een app, twee manieren van draaien, geen aparte code.

**Uitzondering: de frontend.** Next.js leest `PORT` alleen als echte
omgevingsvariabele, *niet* uit een `.env`-bestand — dat is uitgeprobeerd. Daarom
staat de poort van de frontend in `package.json` als `next dev -p <poort>`, met
dezelfde waarde die compose meegeeft.

### Wat er getest is

Dit is echt gedraaid, niet alleen geschreven:

- `docker compose up -d` vanaf een leeg volume: database gezond, hub en backend
  op
- migraties uitgevoerd van binnen de containers
- discovery vanuit de backend-container naar `oidc.localhost` met kloppende
  issuer-validatie door `openid-client`
- de volledige SSO-flow van buitenaf: backend → hub → registreren → terug naar
  de callback → `/auth/me` geeft de ingelogde gebruiker

Een kanttekening: Docker Hub was in mijn omgeving geblokkeerd, dus
`node:22-alpine` en `postgres:17-alpine` zijn vervangen door lokaal samengestelde
images met dezelfde Node- en PostgreSQL-versies. De bedrading — netwerk,
servicenamen, poorten, issuer, migraties — is dus met echte containers getest;
niet getest is het binnenhalen van die twee officiele images en de `npm install`
die daarin gebeurt.

---

## Custom UI

De vraag **"Wil je onze custom UI installeren?"** komt meteen na de
frontend-vraag, en alleen als er een frontend is.

`projectx-ui` is **geen runtime-dependency**. Het is een monorepo met een
registry, net zoals de shadcn-CLI: de componenten worden als **broncode** in je
project gekopieerd, zodat je ze per app kan aanpassen zonder een fork.

Bij ja gebeurt dit:

1. `github:DafkeDD/projectx-ui` komt als **devDependency** in de frontend, enkel
   om later opnieuw `add` te kunnen draaien.
2. `projectx-ui.json` wordt geschreven met onze paden.
3. `projectx-ui init` kopieert de design tokens, de basislaag en de hulpfuncties.
4. `projectx-ui add --all` kopieert alle 68 componenten.
5. `src/app/globals.css` wordt **overschreven** door de variant die de tokens van
   de custom UI gebruikt.

Importeren doe je per component:

```tsx
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
```

De componenten hebben **nul externe dependencies** — alleen `react` en
`react-dom`.

### Hoe zie je dat globals.css echt overgenomen is?

Zonder custom UI staat er `--primary: 160 84% 39%` (groen, HSL) in
`globals.css`. Mét custom UI staat er bovenaan:

```css
@import 'tailwindcss';
@import '../components/ui/ui.css';
```

Snel te controleren:

```
findstr /C:"components/ui/ui.css" frontend\src\app\globals.css
```

### Light/dark blijft werken

projectx-ui schakelt met `[data-theme]` op `<html>`, de CLI gebruikt daarnaast de
class `.dark` / `.theme-system` voor Tailwind's `dark:`-utilities. De layout zet
**allebei**, dus ze schakelen samen om.

### Bijwerken

```
npm install --save-dev github:DafkeDD/projectx-ui
npx projectx-ui add --all --force
```

Zonder `--force` blijven jouw aanpassingen staan en krijg je per bestand een
melding dat het al bestaat.

### Als het misloopt

Lukt het niet — geen netwerk, repo verplaatst — dan **stopt de CLI niet**. Je
krijgt een waarschuwing met de commando's om het later alsnog te doen, en de
rest van je project is gewoon af.

De repo staat als `UI_PACKAGE` bovenaan `src/steps/ui.ts` — daar wijzig je hem.

---

## Backend

| | |
|---|---|
| Locatie | `backend/` |
| Poort | 5000, gekozen bij het scaffolden |
| Taal | TypeScript |
| Prettier | zelfde projectsettings als de frontend, zonder de tailwind-plugin |

Bij een hub-app is er **geen** `backend/`: de hub en je API draaien in `app/`.

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

- `src/main.ts` luistert op de gekozen poort in plaats van 3000
- de meegeleverde `.prettierrc` van Nest wordt vervangen door de onze
- er wordt een `.gitignore` toegevoegd (die maakt Nest niet aan bij `--skip-git`)

```bash
cd backend
npm run start:dev
```

---

## GitHub

Zeg je ja op de GitHub-vraag, dan vraagt de CLI hoe je het project wil noemen.
Die naam wordt **ook de naam van de repo**. Daarna vraagt hij nog of de repo
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
commando's om het handmatig te doen.

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

### De layout is gesplitst

De root-`layout.tsx` heeft `<html>`, `<body>`, de fonts en de ThemeProvider. De
`[locale]/layout.tsx` doet alleen `hasLocale`, `setRequestLocale` en de
`NextIntlClientProvider`.

Dat is nodig omdat er ook pagina's buiten `[locale]` staan — de schermen van de
hub op `/oidc`. Die hebben wel `<html>` nodig, maar geen vertalingen en geen
sidebar.

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

De config staat in `src/utils/prettier.ts` in de functie `buildConfig()`.

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
│  ├─ db/  db-express/  db-nest/     # de datalaag en de koppeling per backend
│  ├─ design/                        # tokens, iconen, primitieven
│  ├─ app-shell/                     # sidebar + topbar
│  ├─ docker/                        # compose, Dockerfiles, pgadmin
│  ├─ oidc-server/                   # de hub zelf
│  ├─ oidc-db/                       # opslag van de hub in PostgreSQL
│  ├─ oidc-inapp/  oidc-inapp-nest/  # de hub als één app met Next
│  ├─ oidc-client-express/  (+ -admin)
│  ├─ oidc-client-nest/     (+ -admin)
│  └─ oidc-frontend/        (+ -admin)
└─ src/
   ├─ index.ts           # flow: vragen -> overzicht -> genereren
   ├─ types.ts
   ├─ steps/
   │  ├─ frontend.ts     # Next.js
   │  ├─ ui.ts           # custom UI
   │  ├─ backend.ts      # Express of NestJS
   │  ├─ oidc.ts         # de hub, de client-kant, aanmelden bij een hub
   │  ├─ shell.ts        # de basis-layout
   │  ├─ database.ts     # databasevraag, namen, .env en scripts
   │  ├─ localdb.ts      # de database aanmaken op je eigen PostgreSQL
   │  ├─ docker.ts       # compose en Dockerfiles
   │  ├─ github.ts       # repo aanmaken en pushen
   │  ├─ i18n.ts         # next-intl (altijd, 4 talen, standaard en)
   │  ├─ theme.ts        # light/dark mode + design tokens
   │  └─ rules.ts        # PROJECT-RULES.md + AGENTS.md-blok
   └─ utils/
      ├─ dbnames.ts      # welke databasenamen al uitgedeeld zijn
      ├─ env.ts          # .env samenvoegen zonder te overschrijven
      ├─ exec.ts         # commando's draaien (Windows-proof)
      ├─ install.ts      # (dev)dependencies toevoegen
      ├─ ports.ts        # vrije poorten kiezen en onthouden
      ├─ prettier.ts     # .prettierrc + plugin + formatteren
      ├─ progress.ts     # één progress-bar per onderdeel
      └─ template.ts     # templates/ kopiëren en {{VARS}} invullen
```

### Een nieuwe vraag toevoegen

1. Maak `src/steps/<naam>.ts` met een `ask<Naam>()` en een `scaffold<Naam>()`.
2. Importeer beide in `src/index.ts`.
3. Roep `ask<Naam>()` aan bij de vragen en `scaffold<Naam>()` bij het genereren.
4. Voeg een regel toe aan het overzicht (`p.note`).

Houd `ask` en `scaffold` gescheiden. Alle vragen komen vooraan, al het werk erna
— zo weet je bij het genereren zeker dat er niets meer gevraagd wordt, en kan je
een stap los testen zonder door de prompts heen te moeten.

Gebruik in `scaffold<Naam>()` **één** `withProgress(...)` voor het hele
onderdeel. Deelstappen benoem je met de meegegeven `update('...')`, zodat het
bij één bar blijft in plaats van meerdere onder elkaar.

---

## Vereisten

- Node.js 20.12 of hoger (voor `process.loadEnvFile()` in de gegenereerde apps)
- Git (voor installatie vanaf GitHub)
- Docker Desktop — alleen als je voor "PostgreSQL in Docker" kiest
- GitHub CLI (`gh`), ingelogd — alleen als je de GitHub-vraag met ja beantwoordt

## Licentie

MIT
