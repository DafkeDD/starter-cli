import { AuthAside } from '@/components/hub/AuthAside'
import { LoginForm } from '@/components/hub/LoginForm'

const BRAND = '{{BRAND_NAME}}'

/**
 * Het inlogscherm dat de hub laat zien als er interactie nodig is.
 *
 * De hub proxyt /interaction/<uid> hiernaartoe en geeft in de query mee waar je
 * in de flow zit. Deze pagina bewaart zelf niets: de sessie, de stap en de
 * foutmelding komen allemaal van de hub.
 */
export default async function InteractionPage({
    params,
    searchParams
}: {
    params: Promise<{ uid: string }>
    searchParams: Promise<{ step?: string; error?: string; email?: string }>
}) {
    const { uid } = await params
    const query = await searchParams

    return (
        <div className='auth-wrap'>
            <AuthAside brand={BRAND} />
            <div className='auth-main'>
                <LoginForm
                    uid={uid}
                    brand={BRAND}
                    step={query.step === 'mfa' ? 'mfa' : 'idle'}
                    error={query.error}
                    email={query.email}
                />
            </div>
        </div>
    )
}
