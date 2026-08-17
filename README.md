# starter-cli

Interactieve CLI die op basis van vragen een project scaffold in de **huidige map**.

Op dit moment is er één vraag: welke frontend. De enige optie is **Next.js**
(altijd de laatste versie, via `create-next-app@latest`), die geïnstalleerd
wordt in een submap `frontend/`.

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
