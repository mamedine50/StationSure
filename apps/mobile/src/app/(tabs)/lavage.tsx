import { useTranslation } from '@stationsure/i18n/react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoutonAction } from '@/components/bouton-action';

/** Onglet « lavage » : modules prévus (phases 7-8), inactifs pour l'instant. */
export default function Onglet() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-fond" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-4">
        <Text className="font-display text-[24px] text-texte" accessibilityRole="header">
          {t('tabs.lavage')}
        </Text>
        <View className="gap-2">
          <BoutonAction
            principal
            libelle={t('tabs.lavage')}
            detail={t('modules.soon')}
            raison={t('modules.soon')}
            onPress={() => undefined}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
