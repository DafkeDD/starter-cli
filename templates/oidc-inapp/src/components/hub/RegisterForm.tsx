'use client'
import { Icon } from '@/components/hub/ui/icons'
import { Btn, Field, Input } from '@/components/hub/ui/primitives'

/**
 * Account aanmaken op de hub.
 *
 * Bewust één scherm en geen wizard: de hub weet alleen wat hij nodig heeft om
 * je te herkennen — naam, e-mail, wachtwoord. Alles daarna (praktijkgegevens,
 * apps, facturatie) hoort in de app thuis, niet in de identiteitsserver.
 */
export function RegisterForm({ uid, brand, error }: { uid: string; brand: string; error?: string }) {
    const post = `{{MOUNT}}/interaction/${encodeURIComponent(uid)}/register`
    const terug = `{{MOUNT}}/aanmelden/${encodeURIComponent(uid)}`

    return (
        <div className='auth-card fade-in'>
            <div className='auth-logo'>
                <div className='brand-mark'>
                    <Icon name='shield' />
                </div>
                <div>
                    <div className='brand-name'>{brand}</div>
                    <div className='brand-sub'>Registreren</div>
                </div>
            </div>

            <h1 className='t-h1' style={{ fontSize: 23 }}>
                Account aanmaken
            </h1>
            <p style={{ marginTop: 7, marginBottom: 26 }}>
                Eén account voor alle apps van {brand}.
            </p>

            {error && (
                <p
                    className='hint'
                    style={{ color: 'var(--red)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <Icon name='alert' size={13} /> {error}
                </p>
            )}

            <form
                method='post'
                action={post}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
                <Field label='Naam'>
                    <Input icon='user' name='name' placeholder='Voornaam Achternaam' required autoFocus />
                </Field>
                <Field label='E-mailadres'>
                    <Input icon='mail' type='email' name='email' placeholder='jij@voorbeeld.be' required />
                </Field>
                <Field label='Wachtwoord' hint='Minstens acht tekens.'>
                    <Input icon='lock' type='password' name='password' placeholder='••••••••••' minLength={8} required />
                </Field>
                <Btn variant='primary' size='lg' className='btn-block' iconRight='arrowRight' type='submit'>
                    Account aanmaken
                </Btn>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Heb je al een account?
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <a href={terug} className='btn btn-ghost btn-lg btn-block'>
                <Icon name='arrowLeft' size={16} />
                Terug naar aanmelden
            </a>
        </div>
    )
}
