import type { Metadata } from 'next'
import './globals.css'
import './auth.css'

export const metadata: Metadata = {
    title: '{{BRAND_NAME}} — Aanmelden'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang='nl'>
            <head>
                <link rel='preconnect' href='https://fonts.googleapis.com' />
                <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
                <link
                    href='https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;550;600;650;700&family=JetBrains+Mono:wght@400;500;600&display=swap'
                    rel='stylesheet'
                />
            </head>
            <body>{children}</body>
        </html>
    )
}
