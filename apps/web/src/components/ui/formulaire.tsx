'use client';

import { t } from '@stationsure/i18n';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';

/** Résultat standard d'une action serveur de formulaire. */
export interface EtatFormulaire {
  erreur?: string;
  succes?: string;
}

export const ETAT_INITIAL: EtatFormulaire = {};

const champBase =
  'h-12 w-full rounded-md border border-bordure bg-surface px-3 text-[14px] text-texte placeholder:text-texte-secondaire focus:border-accent focus:outline-none';

export function Champ({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
      <span>{label}</span>
      <input {...props} className={`${champBase} ${props.className ?? ''}`} />
    </label>
  );
}

export function Selecteur({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
      <span>{label}</span>
      <select {...props} className={`${champBase} ${props.className ?? ''}`}>
        {children}
      </select>
    </label>
  );
}

export function BoutonPrincipal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-12 rounded-lg bg-accent px-5 text-[15px] font-semibold text-accent-texte disabled:opacity-60 ${className}`}
    >
      {pending ? t('common.loading') : children}
    </button>
  );
}

export function BoutonSecondaire({
  children,
  onClick,
  type = 'button',
  className = '',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`h-12 rounded-lg border border-bordure-forte bg-surface px-5 text-[15px] font-semibold text-texte disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function BoutonDanger({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-12 rounded-lg border border-danger-bordure bg-danger-fond px-5 text-[15px] font-semibold text-danger disabled:opacity-60 ${className}`}
    >
      {pending ? t('common.loading') : children}
    </button>
  );
}

/** Message d'erreur (clé i18n ou texte) ou de succès. */
export function Message({ etat }: { etat: EtatFormulaire }) {
  if (etat.erreur) {
    return (
      <p
        role="alert"
        className="rounded-md border border-danger-bordure bg-danger-fond px-3 py-2 text-[13px] text-danger"
      >
        {traduireSiCle(etat.erreur)}
      </p>
    );
  }
  if (etat.succes) {
    return (
      <p
        role="status"
        className="rounded-md border border-bordure bg-surface-2 px-3 py-2 text-[13px] text-succes"
      >
        {traduireSiCle(etat.succes)}
      </p>
    );
  }
  return null;
}

function traduireSiCle(texte: string): string {
  const [cle, ...args] = texte.split('|');
  if (cle && /^[a-zA-Z]+(\.[a-zA-Z_]+)+$/.test(cle)) {
    if (cle === 'cashPage.imported')
      return t(cle, { matched: args[0] ?? '0', unmatched: args[1] ?? '0' });
    if (cle === 'devMessages.processed')
      return t(cle, { sent: args[0] ?? '0', retry: args[1] ?? '0', failed: args[2] ?? '0' });
    return t(cle);
  }
  return texte;
}
