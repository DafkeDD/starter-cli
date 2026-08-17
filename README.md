# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

Op dit moment is er één vraag: welke frontend. De enige optie is **Next.js**
(altijd de laatste versie, via `create-next-app@latest`), die geïnstalleerd
wordt in een submap `frontend/`, inclusief TypeScript, Tailwind CSS, ESLint,
**next-intl**, **light/dark mode** en **Prettier** met de projectinstellingen.

## Harde regels

Deze drie liggen vast en zijn geen vraag in de CLI:

1. **next-intl, altijd** — 4 talen, standaard Engels.
2. **UI-componenten worden altijd zelf gebouwd** — niets uit shadcn/ui, Radix,
   MUI, Chakra of welke component library dan ook. Iconen uitsluitend uit
   `react-icons`.
3. **Light/dark mode, altijd** — class-based, voorkeur in een cookie, met een
   toggle in de UI.

Ze worden ook in het gegenereerde project vastgelegd, in `PROJECT-RULES.md` en
als `project-rules`-blok in `AGENTS.md` (die Claude Code automatisch meeleest
via `CLAUDE.md` → `@AGENTS.md`).

### i18n — harde regel

Elke gegenereerde frontend gebruikt **altijd** `next-intl`. Dit is bewust geen
vraag in de CLI en kan niet uitgezet worden.

| | |
|---|---|
| Talen | `en`, `de`, `nl`, `fr` |
| Standaardtaal | `en` (Engels) |
| URL-prefix | `never` — taal staat in een cookie, niet in de URL |
| Vertalingen | `messages/<locale>.json` |
| Routing | `src/app/[locale]/...` |

Wat er wordt aangemaakt:

- `src/i18n/routing.ts`, `navigation.ts`, `request.ts`
- `src/proxy.ts` (de Next.js 16-naam voor `middleware.ts`)
- `next.config.ts` met `createNextIntlPlugin()`
- `src/app/[locale]/layout.tsx` + `page.tsx` — een demo-pagina die in alle
  4 de talen rendert
- `src/components/LocaleSwitcher.tsx` — knoppen om live van taal te wisselen
- `messages/en.json`, `de.json`, `nl.json`, `fr.json`

De talen wijzig je op één plek: `LOCALES` en `DEFAULT_LOCALE` bovenaan
`src/steps/i18n.ts`.

### Light/dark mode

Class-based dark mode (Tailwind 4 `@custom-variant`), met design tokens in
`globals.css` en de voorkeur in de `theme`-cookie — nooit localStorage. Een
klein inline script zet de class vóór de eerste paint, dus geen witte flits.

- `src/app/globals.css` — tokens voor light en dark + `@theme inline`-mapping
- `src/components/theme/ThemeProvider.tsx` — `useTheme()`, `setTheme()`, `cycleTheme()`
- `src/components/theme/ThemeToggle.tsx` — knop die wisselt tussen
  light → dark → system, met `react-icons` en vertaalde labels

Gebruik in componenten altijd de tokens (`bg-background`, `text-foreground`,
`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, ...) en nooit
`bg-white` / `text-black`, anders breekt dark mode.

### Prettier

De frontend krijgt automatisch een `.prettierrc` (single quotes, geen puntkomma's,
tab width 4, print width 120, `prettier-plugin-tailwindcss` voor het sorteren van
class-namen), een `.prettierignore`, en de scripts `format` en `format:check`.
De gegenereerde code wordt meteen in die stijl geformatteerd.

De config staat in `src/utils/prettier.ts` in de constante `PRETTIER_CONFIG` —
pas die aan om je huisstijl te wijzigen.

---

## Gebruiken (vanaf GitHub, zonder installatie)

```bash
mkdir mijn-project
cd mijn-project
npx github:DafkeDD/starter-cli
```

npm cloneert de repo, draait automatisch de build (`prepare` → `tsc`) en start
de CLI. Je hoeft dus niets vooraf te publiceren op npm.

### Of globaal installeren

```bash
npm install -g github:DafkeDD/starter-cli
starter-cli
```

Bijwerken naar de laatste versie:

```bash
npm install -g github:DafkeDD/starter-cli   # opnieuw draaien = updaten
```

> Tip: npx cachet git-installaties. Forceer een verse versie met
> `npx --yes github:DafkeDD/starter-cli`.

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

---

## Structuur

```
starter-cli/
├─ package.json          # bin: starter-cli -> dist/index.js
├─ tsconfig.json
└─ src/
   ├─ index.ts           # flow: vragen -> overzicht -> bevestigen -> genereren
   ├─ types.ts
   ├─ steps/
   │  ├─ frontend.ts     # vraag 1 + scaffold van Next.js
   │  ├─ i18n.ts         # next-intl (altijd, 4 talen, standaard en)
   │  ├─ theme.ts        # light/dark mode + design tokens
   │  └─ rules.ts        # PROJECT-RULES.md + AGENTS.md-blok
   └─ utils/
      ├─ exec.ts         # commando's draaien (Windows-proof)
      ├─ install.ts      # (dev)dependencies toevoegen
      ├─ prettier.ts     # .prettierrc + plugin + formatteren
      └─ progress.ts     # progress-bar tijdens trage installs
```

### Een nieuwe vraag toevoegen

1. Maak `src/steps/<naam>.ts` met een `ask<Naam>()` en een `scaffold<Naam>()`.
2. Importeer beide in `src/index.ts`.
3. Roep `ask<Naam>()` aan bij de vragen, en `scaffold<Naam>()` na de bevestiging.
4. Voeg een regel toe aan het overzicht (`p.note`).

---

## Vereisten

- Node.js 18.18 of hoger
- Git (voor installatie vanaf GitHub)

## Licentie

MIT
