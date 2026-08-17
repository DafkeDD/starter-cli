import fs from "node:fs";
import path from "node:path";

/**
 * HARDE REGEL: elke gegenereerde frontend heeft light/dark mode.
 * Class-based dark mode (Tailwind 4 `@custom-variant`), voorkeur in een cookie
 * (nooit localStorage), en een no-flash script zodat er geen witte flits is.
 */

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

/** Design tokens + Tailwind 4 mapping. Overschrijft de globals.css van create-next-app. */
const GLOBALS_CSS = `@import 'tailwindcss';

/* ============================================================
   CLASS-BASED DARK MODE (Tailwind 4)
   ============================================================ */
@custom-variant dark (&:where(.dark, .dark *));

/* ============================================================
   DESIGN TOKENS — light
   ============================================================ */
:root {
    --background: 0 0% 100%;
    --foreground: 220 20% 10%;

    --card: 0 0% 100%;
    --card-foreground: 220 20% 10%;

    --primary: 160 84% 39%;
    --primary-foreground: 0 0% 100%;

    --secondary: 152 40% 96%;
    --secondary-foreground: 160 84% 25%;

    --muted: 160 20% 96%;
    --muted-foreground: 220 10% 45%;

    --accent: 20 80% 95%;
    --accent-foreground: 20 60% 35%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    --border: 160 15% 90%;
    --input: 160 15% 92%;
    --ring: 160 84% 39%;

    --radius: 0.75rem;
}

/* ============================================================
   DESIGN TOKENS — dark
   ============================================================ */
.dark {
    --background: 220 20% 8%;
    --foreground: 160 10% 95%;

    --card: 220 20% 10%;
    --card-foreground: 160 10% 95%;

    --primary: 160 70% 45%;
    --primary-foreground: 220 20% 8%;

    --secondary: 160 30% 15%;
    --secondary-foreground: 160 60% 80%;

    --muted: 220 15% 18%;
    --muted-foreground: 220 10% 60%;

    --accent: 220 15% 20%;
    --accent-foreground: 160 10% 90%;

    --destructive: 0 70% 50%;
    --destructive-foreground: 0 0% 100%;

    --border: 220 12% 20%;
    --input: 220 12% 20%;
    --ring: 160 70% 45%;
}

/* ============================================================
   TAILWIND 4 MAPPING — CSS-variabelen -> utility classes
   ============================================================ */
@theme inline {
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);

    --color-background: hsl(var(--background));
    --color-foreground: hsl(var(--foreground));

    --color-card: hsl(var(--card));
    --color-card-foreground: hsl(var(--card-foreground));

    --color-primary: hsl(var(--primary));
    --color-primary-foreground: hsl(var(--primary-foreground));

    --color-secondary: hsl(var(--secondary));
    --color-secondary-foreground: hsl(var(--secondary-foreground));

    --color-muted: hsl(var(--muted));
    --color-muted-foreground: hsl(var(--muted-foreground));

    --color-accent: hsl(var(--accent));
    --color-accent-foreground: hsl(var(--accent-foreground));

    --color-destructive: hsl(var(--destructive));
    --color-destructive-foreground: hsl(var(--destructive-foreground));

    --color-border: hsl(var(--border));
    --color-input: hsl(var(--input));
    --color-ring: hsl(var(--ring));

    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) + 4px);
}

/* ============================================================
   BASIS
   ============================================================ */
body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
}

html {
    color-scheme: light;
    transition:
        background-color 0.2s ease,
        color 0.2s ease;
}

html.dark {
    color-scheme: dark;
}

:focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
}
`;

/** Script dat vóór de eerste paint de juiste class zet — geen flits. */
export const NO_FLASH_SCRIPT =
  "(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);" +
  "var t=m?decodeURIComponent(m[1]):'system';" +
  "var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
  "document.documentElement.classList.toggle('dark',d);}catch(e){}})()";

const THEME_PROVIDER = `'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
    /** Voorkeur van de gebruiker. */
    theme: Theme
    /** Wat er echt getoond wordt — altijd light of dark. */
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
    /** Wisselt light -> dark -> system -> light. */
    cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const ORDER: Theme[] = ['light', 'dark', 'system']

function prefersDark(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(theme: Theme): 'light' | 'dark' {
    if (theme === 'system') return prefersDark() ? 'dark' : 'light'
    return theme
}

/**
 * Beheert light/dark mode. De voorkeur staat in een cookie (nooit localStorage),
 * zodat de server hem kan lezen en het no-flash script hem vóór de paint toepast.
 */
export function ThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme?: Theme }) {
    const [theme, setThemeState] = useState<Theme>(initialTheme ?? 'system')
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(initialTheme === 'dark' ? 'dark' : 'light')

    // Class op <html> synchroon houden met de voorkeur.
    useEffect(() => {
        const current = resolve(theme)
        setResolvedTheme(current)
        document.documentElement.classList.toggle('dark', current === 'dark')

        if (theme !== 'system') return

        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = (e: MediaQueryListEvent) => {
            setResolvedTheme(e.matches ? 'dark' : 'light')
            document.documentElement.classList.toggle('dark', e.matches)
        }
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [theme])

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next)
        document.cookie = \`theme=\${next}; path=/; max-age=31536000; SameSite=Lax\`
    }, [])

    const cycleTheme = useCallback(() => {
        setThemeState(prev => {
            const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length]
            document.cookie = \`theme=\${next}; path=/; max-age=31536000; SameSite=Lax\`
            return next
        })
    }, [])

    const value = useMemo(
        () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
        [theme, resolvedTheme, setTheme, cycleTheme]
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme moet binnen ThemeProvider gebruikt worden')
    return ctx
}
`;

const THEME_TOGGLE = `'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MdComputer, MdDarkMode, MdLightMode } from 'react-icons/md'
import { useTheme, type Theme } from './ThemeProvider'

const ICONS: Record<Theme, React.ComponentType<{ size?: number }>> = {
    light: MdLightMode,
    dark: MdDarkMode,
    system: MdComputer
}

/**
 * Knop die wisselt tussen light, dark en system.
 * Zelf gebouwd — geen component library.
 */
export default function ThemeToggle() {
    const t = useTranslations('Theme')
    const { theme, cycleTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    // Pas na mount renderen: de server kent 'system' nog niet als light of dark.
    useEffect(() => setMounted(true), [])

    const Icon = ICONS[theme]

    return (
        <button
            type='button'
            onClick={cycleTheme}
            aria-label={t('toggle')}
            title={t('toggle')}
            className='border-border hover:bg-muted flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors'
        >
            <Icon size={16} />
            <span suppressHydrationWarning>{mounted ? t(theme) : ''}</span>
        </button>
    )
}
`;

/** Schrijft globals.css, de ThemeProvider en de ThemeToggle. */
export function setupTheme(target: string): void {
  const src = path.join(target, "src");

  write(path.join(src, "app", "globals.css"), GLOBALS_CSS);
  write(path.join(src, "components", "theme", "ThemeProvider.tsx"), THEME_PROVIDER);
  write(path.join(src, "components", "theme", "ThemeToggle.tsx"), THEME_TOGGLE);
}
