'use client';

import { t } from '@stationsure/i18n';
import { couleurs } from '@stationsure/ui';
import { useEffect, useState, useTransition } from 'react';
import QRCode from 'react-qr-code';

import { type CodeJumelage, genererCodeJumelage } from '@/actions/appareils';
import { BoutonSecondaire } from '@/components/ui/formulaire';

function formatDuree(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function DialogueJumelage({ stationId }: { stationId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [code, setCode] = useState<CodeJumelage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, lancer] = useTransition();
  const restant = code
    ? Math.max(0, Math.floor((new Date(code.expiresAt).getTime() - maintenant) / 1000))
    : 0;

  const generer = () => {
    setErreur(null);
    lancer(async () => {
      const res = await genererCodeJumelage(stationId);
      if (res.code) setCode(res.code);
      else setErreur(res.erreur ?? 'common.error');
    });
  };

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [code]);

  const ouvrir = () => {
    setOuvert(true);
    if (!code || restant === 0) generer();
  };

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        className="h-12 rounded-lg bg-accent px-5 text-[15px] font-semibold text-accent-texte"
      >
        {t('devices.pair')}
      </button>
      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-bordure bg-surface p-6">
            <h2 className="m-0 font-display text-[20px] font-bold">{t('devices.pairTitle')}</h2>
            <p className="m-0 text-[13px] leading-relaxed text-texte-secondaire">
              {t('devices.pairHint')}
            </p>
            {enCours && (
              <p className="m-0 text-[13px] text-texte-secondaire">{t('devices.generating')}</p>
            )}
            {erreur && <p className="m-0 text-[13px] text-danger">{t(erreur)}</p>}
            {code && !enCours && (
              <div className="flex flex-col items-center gap-4">
                <span className="text-[12px] tracking-wider text-texte-secondaire">
                  {t('devices.code').toUpperCase()}
                </span>
                <span
                  className="font-mono text-[40px] font-semibold tracking-[0.3em] text-accent"
                  aria-live="polite"
                >
                  {code.code.slice(0, 3)} {code.code.slice(3)}
                </span>
                <div className="rounded-md bg-white p-3">
                  <QRCode value={code.qr} size={168} bgColor="#FFFFFF" fgColor={couleurs.fond} />
                </div>
                <span
                  className={`font-mono text-[14px] ${restant === 0 ? 'text-danger' : 'text-texte-secondaire'}`}
                >
                  {restant === 0
                    ? t('devices.expired')
                    : t('devices.expiresIn', { time: formatDuree(restant) })}
                </span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <BoutonSecondaire onClick={generer} disabled={enCours}>
                {t('devices.newCode')}
              </BoutonSecondaire>
              <BoutonSecondaire onClick={() => setOuvert(false)}>
                {t('common.close')}
              </BoutonSecondaire>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
