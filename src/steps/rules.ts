import fs from "node:fs";
import path from "node:path";
import { LOCALES, DEFAULT_LOCALE } from "./i18n.js";

/**
 * Schrijft de harde projectregels weg: als los document (PROJECT-RULES.md) en
 * als blok in AGENTS.md, zodat Claude Code en andere agents ze automatisch
 * meelezen (create-next-app zet CLAUDE.md al op `@AGENTS.md`).
 */

const localeList = LOCALES.map((l) => `\`${l}\``).join(", ");

const AGENTS_BLOCK = `
<!-- BEGIN:project-rules -->

# Harde projectregels (niet verwijderen)

## 1. i18n — altijd next-intl

Deze frontend gebruikt **altijd** \`next-intl\`, in ${LOCALES.length} talen: ${localeList}.
Standaardtaal is \`${DEFAULT_LOCALE}\`.

- Zichtbare tekst wordt **nooit** hard gecodeerd — altijd \`useTranslations()\`
  (client) of \`getTranslations()\` (server).
- Elke nieuwe key wordt toegevoegd in **alle** bestanden onder \`messages/\`.
- Nieuwe pagina's komen onder \`src/app/[locale]/\`, nooit direct onder \`src/app/\`.
- Interne navigatie gaat via \`@/i18n/navigation\`, niet via \`next/link\` of
  \`next/navigation\`.

## 2. UI-componenten — altijd zelf bouwen

**NIETS uit een component library.** Geen shadcn/ui, geen Radix, geen MUI, geen
Chakra, geen Ant Design, geen HeadlessUI, geen DaisyUI, geen NextUI/HeroUI —
niets. Elke knop, input, modal, dropdown, tabel en badge wordt zelf geschreven
in \`src/components/ui/\`, met Tailwind.

- Ook geen \`npx shadcn@latest add ...\`. Dat commando wordt hier nooit gedraaid.
- Iconen komen **uitsluitend** uit \`react-icons\`. Nooit \`lucide-react\`.
- Utility-libraries die geen componenten leveren (\`clsx\`, \`tailwind-merge\`)
  mogen wel.

## 3. Light/dark mode — altijd aanwezig

- Class-based dark mode via \`@custom-variant dark\` in \`globals.css\`.
- De voorkeur staat in de \`theme\`-cookie, **nooit** in localStorage.
- Kleuren komen uit de design tokens (\`bg-background\`, \`text-foreground\`,
  \`border-border\`, \`bg-card\`, \`text-muted-foreground\`, ...). Nooit hardcoded
  \`bg-white\` / \`text-black\`, want dan breekt dark mode.

<!-- END:project-rules -->
`;

const PROJECT_RULES = `# Projectregels

Deze regels liggen vast. Ze worden door de starter-cli gegenereerd en gelden
voor alles wat er later bijkomt.

---

## 1. i18n — altijd next-intl

Deze frontend gebruikt **altijd** \`next-intl\`. Dit is geen keuze en wordt niet
uitgezet.

| | |
|---|---|
| Talen | ${LOCALES.map((l) => `\`${l}\``).join(", ")} |
| Standaardtaal | \`${DEFAULT_LOCALE}\` |
| URL-prefix | \`never\` — de taal staat niet in de URL, maar in een cookie |
| Vertalingen | \`messages/\` (${LOCALES.map((l) => `\`${l}.json\``).join(", ")}) |
| Routing | \`src/app/[locale]/...\` |

1. **Geen enkele zichtbare tekst wordt hard gecodeerd.** Alle tekst die een
   gebruiker ziet, komt uit \`useTranslations()\` (client) of
   \`getTranslations()\` (server).
2. **Elke nieuwe key wordt in alle ${LOCALES.length} bestanden toegevoegd.**
   Een key die in één taal ontbreekt, is een bug.
3. **Nieuwe pagina's komen onder \`src/app/[locale]/\`.** Nooit rechtstreeks
   onder \`src/app/\`, want dan mist de locale-context.
4. **Navigatie gebruikt \`@/i18n/navigation\`** (\`Link\`, \`useRouter\`,
   \`redirect\`, \`usePathname\`) — nooit \`next/link\` of \`next/navigation\`
   voor interne links.
5. **Talen wijzigen** doe je in \`src/i18n/routing.ts\` én in \`messages/\`.

\`\`\`tsx
// Server component
import { getTranslations } from 'next-intl/server'

export default async function Page() {
    const t = await getTranslations('HomePage')
    return <h1>{t('title')}</h1>
}
\`\`\`

\`\`\`tsx
// Client component
'use client'
import { useTranslations } from 'next-intl'

export default function Widget() {
    const t = useTranslations('HomePage')
    return <p>{t('description')}</p>
}
\`\`\`

Let op: in ICU-messages zijn \`{\` \`}\` placeholders en \`<\` \`>\` tags. Wil je
die letterlijk tonen, escape je met apostrofs: \`'{'\` of \`'<'\`.

---

## 2. UI-componenten — altijd zelf bouwen

**Er komt NIETS uit een component library.** Niet uit shadcn/ui, Radix, MUI,
Chakra, Ant Design, HeadlessUI, DaisyUI, NextUI/HeroUI of wat dan ook.

Elke knop, input, select, checkbox, modal, drawer, dropdown, tooltip, tabel,
badge, card en avatar wordt **zelf geschreven** in \`src/components/ui/\`, met
Tailwind en de design tokens.

- \`npx shadcn@latest add ...\` wordt in dit project nooit gedraaid.
- Iconen komen **uitsluitend** uit \`react-icons\`. Nooit \`lucide-react\`.
- Utility-libraries zonder componenten (\`clsx\`, \`tailwind-merge\`) mogen wel.

Waarom: volledige controle over gedrag, styling, toegankelijkheid en
bundelgrootte, en geen upgrade-pijn van een externe library.

\`\`\`tsx
// src/components/ui/Button.tsx — voorbeeld van hoe het hoort
'use client'

import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
    ghost: 'hover:bg-muted'
}

export function Button({
    variant = 'primary',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
    return (
        <button
            className={\`focus-visible:ring-ring inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-50 \${VARIANTS[variant]} \${className}\`}
            {...props}
        />
    )
}
\`\`\`

---

## 3. Light/dark mode — altijd aanwezig

Elke app heeft light én dark mode, met een toggle in de UI.

| | |
|---|---|
| Mechanisme | class-based (\`@custom-variant dark\` in \`globals.css\`) |
| Opslag | \`theme\`-cookie, **nooit** localStorage |
| Waarden | \`light\`, \`dark\`, \`system\` |
| Provider | \`src/components/theme/ThemeProvider.tsx\` |
| Toggle | \`src/components/theme/ThemeToggle.tsx\` |

- De cookie wordt server-side gelezen in \`src/app/[locale]/layout.tsx\` en zet
  daar meteen de class op \`<html>\`: \`dark\`, geen class (light), of
  \`theme-system\` (CSS volgt dan \`prefers-color-scheme\`). Geen inline script,
  geen flits.
- **Gebruik altijd de design tokens** voor kleur: \`bg-background\`,
  \`text-foreground\`, \`bg-card\`, \`text-card-foreground\`, \`border-border\`,
  \`text-muted-foreground\`, \`bg-primary\`, \`text-primary-foreground\`,
  \`bg-muted\`, \`bg-destructive\`.
- **Nooit** \`bg-white\`, \`text-black\` of losse hex-kleuren in componenten —
  dan breekt dark mode. Nieuwe kleuren voeg je toe als token in
  \`globals.css\` (zowel in \`:root\` als in \`.dark\`).
`;

/** Schrijft PROJECT-RULES.md en voegt het regelblok toe aan AGENTS.md. */
export function setupRules(target: string): void {
  fs.writeFileSync(path.join(target, "PROJECT-RULES.md"), PROJECT_RULES, "utf8");

  const agentsFile = path.join(target, "AGENTS.md");
  const existing = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, "utf8") : "";
  if (!existing.includes("<!-- BEGIN:project-rules -->")) {
    fs.writeFileSync(agentsFile, existing.trimEnd() + "\n" + AGENTS_BLOCK, "utf8");
  }
}
