import './hub.css'
import './auth.css'

/**
 * De schermen van de hub, met hun eigen opmaak.
 *
 * Bewust een geneste layout en geen import in de root-layout: CSS die je hier
 * importeert laadt Next alleen voor de routes onder /oidc. Zou dit app-breed
 * staan, dan botsen de tokens van dit design (--border, --card) met die van je
 * eigen frontend en wint willekeurig een van de twee.
 *
 * Geen <html> of <body> hier - die staan in de root-layout van de app.
 */
export default function HubLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
