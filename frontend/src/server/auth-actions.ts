'use server';

import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { storeSession, destroySession } from '@/lib/auth';

/**
 * Sign-in is the one place the two services exchange a credential.
 *
 * The password goes to the API service, which checks it against the database
 * and returns a signed token. This service never sees a password hash and never
 * queries the user table; it only takes the token and puts it in an httpOnly
 * cookie on its own origin.
 */
export async function signIn(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter both an email address and a password.' };

  let token: string;
  try {
    const res = await api<{ ok: true; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    });
    token = res.token;
  } catch (e) {
    // Deliberately identical wording for "no such account" and "wrong
    // password", so the form cannot be used to discover which addresses have
    // accounts. Anything that is not a 401 is a configuration problem, and
    // saying so saves an afternoon of guessing.
    if (e instanceof ApiError && e.status === 401) return { error: 'Those details were not recognised.' };
    return {
      error:
        e instanceof ApiError && e.status === 503
          ? 'The interface could not reach the API service. Check BACKEND_URL and that the API is running.'
          : 'Sign-in failed because of a server problem. Check the service configuration and try again.',
    };
  }

  await storeSession(token);
  redirect('/');
}

export async function signOut() {
  await destroySession();
  redirect('/login');
}
