'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { AdminUser } from '@/app/[locale]/admin/page'

/**
 * Gebruikerstabel met blokkeer-knoppen. Zelf gebouwd, geen component library.
 * De actie gaat naar de backend, die hem doorgeeft aan de OIDC-server.
 */
export default function UserTable({ users }: { users: AdminUser[] }) {
    const t = useTranslations('Admin')
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    async function toggleBlocked(id: string, blocked: boolean) {
        setError(null)
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL ?? '{{BACKEND_URL}}'}/api/admin/users/${id}/blocked`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ blocked })
            }
        )

        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string }
            setError(body.error ?? `HTTP ${res.status}`)
            return
        }
        startTransition(() => router.refresh())
    }

    return (
        <>
            {error && <p className='text-destructive mb-2 text-sm'>{error}</p>}
            <div className='border-border overflow-hidden rounded-lg border'>
                <table className='w-full text-sm'>
                    <thead className='bg-muted text-muted-foreground'>
                        <tr>
                            <th className='px-3 py-2 text-left font-medium'>{t('name')}</th>
                            <th className='px-3 py-2 text-left font-medium'>{t('email')}</th>
                            <th className='px-3 py-2 text-left font-medium'>{t('role')}</th>
                            <th className='px-3 py-2 text-left font-medium'>{t('status')}</th>
                            <th className='px-3 py-2' />
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} className='border-border border-t'>
                                <td className='px-3 py-2'>
                                    {u.name}
                                    {u.isSelf && (
                                        <span className='text-muted-foreground ml-2 text-xs'>{t('you')}</span>
                                    )}
                                </td>
                                <td className='text-muted-foreground px-3 py-2'>{u.email}</td>
                                <td className='px-3 py-2'>{u.role}</td>
                                <td className='px-3 py-2'>
                                    {u.blocked ? (
                                        <span className='text-destructive'>{t('blocked')}</span>
                                    ) : (
                                        <span>{t('active')}</span>
                                    )}
                                </td>
                                <td className='px-3 py-2 text-right'>
                                    {u.isSelf ? (
                                        <span className='text-muted-foreground'>—</span>
                                    ) : (
                                        <button
                                            type='button'
                                            disabled={isPending}
                                            onClick={() => toggleBlocked(u.id, !u.blocked)}
                                            className='border-border hover:bg-muted rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50'
                                        >
                                            {u.blocked ? t('unblock') : t('block')}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
