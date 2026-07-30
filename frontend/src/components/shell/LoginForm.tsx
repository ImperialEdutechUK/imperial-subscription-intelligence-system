'use client';

import { useActionState } from 'react';
import { AlertTriangle, LogIn } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/controls';
import { signIn } from '@/server/auth-actions';

export function LoginForm({ orgName }: { orgName: string }) {
  const [state, action, pending] = useActionState(signIn, null);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <div
          className="mx-auto mb-3 grid size-11 place-items-center rounded-[13px] text-sm font-bold text-white"
          style={{ background: 'var(--brand-600)', boxShadow: 'var(--shadow-brand)' }}
          aria-hidden
        >
          IE
        </div>
        <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {orgName}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Subscription Intelligence
        </p>
      </div>

      <form
        action={action}
        className="space-y-3 rounded-[var(--radius-lg)] border p-5"
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}
      >
        <Field label="Email address" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>

        {state?.error ? (
          <p
            className="flex items-start gap-1.5 rounded-[var(--radius-sm)] p-2.5 text-xs"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            role="alert"
          >
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="md" full loading={pending} icon={LogIn}>
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-center text-[0.6875rem] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
        Accounts are created by an administrator. If you cannot get in, ask whoever set this up rather than trying repeatedly —
        there is no automated password reset.
      </p>
    </div>
  );
}
