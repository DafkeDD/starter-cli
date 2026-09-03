'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/design/icons'
import { Avatar } from '@/components/design/primitives'
import ThemeToggle from '@/components/theme/ThemeToggle'

/**
 * De schil van de app: sidebar links, topbar boven, jouw pagina ertussen.
 *
 * Overgenomen uit het Pasport-design, met twee verschillen:
 *
 *  - Het thema komt van de ThemeToggle die er al was (cookie, server-side
 *    gezet, dus geen flits bij het laden). Het design kleurt mee via
 *    [data-theme="dark"] op <html> - dat attribuut zet de ThemeProvider al.
 *  - Geen framer-motion. Het gebruikersmenu klapt open met CSS; dat scheelt
 *    een dependency voor een animatie van 160 milliseconden.
 */
export interface NavItem {
    key: string
    name: string
    icon: string
    href: string
    badge?: string
}

export function Shell({
    brand,
    brandSub,
    nav,
    user,
    userSub,
    logoutUrl,
    children
}: {
    brand: string
    brandSub: string
    nav: NavItem[]
    /**
     * Naam van de ingelogde gebruiker.
     *
     * Null kan alleen in een project zonder login; de schil zelf verschijnt
     * pas na het aanmelden - zie AppShell.
     */
    user: string | null
    userSub: string
    logoutUrl: string | null
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const [drawer, setDrawer] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [userMenu, setUserMenu] = useState(false)
    const userRef = useRef<HTMLDivElement>(null)
    const userButtonRef = useRef<HTMLButtonElement>(null)
    const menuButtonRef = useRef<HTMLButtonElement>(null)

    // Alleen op een smal scherm is de sidebar een uitschuifmenu. Breder staat
    // hij gewoon naast je pagina en hoort hij niet uit de tabvolgorde.
    const [smal, setSmal] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 860px)')
        const volg = () => setSmal(mq.matches)
        volg()
        mq.addEventListener('change', volg)
        return () => mq.removeEventListener('change', volg)
    }, [])

    // De ingeklapte sidebar onthouden. Alleen een voorkeur, dus localStorage
    // volstaat - er hoeft niets van naar de server.
    useEffect(() => {
        setCollapsed(localStorage.getItem('rail') === 'collapsed')
    }, [])
    useEffect(() => {
        localStorage.setItem('rail', collapsed ? 'collapsed' : 'expanded')
    }, [collapsed])

    // Achtergrond niet laten meescrollen zolang het menu openstaat.
    useEffect(() => {
        document.body.style.overflow = drawer ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [drawer])

    // Klik naast het gebruikersmenu sluit het.
    useEffect(() => {
        if (!userMenu) return
        const onClick = (e: MouseEvent) => {
            if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenu(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [userMenu])

    // Escape sluit wat er openstaat, en de focus gaat terug naar de knop die het
    // opende. Zonder dat laatste staat de focus na het sluiten nergens en moet
    // je met de tab-toets opnieuw de hele pagina door.
    useEffect(() => {
        if (!userMenu && !drawer) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (userMenu) {
                setUserMenu(false)
                userButtonRef.current?.focus()
            } else {
                setDrawer(false)
                menuButtonRef.current?.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [userMenu, drawer])

    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

    return (
        <div className={'app-shell' + (collapsed ? ' rail-collapsed' : '')}>
            <button
                type='button'
                className={'sidebar-backdrop' + (drawer ? ' show' : '')}
                onClick={() => setDrawer(false)}
                tabIndex={-1}
                aria-label='Menu sluiten'
            />

            {/* inert haalt de dichtgeschoven sidebar uit de tabvolgorde. Hij
                staat er op een telefoon nog wel, alleen 100% naar links; zonder
                dit tab je dus door een menu dat je niet ziet. Alleen op smalle
                schermen: op een breed scherm staat hij gewoon open. */}
            <aside className={'sidebar' + (drawer ? ' open' : '')} inert={smal && !drawer}>
                <div className='rail-head'>
                    <div className='brand-mark'>
                        <Icon name='shield' />
                    </div>
                    <div className='rail-brand-text'>
                        <div className='rail-brand-name'>{brand}</div>
                        <div className='rail-brand-sub'>{brandSub}</div>
                    </div>
                    <button type='button' className='drawer-close' onClick={() => setDrawer(false)} aria-label='Menu sluiten'>
                        <Icon name='x' size={19} />
                    </button>
                </div>

                <nav className='rail-nav'>
                    {/* Echte links en geen knoppen: zo werken middenklik,
                        "openen in nieuw tabblad" en de statusbalk van de browser
                        gewoon. aria-current vertelt een schermlezer welke pagina
                        je bekijkt - de CSS-klasse alleen zegt daar niets over. */}
                    {nav.map(item => (
                        <Link
                            key={item.key}
                            href={item.href}
                            className={'rail-item' + (isActive(item.href) ? ' active' : '')}
                            title={item.name}
                            aria-current={isActive(item.href) ? 'page' : undefined}
                            onClick={() => {
                                setDrawer(false)
                                setUserMenu(false)
                            }}
                        >
                            <Icon name={item.icon} size={20} />
                            <span className='rail-label'>{item.name}</span>
                            {item.badge && <span className='rail-badge'>{item.badge}</span>}
                        </Link>
                    ))}
                </nav>
            </aside>

            <div className='main'>
                <header className='topbar'>
                    <button
                        type='button'
                        ref={menuButtonRef}
                        className='nav-toggle'
                        onClick={() => setDrawer(true)}
                        aria-label='Menu openen'
                        aria-expanded={drawer}
                    >
                        <Icon name='menu' size={20} />
                    </button>
                    <button
                        type='button'
                        className='rail-toggle'
                        onClick={() => setCollapsed(c => !c)}
                        aria-label={collapsed ? 'Sidebar uitklappen' : 'Sidebar inklappen'}
                    >
                        <Icon name='menu' size={20} />
                    </button>

                    <div className='topbar-spacer' />

                    <div className='tb-right'>
                        <ThemeToggle />
                        <span className='tb-divider' />

                        {user && (
                            <div className='tb-user-wrap' ref={userRef}>
                                <button
                                    type='button'
                                    ref={userButtonRef}
                                    className={'tb-user' + (userMenu ? ' open' : '')}
                                    onClick={() => setUserMenu(o => !o)}
                                    aria-expanded={userMenu}
                                    aria-haspopup='menu'
                                >
                                    <div className='tb-user-text'>
                                        <div className='tb-user-name'>{user}</div>
                                        <div className='tb-user-sub'>{userSub}</div>
                                    </div>
                                    <Avatar name={user} size={36} />
                                    <Icon
                                        name='chevronDown'
                                        size={15}
                                        className={'uc-caret' + (userMenu ? ' up' : '')}
                                    />
                                </button>

                                {userMenu && logoutUrl && (
                                    <div className='tb-user-pop pop-in'>
                                        <a className='user-pop-item danger' href={logoutUrl}>
                                            <Icon name='logout' size={16} />
                                            Afmelden
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                <div className='content'>{children}</div>
            </div>
        </div>
    )
}
