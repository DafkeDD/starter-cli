import { AuthAside } from '@/components/AuthAside'
import { RegisterForm } from '@/components/RegisterForm'

const BRAND = '{{BRAND_NAME}}'

export default async function RegisterPage({
    params,
    searchParams
}: {
    params: Promise<{ uid: string }>
    searchParams: Promise<{ error?: string }>
}) {
    const { uid } = await params
    const query = await searchParams

    return (
        <div className='auth-wrap'>
            <AuthAside brand={BRAND} />
            <div className='auth-main'>
                <RegisterForm uid={uid} brand={BRAND} error={query.error} />
            </div>
        </div>
    )
}
