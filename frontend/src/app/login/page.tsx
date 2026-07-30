import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getBrandSettings } from '@/server/settings';
import { LoginForm } from '@/components/shell/LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const [user, brand] = await Promise.all([getSession(), getBrandSettings()]);
  if (user) redirect('/');

  return <LoginForm orgName={brand.orgName} />;
}
