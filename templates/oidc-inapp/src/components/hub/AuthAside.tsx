import { Icon } from '@/components/hub/ui/icons'

/**
 * De linkerhelft van het inlogscherm. Puur decoratief — geen formulier, geen
 * state — dus dit blijft een server component.
 */
export function AuthAside({ brand }: { brand: string }) {
    return (
        <div className='auth-aside'>
            <div className='auth-aside-deco' />
            <div className='auth-grid-lines' />

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11 }}>
                <div
                    className='brand-mark'
                    style={{ background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(4px)' }}
                >
                    <Icon name='shield' />
                </div>
                <div className='brand-name' style={{ color: '#fff' }}>
                    {brand}
                </div>
            </div>

            <div style={{ position: 'relative', maxWidth: 380 }}>
                <div className='eid-card-visual'>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className='eid-chip' />
                        <span style={{ fontSize: 11, letterSpacing: '.1em', opacity: 0.8 }}>BELGIË · BELGIQUE</span>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>IDENTITEITSKAART</div>
                        <div style={{ fontSize: 17, fontWeight: 650, marginTop: 2 }}>Sofie De Vos</div>
                        <div className='t-mono' style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                            85.04.12-138.47
                        </div>
                    </div>
                </div>

                <h2 style={{ color: '#fff', fontSize: 24, marginTop: 30, letterSpacing: '-0.02em' }}>
                    Eén account voor al je apps
                </h2>
                <p style={{ color: 'rgba(255,255,255,.78)', marginTop: 10, fontSize: 14.5 }}>
                    Je meldt je hier één keer aan. Elke app van {brand} herkent je daarna zonder dat je opnieuw hoeft
                    in te loggen.
                </p>
            </div>

            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    gap: 18,
                    color: 'rgba(255,255,255,.7)',
                    fontSize: 12.5
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name='lock' size={14} /> Versleuteld
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name='shieldCheck' size={14} /> GDPR-conform
                </span>
            </div>
        </div>
    )
}
