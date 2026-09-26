import { useTranslation } from '@stationsure/i18n/react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lireQrJumelage } from '@/lib/jumelage';

/** Scan du QR de jumelage affiché sur le web du propriétaire. */
export default function EcranScanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, demanderPermission] = useCameraPermissions();
  const traite = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void demanderPermission();
  }, [permission, demanderPermission]);

  const surQr = (donnees: string) => {
    if (traite.current) return;
    const lu = lireQrJumelage(donnees);
    if (!lu) return;
    traite.current = true;
    router.replace({ pathname: '/jumelage', params: { code: lu.code, id: lu.pairingId ?? '' } });
  };

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <View className="flex-1 gap-4 px-5 pb-6 pt-4">
        <Text className="font-display text-[22px] text-texte" accessibilityRole="header">
          {t('pairing.scan')}
        </Text>
        <Text className="font-sans text-[14px] text-texte-secondaire">{t('pairing.scanHint')}</Text>
        <View className="flex-1 overflow-hidden rounded-xl border border-bordure bg-surface">
          {permission?.granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => surQr(data)}
            />
          ) : (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="text-center font-sans text-[14px] text-texte-secondaire">
                {t('pairing.cameraDenied')}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="h-14 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
        >
          <Text className="font-sans-semibold text-[15px] text-texte">{t('common.back')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
