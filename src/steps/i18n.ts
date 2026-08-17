import fs from "node:fs";
import path from "node:path";

/**
 * HARDE REGEL: elke gegenereerde frontend gebruikt next-intl, ALTIJD, met
 * exact deze 4 talen. Engels is de standaardtaal.
 * Dit is bewust geen vraag in de CLI — het staat vast.
 */
export const LOCALES = ["en", "de", "nl", "fr"] as const;
export const DEFAULT_LOCALE = "en";

/** Labels voor de taalkiezer. */
const LOCALE_LABELS: Record<string, { label: string; short: string }> = {
  en: { label: "English", short: "EN" },
  de: { label: "Deutsch", short: "DE" },
  nl: { label: "Nederlands", short: "NL" },
  fr: { label: "Français", short: "FR" },
};

/** Vertalingen voor de demo-pagina. */
const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    title: "next-intl works",
    description:
      "This page is fully translated. Pick a language below — the text changes without a full page reload.",
    currentLanguage: "Current language",
    activeLocale: "Active locale: {locale}",
    hint: "Translations live in the messages folder: en.json, de.json, nl.json, fr.json. Never hard-code visible text.",
  },
  de: {
    title: "next-intl funktioniert",
    description:
      "Diese Seite ist vollständig übersetzt. Wähle unten eine Sprache — der Text ändert sich ohne kompletten Seitenneuaufbau.",
    currentLanguage: "Aktuelle Sprache",
    activeLocale: "Aktives Locale: {locale}",
    hint: "Übersetzungen liegen im messages-Ordner: en.json, de.json, nl.json, fr.json. Sichtbaren Text nie hart codieren.",
  },
  nl: {
    title: "next-intl werkt",
    description:
      "Deze pagina is volledig vertaald. Kies hieronder een taal — de tekst verandert zonder volledige herlaadbeurt.",
    currentLanguage: "Huidige taal",
    activeLocale: "Actieve locale: {locale}",
    hint: "Vertalingen staan in de map messages: en.json, de.json, nl.json, fr.json. Zichtbare tekst nooit hard coderen.",
  },
  fr: {
    title: "next-intl fonctionne",
    description:
      "Cette page est entièrement traduite. Choisissez une langue ci-dessous — le texte change sans rechargement complet.",
    currentLanguage: "Langue actuelle",
    activeLocale: "Locale active : {locale}",
    hint: "Les traductions se trouvent dans le dossier messages : en.json, de.json, nl.json, fr.json. Ne jamais coder en dur le texte visible.",
  },
};

const SWITCHER_LABEL: Record<string, string> = {
  en: "Language",
  de: "Sprache",
  nl: "Taal",
  fr: "Langue",
};

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function removeIfExists(file: string): void {
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

/**
 * Zet next-intl op in een verse create-next-app (App Router, [locale]-segment,
 * localePrefix "never" zodat de taal via cookie gaat en niet in de URL staat).
 *
 * Volgt https://next-intl.dev en https://i18nexus.com/tutorials/nextjs/next-intl
 */
export function setupNextIntl(target: string): void {
  const src = path.join(target, "src");
  const appDir = path.join(src, "app");
  const localeDir = path.join(appDir, "[locale]");
  const localeList = LOCALES.map((l) => `'${l}'`).join(", ");

  // De [locale]-layout wordt de root-layout: oude root-bestanden weg.
  removeIfExists(path.join(appDir, "layout.tsx"));
  removeIfExists(path.join(appDir, "page.tsx"));
  removeIfExists(path.join(appDir, "page.module.css"));

  // ---- src/i18n/routing.ts ------------------------------------------------
  write(
    path.join(src, "i18n", "routing.ts"),
    `import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
    locales: [${localeList}],
    defaultLocale: '${DEFAULT_LOCALE}',
    // Geen taal in de URL (/about i.p.v. /en/about); de locale gaat via cookie.
    localePrefix: 'never'
})
`,
  );

  // ---- src/i18n/navigation.ts ---------------------------------------------
  write(
    path.join(src, "i18n", "navigation.ts"),
    `import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
`,
  );

  // ---- src/i18n/request.ts ------------------------------------------------
  write(
    path.join(src, "i18n", "request.ts"),
    `import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale
    const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

    return {
        locale,
        messages: (await import(\`../../messages/\${locale}.json\`)).default
    }
})
`,
  );

  // ---- src/proxy.ts (heette middleware.ts vóór Next.js 16) ----------------
  removeIfExists(path.join(src, "middleware.ts"));
  removeIfExists(path.join(target, "middleware.ts"));
  write(
    path.join(src, "proxy.ts"),
    `import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
    // Alles behalve api, trpc, _next, _vercel en bestanden met een extensie.
    matcher: '/((?!api|trpc|_next|_vercel|.*\\\\..*).*)'
}
`,
  );

  // ---- next.config.ts -----------------------------------------------------
  for (const f of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
    removeIfExists(path.join(target, f));
  }
  write(
    path.join(target, "next.config.ts"),
    `import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)
`,
  );

  // ---- src/app/[locale]/layout.tsx ---------------------------------------
  write(
    path.join(localeDir, "layout.tsx"),
    `import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import '../globals.css'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
})

export const metadata: Metadata = {
    title: 'App',
    description: 'Next.js starter met next-intl (${LOCALES.join("/")})'
}

export function generateStaticParams() {
    return routing.locales.map(locale => ({ locale }))
}

export default async function RootLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params

    // Onbekende taal -> 404.
    if (!hasLocale(routing.locales, locale)) {
        notFound()
    }

    // Locale beschikbaar maken voor server-side vertalingen.
    setRequestLocale(locale)

    return (
        <html lang={locale} suppressHydrationWarning>
            <body className={\`\${geistSans.variable} \${geistMono.variable} antialiased\`}>
                <NextIntlClientProvider>{children}</NextIntlClientProvider>
            </body>
        </html>
    )
}
`,
  );

  // ---- src/app/[locale]/page.tsx -----------------------------------------
  write(
    path.join(localeDir, "page.tsx"),
    `import { getLocale, getTranslations } from 'next-intl/server'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default async function Home() {
    const t = await getTranslations('HomePage')
    const locale = await getLocale()

    return (
        <main className='flex min-h-screen flex-col items-center justify-center gap-8 p-8'>
            <div className='w-full max-w-xl rounded-xl border border-black/10 p-8 text-center dark:border-white/15'>
                <h1 className='text-3xl font-semibold tracking-tight'>{t('title')}</h1>
                <p className='mt-3 text-sm leading-relaxed opacity-70'>{t('description')}</p>

                <div className='mt-8'>
                    <p className='mb-3 text-xs font-medium tracking-wide uppercase opacity-50'>
                        {t('currentLanguage')}
                    </p>
                    <LocaleSwitcher />
                </div>

                <p className='mt-8 font-mono text-xs opacity-50'>{t('activeLocale', { locale })}</p>
                <p className='mt-2 text-xs opacity-50'>{t('hint')}</p>
            </div>
        </main>
    )
}
`,
  );

  // ---- src/components/LocaleSwitcher.tsx ---------------------------------
  const localeButtons = LOCALES.map((l) => {
    const meta = LOCALE_LABELS[l];
    return `    { code: '${l}', label: '${meta.label}', short: '${meta.short}' }`;
  }).join(",\n");

  write(
    path.join(src, "components", "LocaleSwitcher.tsx"),
    `'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'

const LOCALES = [
${localeButtons}
] as const

export default function LocaleSwitcher() {
    const t = useTranslations('LocaleSwitcher')
    const locale = useLocale()
    const router = useRouter()
    const pathname = usePathname()
    const [isPending, startTransition] = useTransition()

    function switchLocale(next: string) {
        if (next === locale) return
        startTransition(() => {
            router.replace(pathname, { locale: next })
            router.refresh()
        })
    }

    return (
        <div className='flex flex-wrap items-center justify-center gap-2' aria-label={t('label')}>
            {LOCALES.map(l => (
                <button
                    key={l.code}
                    type='button'
                    disabled={isPending}
                    onClick={() => switchLocale(l.code)}
                    aria-current={l.code === locale}
                    className={
                        'rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ' +
                        (l.code === locale
                            ? 'border-foreground bg-foreground text-background font-medium'
                            : 'border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10')
                    }
                >
                    <span className='mr-1.5 text-xs opacity-60'>{l.short}</span>
                    {l.label}
                </button>
            ))}
        </div>
    )
}
`,
  );

  // ---- messages/<locale>.json --------------------------------------------
  for (const locale of LOCALES) {
    const content = {
      HomePage: MESSAGES[locale],
      LocaleSwitcher: { label: SWITCHER_LABEL[locale] },
    };
    write(
      path.join(target, "messages", `${locale}.json`),
      JSON.stringify(content, null, 4) + "\n",
    );
  }

  // ---- Harde regel vastleggen voor het project ---------------------------
  const rulesBlock = `
<!-- BEGIN:i18n-rules -->

# i18n — harde regel (niet verwijderen)

Deze frontend gebruikt **altijd** \`next-intl\`, in ${LOCALES.length} talen:
${LOCALES.map((l) => `\`${l}\``).join(", ")}. Standaardtaal is \`${DEFAULT_LOCALE}\`.

- Zichtbare tekst wordt **nooit** hard gecodeerd — altijd \`useTranslations()\`
  (client) of \`getTranslations()\` (server).
- Elke nieuwe key wordt toegevoegd in **alle** bestanden onder \`messages/\`.
- Nieuwe pagina's komen onder \`src/app/[locale]/\`, nooit direct onder \`src/app/\`.
- Interne navigatie gaat via \`@/i18n/navigation\`, niet via \`next/link\` of
  \`next/navigation\`.

Volledige uitleg: zie \`I18N.md\`.

<!-- END:i18n-rules -->
`;

  const agentsFile = path.join(target, "AGENTS.md");
  const existingAgents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, "utf8") : "";
  if (!existingAgents.includes("<!-- BEGIN:i18n-rules -->")) {
    write(agentsFile, existingAgents.trimEnd() + "\n" + rulesBlock);
  }

  write(
    path.join(target, "I18N.md"),
    `# i18n — harde regel

Deze frontend gebruikt **altijd** \`next-intl\`. Dit is geen keuze en wordt niet uitgezet.

## Vaste instellingen

| | |
|---|---|
| Talen | ${LOCALES.map((l) => `\`${l}\` (${LOCALE_LABELS[l].label})`).join(", ")} |
| Standaardtaal | \`${DEFAULT_LOCALE}\` (Engels) |
| URL-prefix | \`never\` — de taal staat niet in de URL, maar in een cookie |
| Vertalingen | \`messages/<locale>.json\` |
| Routing | \`src/app/[locale]/...\` |

## Regels

1. **Geen enkele zichtbare tekst wordt hard gecodeerd.** Alle tekst die een
   gebruiker ziet, komt uit \`useTranslations()\` (client) of
   \`getTranslations()\` (server).
2. **Elke nieuwe key wordt in alle ${LOCALES.length} bestanden toegevoegd**
   (${LOCALES.map((l) => `\`messages/${l}.json\``).join(", ")}). Een key die in
   één taal ontbreekt, is een bug.
3. **Nieuwe pagina's komen onder \`src/app/[locale]/\`.** Nooit rechtstreeks
   onder \`src/app/\`, want dan mist de locale-context.
4. **Navigatie gebruikt \`@/i18n/navigation\`** (\`Link\`, \`useRouter\`,
   \`redirect\`, \`usePathname\`) — nooit \`next/link\` of \`next/navigation\`
   voor interne links.
5. **Talen toevoegen of wijzigen** doe je in \`src/i18n/routing.ts\` én in
   \`messages/\`. Nergens anders.

## Voorbeeld

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
`,
  );
}
