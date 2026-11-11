import { usePathname, useRouter } from 'expo-router';
import { useMemo, type PropsWithChildren } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

const TAB_PATHS = ['/', '/workouts', '/intervals', '/progress'] as const;

export default function SwipeTabScreen({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 25 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_, gesture) => {
      const x = Math.abs(gesture.dx);
      if (x < 75 || x < Math.abs(gesture.dy) * 1.5) return;
      const current = TAB_PATHS.findIndex(path => path === pathname);
      const next = current + (gesture.dx < 0 ? 1 : -1);
      if (current !== -1 && next >= 0 && next < TAB_PATHS.length) router.navigate(TAB_PATHS[next]);
    },
  }), [pathname, router]);
  return <View style={styles.container} {...panResponder.panHandlers}>{children}</View>;
}
const styles = StyleSheet.create({ container: { flex: 1 } });
