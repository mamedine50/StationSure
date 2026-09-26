import * as SecureStore from 'expo-secure-store';

/**
 * Stockage chiffré (Keystore Android / Keychain iOS) pour la session de l'appareil.
 * SecureStore limite chaque valeur à ~2 Ko : les valeurs longues (session Supabase) sont
 * découpées en morceaux. Jamais AsyncStorage.
 */
const TAILLE_MORCEAU = 1800;

function cleMorceau(cle: string, index: number): string {
  return `${cle}.${index}`;
}

function cleCompte(cle: string): string {
  return `${cle}.n`;
}

export const stockageSecurise = {
  async getItem(cle: string): Promise<string | null> {
    const compte = await SecureStore.getItemAsync(cleCompte(cle));
    if (!compte) return null;
    const n = Number(compte);
    const morceaux: string[] = [];
    for (let i = 0; i < n; i++) {
      const m = await SecureStore.getItemAsync(cleMorceau(cle, i));
      if (m === null) return null;
      morceaux.push(m);
    }
    return morceaux.join('');
  },

  async setItem(cle: string, valeur: string): Promise<void> {
    await stockageSecurise.removeItem(cle);
    const n = Math.max(1, Math.ceil(valeur.length / TAILLE_MORCEAU));
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(
        cleMorceau(cle, i),
        valeur.slice(i * TAILLE_MORCEAU, (i + 1) * TAILLE_MORCEAU),
      );
    }
    await SecureStore.setItemAsync(cleCompte(cle), String(n));
  },

  async removeItem(cle: string): Promise<void> {
    const compte = await SecureStore.getItemAsync(cleCompte(cle));
    const n = compte ? Number(compte) : 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(cleMorceau(cle, i));
    await SecureStore.deleteItemAsync(cleCompte(cle));
  },
};
