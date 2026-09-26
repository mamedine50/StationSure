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
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

initialiserI18nReact();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Les noms de clés doivent correspondre aux familles du preset Tailwind (plateforme "native").
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
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: couleurs.fond },
        }}
      />
    </SafeAreaProvider>
  );
}
