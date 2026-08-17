# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

Op dit moment is er één vraag: welke frontend. De enige optie is **Next.js**
(altijd de laatste versie, via `create-next-app@latest`), die geïnstalleerd
wordt in een submap `frontend/`, inclusief TypeScript, Tailwind CSS, ESLint en
**Prettier** met de projectinstellingen.

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
   │  └─ frontend.ts     # vraag 1 + scaffold van Next.js
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
