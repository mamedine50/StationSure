import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Gps, positionActuelle } from '@/lib/preuves';

export interface PhotoPrise {
  uri: string;
  capturedAt: Date;
  gps: Gps | null;
}

/** Caméra plein écran (jamais la galerie). Rend la photo avec l'heure appareil et la position. */
export function CapturePhoto({
  visible,
  onPhoto,
  onAnnuler,
}: {
  visible: boolean;
  onPhoto: (p: PhotoPrise) => void;
  onAnnuler: () => void;
}) {
  const { t } = useTranslation();
  const [permission, demander] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [traitement, setTraitement] = useState(false);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) void demander();
  }, [visible, permission, demander]);

  const prendre = async () => {
    if (!camera.current || traitement) return;
    setTraitement(true);
    try {
      const capturedAt = new Date();
      const [photo, gps] = await Promise.all([
        camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false }),
        positionActuelle(),
      ]);
      if (photo?.uri) onPhoto({ uri: photo.uri, capturedAt, gps });
    } finally {
      setTraitement(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onAnnuler}>
      <SafeAreaView className="flex-1 bg-fond">
        <View className="flex-1 overflow-hidden">
          {permission?.granted ? (
            <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
          ) : (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="text-center font-sans text-[14px] text-texte-secondaire">
                {t('photo.permission')}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-3 p-4">
          <Pressable
            accessibilityRole="button"
            onPress={onAnnuler}
            className="h-14 flex-1 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
          >
            <Text className="font-sans-semibold text-[15px] text-texte">{t('photo.cancel')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void prendre()}
            disabled={!permission?.granted || traitement}
            className="h-14 flex-[2] items-center justify-center rounded-lg bg-accent"
          >
            {traitement ? (
              <ActivityIndicator color={couleurs.accentTexte} />
            ) : (
              <Text className="font-sans-semibold text-[17px] text-accent-texte">
                {t('photo.capture')}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Vignette de la photo prise : heure, GPS, bouton reprendre. */
export function CartePhoto({
  photo,
  titre,
  valeur,
  onReprendre,
  station,
}: {
  photo: PhotoPrise | null;
  titre: string;
  valeur?: string | undefined;
  onReprendre: () => void;
  station: string;
}) {
  const { t } = useTranslation();
  const heure = photo
    ? new Intl.DateTimeFormat('fr-SN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(photo.capturedAt)
    : '';
  return (
    <View className="overflow-hidden rounded-lg bg-black">
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={{ width: '100%', height: 190 }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ height: 190 }} className="items-center justify-center">
          <Text className="font-sans text-[13px] text-texte-secondaire">{titre}</Text>
        </View>
      )}
      <View className="absolute left-3 top-3 rounded-pilule bg-black/60 px-2 py-1">
        <Text className="font-sans text-[11px] tracking-widest text-texte-secondaire">{titre}</Text>
      </View>
      {valeur ? (
        <Text className="absolute bottom-12 left-0 right-0 text-center font-mono-semibold text-[30px] text-[#F2E9D4]">
          {valeur}
        </Text>
      ) : null}
      <View className="absolute bottom-3 left-3 flex-row gap-2">
        {photo && (
          <View className="rounded-pilule bg-black/60 px-2 py-1">
            <Text className="font-mono text-[12px] text-texte">{heure}</Text>
          </View>
        )}
        {photo && (
          <View className="rounded-pilule bg-black/60 px-2 py-1">
            <Text className="font-sans text-[12px] text-succes">
              {photo.gps ? `${t('reading.gps')} · ${station}` : t('reading.gpsMissing')}
            </Text>
          </View>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onReprendre}
        className="absolute right-3 top-3 h-11 items-center justify-center rounded-md border border-bordure-forte bg-surface px-3"
      >
        <Text className="font-sans-semibold text-[13px] text-texte">
          {photo ? t('reading.retake') : t('reading.takePhoto')}
        </Text>
      </Pressable>
    </View>
  );
}
