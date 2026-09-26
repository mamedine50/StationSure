import type { ReactNode } from 'react';

export function EnTetePage({
  titre,
  sousTitre,
  action,
}: {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-[26px] font-bold">{titre}</h1>
        {sousTitre && <span className="text-[14px] text-texte-secondaire">{sousTitre}</span>}
      </div>
      {action}
    </header>
  );
}
