import { Shell, type NavItem } from './Shell'
{{USER_IMPORT}}

const BRAND = '{{BRAND_NAME}}'

/**
 * De schil om je pagina's heen.
 *
 * Server component: hij haalt de ingelogde gebruiker op en geeft alleen de
 * naam door aan de client. Zo blijft het access token waar het hoort - op de
 * server - en staat er niets gevoeligs in je HTML.
 *
 * De navigatie is bewust één knop. Voeg er hieronder gewoon regels bij; de
 * actieve staat volgt vanzelf uit het pad.
 */
const NAV: NavItem[] = [{ key: 'home', name: 'Start', icon: 'dashboard', href: '/' }]

export default async function AppShell({ children }: { children: React.ReactNode }) {
{{USER_LOOKUP}}
    return (
        <Shell
            brand={BRAND}
            brandSub='{{BRAND_SUB}}'
            nav={NAV}
            user={user}
            userSub={userSub}
            loginUrl={loginUrl_}
            logoutUrl={logoutUrl_}
        >
            {children}
        </Shell>
    )
}
