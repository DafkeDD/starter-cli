'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { Btn, Field, Input, Badge } from '@/components/ui/primitives'
import { OtpInput } from '@/components/OtpInput'

/**
 * Het inlogscherm van de hub.
 *
 * Bewust gewone <form method="post">-formulieren, geen fetch. Deze pagina wordt
 * door de hub geproxyd, dus een relatieve action landt op de hub zelf en de
 * _interaction-cookie gaat gewoon mee. Geen CORS, geen JavaScript nodig om in
 * te loggen — de tabs en de OTP-vakjes zijn het enige wat React hier doet.
 *
 * De stap wordt door de hub bepaald, niet hier: die stuurt je na een geslaagd
 * wachtwoord terug met ?step=mfa. Zo staat de waarheid over waar je in de flow
 * zit op de server, waar hij hoort.
 */
export function LoginForm({
    uid,
    brand,
    step,
    error,
    email
}: {
    uid: string
    brand: string
    step: 'idle' | 'mfa'
    error?: string
    email?: string
}) {
    const [tab, setTab] = useState<'eid' | 'email'>('email')

    const action = (path: string) => `{{MOUNT}}/interaction/${encodeURIComponent(uid)}/${path}`

    return (
        <div className='auth-card fade-in'>
            <div className='auth-logo'>
                <div className='brand-mark'>
                    <Icon name='shield' />
                </div>
                <div>
                    <div className='brand-name'>{brand}</div>
                    <div className='brand-sub'>Aanmelden</div>
                </div>
            </div>

            <h1 className='t-h1' style={{ fontSize: 23 }}>
                {step === 'mfa' ? 'Twee-stapsverificatie' : 'Welkom terug'}
            </h1>
            <p style={{ marginTop: 7, marginBottom: 26 }}>
                {step === 'mfa'
                    ? 'Voer de code uit je authenticator-app in om aan te melden.'
                    : 'Meld je aan om verder te gaan naar de app.'}
            </p>

            {error && (
                <p
                    className='hint'
                    style={{ color: 'var(--red)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <Icon name='alert' size={13} /> {error}
                </p>
            )}

            {step === 'mfa' ? <MfaStep action={action('mfa')} error={Boolean(error)} /> : null}

            {step === 'idle' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className='seg' style={{ display: 'flex' }}>
                        <button
                            type='button'
                            className={tab === 'eid' ? 'active' : ''}
                            style={{ flex: 1 }}
                            onClick={() => setTab('eid')}
                        >
                            eID / itsme®
                        </button>
                        <button
                            type='button'
                            className={tab === 'email' ? 'active' : ''}
                            style={{ flex: 1 }}
                            onClick={() => setTab('email')}
                        >
                            E-mail
                        </button>
                    </div>

                    {tab === 'eid' ? <EidTab /> : <EmailTab action={action('login')} email={email} />}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span
                            style={{
                                fontSize: 12.5,
                                color: 'var(--text-3)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Nog geen account?
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>

                    {/* Een <a> mag geen <button> bevatten, dus dit is een link die
                        de knopstijl leent in plaats van een Btn in een link. */}
                    <a href={action('register')} className='btn btn-ghost btn-lg btn-block'>
                        <Icon name='plus' size={16} />
                        Account aanmaken
                    </a>
                </div>
            )}
        </div>
    )
}

/** Aanmelden met e-mail en wachtwoord. Dit is wat er nu echt werkt. */
function EmailTab({ action, email }: { action: string; email?: string }) {
    return (
        <form method='post' action={action} className='fade-in' style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label='E-mailadres'>
                <Input icon='mail' type='email' name='email' defaultValue={email} placeholder='jij@voorbeeld.be' required autoFocus />
            </Field>
            <Field label='Wachtwoord'>
                <Input icon='lock' type='password' name='password' placeholder='••••••••••' required />
            </Field>
            <Btn variant='primary' size='lg' className='btn-block' iconRight='arrowRight' type='submit'>
                Aanmelden
            </Btn>
        </form>
    )
}

/**
 * eID en itsme® staan er wel, maar doen nog niets.
 *
 * Ze uitschakelen is eerlijker dan ze weglaten: het design rekent erop, en een
 * knop die niets doet is beter dan een knop die doet alsof.
 */
function EidTab() {
    return (
        <div className='fade-in' style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Btn variant='primary' size='lg' className='btn-block' icon='eid' type='button' disabled>
                Aanmelden met eID
            </Btn>
            <Btn variant='secondary' size='lg' className='btn-block' icon='itsme' type='button' disabled>
                Aanmelden met itsme®
            </Btn>
            <p className='hint' style={{ textAlign: 'center', marginTop: 2 }}>
                Nog niet aangesloten. Meld je voorlopig aan met je e-mailadres.
            </p>
        </div>
    )
}

/** De tweede stap: de code uit de authenticator-app. */
function MfaStep({ action, error }: { action: string; error: boolean }) {
    const [code, setCode] = useState('')

    return (
        <form method='post' action={action} className='fade-in' style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className='mfa-head'>
                <div className='mfa-badge'>
                    <Icon name='lock' size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className='step-txt' style={{ fontSize: 14.5 }}>
                        Authenticator-app
                    </div>
                    <div className='step-sub'>Zes cijfers, ververst elke 30 seconden</div>
                </div>
                <Badge tone='accent' icon='shieldCheck'>
                    2FA
                </Badge>
            </div>

            <div>
                <OtpInput length={6} value={code} setValue={setCode} error={error} autoFocus />
                <input type='hidden' name='code' value={code} />
                <p className='hint' style={{ marginTop: 11 }}>
                    Open je authenticator-app en voer de zescijferige code in.
                </p>
            </div>

            <Btn
                variant='primary'
                size='lg'
                className='btn-block'
                icon='shieldCheck'
                type='submit'
                disabled={code.length < 6}
            >
                Verifiëren & aanmelden
            </Btn>
        </form>
    )
}
