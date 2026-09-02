'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
    loginUrl,
    logoutUrl,
    children
}: {
    brand: string
    brandSub: string
    nav: NavItem[]
    /** Naam van de ingelogde gebruiker, of null. */
    user: string | null
    userSub: string
    /** Null als dit project geen OIDC heeft; dan staat er geen knop. */
    loginUrl: string | null
    logoutUrl: string | null
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const router = useRouter()
    const [drawer, setDrawer] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [userMenu, setUserMenu] = useState(false)
    const userRef = useRef<HTMLDivElement>(null)

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

    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

    const go = (href: string) => {
        router.push(href)
        setDrawer(false)
        setUserMenu(false)
    }

    return (
        <div className={'app-shell' + (collapsed ? ' rail-collapsed' : '')}>
            <div
                className={'sidebar-backdrop' + (drawer ? ' show' : '')}
                onClick={() => setDrawer(false)}
            />

            <aside className={'sidebar' + (drawer ? ' open' : '')}>
                <div className='rail-head'>
                    <div className='brand-mark'>
                        <Icon name='shield' />
                    </div>
                    <div className='rail-brand-text'>
                        <div className='rail-brand-name'>{brand}</div>
                        <div className='rail-brand-sub'>{brandSub}</div>
                    </div>
                    <button className='drawer-close' onClick={() => setDrawer(false)} aria-label='Sluiten'>
                        <Icon name='x' size={19} />
                    </button>
                </div>

                <nav className='rail-nav'>
                    {nav.map(item => (
                        <button
                            key={item.key}
                            className={'rail-item' + (isActive(item.href) ? ' active' : '')}
                            onClick={() => go(item.href)}
                            title={item.name}
                        >
                            <Icon name={item.icon} size={20} />
                            <span className='rail-label'>{item.name}</span>
                            {item.badge && <span className='rail-badge'>{item.badge}</span>}
                        </button>
                    ))}
                </nav>
            </aside>

            <div className='main'>
                <header className='topbar'>
                    <button className='nav-toggle' onClick={() => setDrawer(true)} aria-label='Menu'>
                        <Icon name='menu' size={20} />
                    </button>
                    <button
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

                        {user ? (
                            <div className='tb-user-wrap' ref={userRef}>
                                <button
                                    className={'tb-user' + (userMenu ? ' open' : '')}
                                    onClick={() => setUserMenu(o => !o)}
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
                        ) : (
                            loginUrl && (
                                <a href={loginUrl} className='btn btn-primary btn-sm'>
                                    <Icon name='user' size={15} />
                                    Aanmelden
                                </a>
                            )
                        )}
                    </div>
                </header>

                <div className='content'>{children}</div>
            </div>
        </div>
    )
}
