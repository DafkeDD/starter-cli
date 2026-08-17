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
    appearance: "Appearance",
    activeLocale: "Active locale: {locale}",
    hint: "Translations live in the messages folder: en.json, de.json, nl.json, fr.json. Never hard-code visible text.",
  },
  de: {
    title: "next-intl funktioniert",
    description:
      "Diese Seite ist vollständig übersetzt. Wähle unten eine Sprache — der Text ändert sich ohne kompletten Seitenneuaufbau.",
    currentLanguage: "Aktuelle Sprache",
    appearance: "Darstellung",
    activeLocale: "Aktives Locale: {locale}",
    hint: "Übersetzungen liegen im messages-Ordner: en.json, de.json, nl.json, fr.json. Sichtbaren Text nie hart codieren.",
  },
  nl: {
    title: "next-intl werkt",
    description:
      "Deze pagina is volledig vertaald. Kies hieronder een taal — de tekst verandert zonder volledige herlaadbeurt.",
    currentLanguage: "Huidige taal",
    appearance: "Weergave",
    activeLocale: "Actieve locale: {locale}",
    hint: "Vertalingen staan in de map messages: en.json, de.json, nl.json, fr.json. Zichtbare tekst nooit hard coderen.",
  },
  fr: {
    title: "next-intl fonctionne",
    description:
      "Cette page est entièrement traduite. Choisissez une langue ci-dessous — le texte change sans rechargement complet.",
    currentLanguage: "Langue actuelle",
    appearance: "Apparence",
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

/** Vertalingen voor de theme-toggle. */
const THEME_MESSAGES: Record<string, Record<string, string>> = {
  en: { toggle: "Switch theme", light: "Light", dark: "Dark", system: "System" },
  de: { toggle: "Theme wechseln", light: "Hell", dark: "Dunkel", system: "System" },
  nl: { toggle: "Thema wisselen", light: "Licht", dark: "Donker", system: "Systeem" },
  fr: { toggle: "Changer de thème", light: "Clair", dark: "Sombre", system: "Système" },
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
import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { ThemeProvider, type Theme } from '@/components/theme/ThemeProvider'
import '../globals.css'

/** Class op <html> op basis van de cookie — server-side, dus geen flits. */
function themeClass(theme: Theme): string | undefined {
    if (theme === 'dark') return 'dark'
    if (theme === 'system') return 'theme-system'
    return undefined
}

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

    // Themavoorkeur uit de cookie (nooit localStorage).
    const cookieStore = await cookies()
    const cookieTheme = cookieStore.get('theme')?.value
    const initialTheme: Theme =
        cookieTheme === 'light' || cookieTheme === 'dark' || cookieTheme === 'system' ? cookieTheme : 'system'

    return (
        <html lang={locale} className={themeClass(initialTheme)} suppressHydrationWarning>
            <body className={\`\${geistSans.variable} \${geistMono.variable} antialiased\`}>
                <NextIntlClientProvider>
                    <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
                </NextIntlClientProvider>
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
import ThemeToggle from '@/components/theme/ThemeToggle'

export default async function Home() {
    const t = await getTranslations('HomePage')
    const locale = await getLocale()

    return (
        <main className='flex min-h-screen flex-col items-center justify-center gap-8 p-8'>
            <div className='border-border bg-card text-card-foreground w-full max-w-xl rounded-xl border p-8 text-center'>
                <h1 className='text-3xl font-semibold tracking-tight'>{t('title')}</h1>
                <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>{t('description')}</p>

                <div className='mt-8'>
                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                        {t('currentLanguage')}
                    </p>
                    <LocaleSwitcher />
                </div>

                <div className='mt-8'>
                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                        {t('appearance')}
                    </p>
                    <div className='flex justify-center'>
                        <ThemeToggle />
                    </div>
                </div>

                <p className='text-muted-foreground mt-8 font-mono text-xs'>{t('activeLocale', { locale })}</p>
                <p className='text-muted-foreground mt-2 text-xs'>{t('hint')}</p>
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
                            ? 'border-primary bg-primary text-primary-foreground font-medium'
                            : 'border-border hover:bg-muted')
                    }
                >
                    <span className='mr-1.5 text-xs opacity-70'>{l.short}</span>
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
      Theme: THEME_MESSAGES[locale],
    };
    write(
      path.join(target, "messages", `${locale}.json`),
      JSON.stringify(content, null, 4) + "\n",
    );
  }

}
