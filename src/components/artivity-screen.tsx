import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SwipeTabScreen from './swipe-tab-screen';

type Props = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  children?: ReactNode;
};

export default function ArtivityScreen({
  title,
  description,
  icon,
  children,
}: Props) {
  const dark = useColorScheme() === 'dark';

  const background = dark ? '#101720' : '#F7F9FB';
  const textColor = dark ? '#FFFFFF' : '#17212D';
  const secondaryColor = dark ? '#94A1B1' : '#758292';

  return (
    <SwipeTabScreen>
      <SafeAreaView
        style={[styles.container, { backgroundColor: background }]}
        edges={['top', 'left', 'right']}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>ARTIVITY</Text>
          <Text style={[styles.title, { color: textColor }]}>
            {title}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name={icon} size={42} color="#22A788" />
          </View>

          <Text style={[styles.message, { color: textColor }]}>
            {title}
          </Text>

          <Text
            style={[
              styles.description,
              { color: secondaryColor },
            ]}
          >
            {description}
          </Text>

          {children ? (
            <View style={styles.extraContent}>{children}</View>
          ) : null}
        </View>
      </SafeAreaView>
    </SwipeTabScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#22A788',
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  iconCircle: {
    width: 110,
    height: 110,
    backgroundColor: '#22A78818',
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  message: {
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 23,
  },
  extraContent: {
    width: '100%',
    marginTop: 24,
  },
});
