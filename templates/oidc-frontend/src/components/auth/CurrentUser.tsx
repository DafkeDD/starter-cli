import { Fragment } from 'react'
import { getTranslations } from 'next-intl/server'
import { getUser, loginUrl } from '@/lib/auth'

/**
 * Toont wie er is ingelogd, met de gegevens die uit het id_token komen.
 *
 * Server component: de sessie leeft in de backend en het access token blijft
 * daar. Deze component vraagt alleen /auth/me op en stuurt de cookie van de
 * bezoeker mee — er gaat dus niets gevoeligs naar de browser.
 */
export default async function CurrentUser() {
    const t = await getTranslations('Auth')
    const user = await getUser()

    if (!user) {
        return (
            <div className='border-border rounded-lg border border-dashed p-5 text-center'>
                <p className='text-muted-foreground text-sm'>{t('notSignedIn')}</p>
                <a
                    href={loginUrl('/')}
                    className='border-border hover:bg-muted mt-3 inline-flex h-9 items-center rounded-md border px-3 text-sm transition-colors'
                >
                    {t('login')}
                </a>
            </div>
        )
    }

    // Alleen tonen wat de hub echt meestuurde; lege velden slaan we over.
    const rows: [label: string, value: string | undefined][] = [
        [t('name'), user.name],
        [t('email'), user.email],
        [t('role'), user.role],
        [t('id'), user.sub]
    ]

    return (
        <div className='border-border rounded-lg border p-5 text-left'>
            <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                {t('signedInAs')}
            </p>
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm'>
                {rows
                    .filter(([, value]) => Boolean(value))
                    .map(([label, value]) => (
                        <Fragment key={label}>
                            <dt className='text-muted-foreground'>{label}</dt>
                            <dd className='font-mono break-all'>{value}</dd>
                        </Fragment>
                    ))}
            </dl>
        </div>
    )
}
