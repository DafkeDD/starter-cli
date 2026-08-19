import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { backendFetch, getUser } from '@/lib/auth'
import UserTable from '@/components/admin/UserTable'

/**
 * Beheerpaneel. Alleen voor gebruikers met de rol `admin`.
 *
 * De echte controle gebeurt in de backend én in de OIDC-server; deze pagina
 * verstopt alleen de knoppen. Dat is bewust: UI-checks zijn nooit de beveiliging.
 */
export default async function AdminPage() {
    const t = await getTranslations('Admin')
    const user = await getUser()

    if (!user) redirect('/login')

    if (user.role !== 'admin') {
        return (
            <main className='flex min-h-screen items-center justify-center p-8'>
                <div className='border-border bg-card text-card-foreground w-full max-w-md rounded-xl border p-8 text-center'>
                    <h1 className='text-xl font-semibold'>{t('denied')}</h1>
                    <p className='text-muted-foreground mt-3 text-sm'>
                        {t('deniedBody', { role: user.role ?? 'user' })}
                    </p>
                </div>
            </main>
        )
    }

    const [usersRes, clientsRes] = await Promise.all([
        backendFetch('/api/admin/users'),
        backendFetch('/api/admin/clients')
    ])

    if (!usersRes.ok) {
        return (
            <main className='p-8'>
                <p className='text-destructive text-sm'>{t('loadError', { status: usersRes.status })}</p>
            </main>
        )
    }

    const { users } = (await usersRes.json()) as { users: AdminUser[] }
    const { clients } = clientsRes.ok
        ? ((await clientsRes.json()) as { clients: AdminClient[] })
        : { clients: [] }

    return (
        <main className='mx-auto max-w-4xl p-8'>
            <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>

            <h2 className='mt-8 mb-3 text-sm font-medium'>{t('users', { count: users.length })}</h2>
            <UserTable users={users} />

            <h2 className='mt-10 mb-3 text-sm font-medium'>{t('clients', { count: clients.length })}</h2>
            <div className='border-border overflow-hidden rounded-lg border'>
                <table className='w-full text-sm'>
                    <thead className='bg-muted text-muted-foreground'>
                        <tr>
                            <th className='px-3 py-2 text-left font-medium'>{t('clientId')}</th>
                            <th className='px-3 py-2 text-left font-medium'>{t('name')}</th>
                            <th className='px-3 py-2 text-left font-medium'>{t('redirectUris')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(c => (
                            <tr key={c.client_id} className='border-border border-t'>
                                <td className='px-3 py-2 font-mono text-xs'>{c.client_id}</td>
                                <td className='px-3 py-2'>{c.branding}</td>
                                <td className='text-muted-foreground px-3 py-2 font-mono text-xs'>
                                    {c.redirect_uris.join(', ')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </main>
    )
}

export interface AdminUser {
    id: string
    name: string
    email: string
    role: string
    blocked: boolean
    createdAt: string
    isSelf: boolean
}

interface AdminClient {
    client_id: string
    branding: string
    redirect_uris: string[]
}
