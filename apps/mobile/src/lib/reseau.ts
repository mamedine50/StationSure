import { useEffect, useState } from 'react';

import { SUPABASE_URL } from './env';

/** État réseau simple (préparation du bandeau hors ligne) : ping de la base toutes les 20 s. */
export function useEnLigne(): boolean | null {
  const [enLigne, setEnLigne] = useState<boolean | null>(null);
  useEffect(() => {
    let actif = true;
    const verifier = async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (actif) setEnLigne(r.ok);
      } catch {
        if (actif) setEnLigne(false);
      }
    };
    void verifier();
    const id = setInterval(() => void verifier(), 20000);
    return () => {
      actif = false;
      clearInterval(id);
    };
  }, []);
  return enLigne;
}
