
import { usePathname, useRouter } from 'expo-router';
import { useMemo, type PropsWithChildren } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

const TAB_PATHS = [
  '/',
  '/intervals',
  '/workouts',
  '/progress',
] as const;

export default function SwipeTabScreen({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,

        onMoveShouldSetPanResponder: (_, gesture) => {
          const horizontal = Math.abs(gesture.dx);
          const vertical = Math.abs(gesture.dy);

          return horizontal > 25 && horizontal > vertical * 1.5;
        },

        onPanResponderRelease: (_, gesture) => {
          const horizontal = Math.abs(gesture.dx);
          const vertical = Math.abs(gesture.dy);

          if (horizontal < 75 || horizontal < vertical * 1.5) {
            return;
          }

          const current = TAB_PATHS.findIndex(
            (path) => path === pathname
          );

          if (current === -1) return;

          const direction = gesture.dx < 0 ? 1 : -1;
          const next = current + direction;

          if (next >= 0 && next < TAB_PATHS.length) {
            router.navigate(TAB_PATHS[next]);
          }
        },
      }),
    [pathname, router]
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
