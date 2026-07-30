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

    // The cause matters to whoever maintains this, not to the person trying to
    // sign in — they can only wait or ask. It goes to the log; they get the one
    // thing they can act on.
    console.error('Sign-in failed for a reason other than bad credentials:', e);
    return {
      error:
        e instanceof ApiError && e.status === 503
          ? 'Could not reach the register. Check your connection and try again in a moment.'
          : 'Sign-in is unavailable at the moment. Try again shortly, and let your administrator know if it continues.',
    };
  }

  await storeSession(token);
  redirect('/');
}

export async function signOut() {
  await destroySession();
  redirect('/login');
}
