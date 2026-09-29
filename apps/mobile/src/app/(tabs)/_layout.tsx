import { Ionicons } from '@expo/vector-icons';
import { type Onglet, ongletsVisibles } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { chargerTaches } from '@/lib/carburant';
import { abonnerFile, nombreEnAttente } from '@/lib/preuves';
import { useSession } from '@/lib/session';

const ICONES: Record<Onglet, keyof typeof Ionicons.glyphMap> = {
  accueil: 'home-outline',
  carburant: 'water-outline',
  caisse: 'card-outline',
  boutique: 'cart-outline',
  lavage: 'sparkles-outline',
  vidange: 'construct-outline',
  moi: 'person-outline',
};

/** Badges : photos en attente (Moi), passation à signer (Carburant), bordereau à faire (Caisse). */
export function useBadges(modules: readonly string[]) {
  const [photos, setPhotos] = useState(nombreEnAttente());
  const [passation, setPassation] = useState(0);
  const [bordereau, setBordereau] = useState(0);
  useEffect(() => abonnerFile(() => setPhotos(nombreEnAttente())), []);
  useEffect(() => {
    let actif = true;
    const charger = async () => {
      const taches = await chargerTaches();
      if (!actif || !taches) return;
      setPassation(taches.tasks.some((t) => t.key === 'handover' && t.mine && !t.complete) ? 1 : 0);
      setBordereau(
        modules.includes('bank_deposit') &&
          taches.tasks.some((t) => t.key === 'deposit_previous' && !t.complete)
          ? 1
          : 0,
      );
    };
    void charger();
    const id = setInterval(() => void charger(), 60000);
    return () => {
      actif = false;
      clearInterval(id);
    };
  }, [modules]);
  return { photos, passation, bordereau };
}

export default function LayoutOnglets() {
  const { t } = useTranslation();
  const { session } = useSession();
  const modules = session.etat === 'connecte' ? session.employe.modules : [];
  const visibles = new Set(ongletsVisibles(modules));
  const badges = useBadges(modules);
  const badge = (n: number) => (n > 0 ? n : undefined);
  const badgeDe = (o: Onglet) =>
    o === 'moi'
      ? badge(badges.photos)
      : o === 'carburant'
        ? badge(badges.passation)
        : o === 'caisse'
          ? badge(badges.bordereau)
          : undefined;
  const onglets: Onglet[] = [
    'accueil',
    'carburant',
    'caisse',
    'boutique',
    'lavage',
    'vidange',
    'moi',
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: couleurs.fond },
        tabBarStyle: {
          backgroundColor: couleurs.surfaceNav,
          borderTopColor: couleurs.bordure,
          height: 84,
          paddingTop: 8,
        },
        tabBarActiveTintColor: couleurs.accent,
        tabBarInactiveTintColor: couleurs.texteSecondaire,
        tabBarLabelStyle: { fontFamily: 'IBMPlexSans_500Medium', fontSize: 12 },
        tabBarBadgeStyle: {
          backgroundColor: couleurs.accent,
          color: couleurs.accentTexte,
          fontFamily: 'IBMPlexSans_600SemiBold',
        },
      }}
    >
      {onglets.map((o) => {
        const b = badgeDe(o);
        return (
          <Tabs.Screen
            key={o}
            name={o}
            options={{
              title: t(`tabs.${o}`),
              ...(visibles.has(o) ? {} : { href: null }),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={ICONES[o]} color={color} size={size} />
              ),
              ...(b !== undefined ? { tabBarBadge: b } : {}),
            }}
          />
        );
      })}
    </Tabs>
  );
}
