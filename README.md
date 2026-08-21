# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

Op dit moment zijn er vijf vragen:

1. **Welke frontend?** — Next.js (altijd de laatste versie, via
   `create-next-app@latest`) of geen. Komt in `frontend/`, met TypeScript,
   Tailwind CSS, ESLint, **next-intl**, **light/dark mode** en **Prettier**.
2. **Custom UI installeren?** — installeert `github:DafkeDD/projectx-ui` in de
   frontend: de gedeelde layout en componenten, zodat elke app er hetzelfde
   uitziet.
3. **Welke backend?** — Node.js + Express, NestJS of geen. Komt in `backend/`,
   in TypeScript, **altijd op poort 5000**, ook met **Prettier**.
4. **OIDC / SSO?** — een nieuwe OIDC-server opzetten (deze app wordt de hub),
   aansluiten op een bestaande, of niets.
5. **GitHub gebruiken?** — bij ja vraagt hij de projectnaam, en maakt hij een
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
3. **Light/dark mode, altijd** — class-based, voorkeur in een cookie, met een
   toggle in de UI.
4. **De backend draait altijd op poort 5000** — hard gezet in de code, geen
   env-override.

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

## Custom UI

De vraag **"Wil je onze custom UI installeren?"** komt meteen na de
frontend-vraag, en alleen als er een frontend is.

Bij ja gebeuren er twee dingen:

1. `github:DafkeDD/projectx-ui` wordt als dependency toegevoegd aan `frontend/`.
2. De `globals.css` uit dat package **overschrijft** die van de app.

De design tokens - kleuren, radius, typografie - komen dus uit de custom UI, niet
uit de CLI. Eén plek voor de waarheid, zodat elke app er hetzelfde uitziet. Wil
je per app afwijken, pas dan achteraf `frontend/src/app/globals.css` aan; die
wordt niet meer aangeraakt zolang je de CLI niet opnieuw draait.

De CLI zoekt die stylesheet op deze plekken in het package, in deze volgorde:

```
globals.css
dist/globals.css
styles/globals.css
src/globals.css
src/app/globals.css
```

Vindt hij er geen, dan houdt de frontend zijn eigen tokens en krijg je een
waarschuwing met de doorzochte paden. Staat jouw stylesheet ergens anders, voeg
het pad dan toe aan `STYLESHEET_CANDIDATES` in `src/steps/ui.ts`.

> De naam waaronder het package landt wordt bepaald door te kijken welke
> dependency erbij komt, niet door de spec te parsen - npm herschrijft die
> namelijk (een `file:`-pad wordt relatief, een `github:`-spec kan een
> commit-hash krijgen).

Lukt de installatie niet - repo privé, geen git-toegang, geen netwerk - dan
**stopt de CLI niet**. Je krijgt een waarschuwing met het commando om het later
alsnog te doen, en de rest van je project is gewoon af:

```
!  Custom UI installeren is niet gelukt: ... (exit code 128).
   Is de repo privé, log dan in met 'gh auth login' of zet een SSH-sleutel klaar.
   Later alsnog installeren:
     cd frontend && npm install github:DafkeDD/projectx-ui
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
