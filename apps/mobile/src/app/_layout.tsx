import '../../global.css';

import { IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { initialiserI18nReact } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SurveillanceInactivite } from '@/components/inactivite';
import { SessionProvider, useSession } from '@/lib/session';

initialiserI18nReact();
void SplashScreen.preventAutoHideAsync();

/** Route attendue pour chaque état de session. */
function routePour(etat: ReturnType<typeof useSession>['session']['etat']): string | null {
  switch (etat) {
    case 'non_jumele':
    case 'revoque':
      return '/jumelage';
    case 'pin':
      return '/pin';
    case 'connecte':
      return '/accueil';
    default:
      return null;
  }
}

function Garde() {
  const { session } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const cible = routePour(session.etat);
    if (!cible) return;
    const actuelle = `/${segments[0] ?? ''}`;
    // Le scanner est un sous-écran du jumelage.
    if (cible === '/jumelage' && actuelle === '/scanner') return;
    if (actuelle !== cible) router.replace(cible as never);
  }, [session.etat, segments, router]);

  return null;
}

export default function RootLayout() {
  const [polices, erreurPolices] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (polices || erreurPolices) void SplashScreen.hideAsync();
  }, [polices, erreurPolices]);

  if (!polices && !erreurPolices) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Garde />
        <SurveillanceInactivite>
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: couleurs.fond } }}
          />
        </SurveillanceInactivite>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
