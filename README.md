# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

Op dit moment zijn er twee vragen:

1. **Welke frontend?** — Next.js (altijd de laatste versie, via
   `create-next-app@latest`) of geen. Komt in `frontend/`, met TypeScript,
   Tailwind CSS, ESLint, **next-intl**, **light/dark mode** en **Prettier**.
2. **Welke backend?** — Node.js + Express, NestJS of geen. Komt in `backend/`,
   in TypeScript, **altijd op poort 5000**, ook met **Prettier**.

Beide mappen krijgen exact dezelfde Prettier-instellingen.

```bash
mkdir mijn-project
cd mijn-project
npx --yes github:DafkeDD/starter-cli
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
npx --yes github:DafkeDD/starter-cli
```

npm cloneert de repo, draait automatisch de build (`prepare` → `tsc`) en start de
CLI. Je hoeft dus niets op npm te publiceren.

> `--yes` is belangrijk: npx cachet git-installaties en pakt anders een oude
> versie. Blijft hij hangen op oude code, dan helpt `npm cache clean --force`.

### Of globaal

```bash
npm install -g github:DafkeDD/starter-cli
starter-cli
```

Opnieuw draaien van dat install-commando is meteen ook de update.

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
└─ src/
   ├─ index.ts           # flow: vragen -> overzicht -> genereren
   ├─ types.ts
   ├─ steps/
   │  ├─ frontend.ts     # vraag 1 + scaffold van Next.js
   │  ├─ backend.ts      # vraag 2 + scaffold van Express of NestJS
   │  ├─ i18n.ts         # next-intl (altijd, 4 talen, standaard en)
   │  ├─ theme.ts        # light/dark mode + design tokens
   │  └─ rules.ts        # PROJECT-RULES.md + AGENTS.md-blok
   └─ utils/
      ├─ exec.ts         # commando's draaien (Windows-proof)
      ├─ install.ts      # (dev)dependencies toevoegen
      ├─ prettier.ts     # .prettierrc + plugin + formatteren
      └─ progress.ts     # één progress-bar per onderdeel
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

## Licentie

MIT
