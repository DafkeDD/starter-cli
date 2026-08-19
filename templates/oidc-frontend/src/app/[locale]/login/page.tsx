import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getUser, loginUrl } from '@/lib/auth'

/**
 * De eigen loginpagina van deze app.
 *
 * Let op: hier staat GEEN wachtwoordveld. Dat staat alleen op de OIDC-server.
 * Deze pagina is puur van jou om te stylen — pas hem gerust helemaal aan.
 */
export default async function LoginPage() {
    const t = await getTranslations('Login')
    const user = await getUser()

    // Al ingelogd? Dan hoef je hier niet te zijn.
    if (user) redirect('/')

    return (
        <main className='flex min-h-screen items-center justify-center p-8'>
            <div className='border-border bg-card text-card-foreground w-full max-w-md rounded-xl border p-8 text-center'>
                <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
                <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>{t('description')}</p>

                <a
                    href={loginUrl('/')}
                    className='bg-primary text-primary-foreground focus-visible:ring-ring mt-8 inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90'
                >
                    {t('button')}
                </a>

                <p className='text-muted-foreground mt-6 text-xs'>{t('hint')}</p>
            </div>
        </main>
    )
}
