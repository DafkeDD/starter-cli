import { getTranslations } from 'next-intl/server'
import { getUser, loginUrl, logoutUrl } from '@/lib/auth'

/**
 * Toont wie er ingelogd is, met een uitlogknop — of een inlogknop.
 * Zelf gebouwd, geen component library.
 */
export default async function UserBadge() {
    const t = await getTranslations('Auth')
    const user = await getUser()

    if (!user) {
        return (
            <a
                href={loginUrl('/')}
                className='border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors'
            >
                {t('login')}
            </a>
        )
    }

    return (
        <div className='flex items-center gap-3'>
            <span className='text-sm'>
                {user.name ?? user.email}
                {user.role === 'admin' && (
                    <span className='bg-primary text-primary-foreground ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold'>
                        {t('admin')}
                    </span>
                )}
            </span>
            <a
                href={logoutUrl()}
                className='border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors'
            >
                {t('logout')}
            </a>
        </div>
    )
}
