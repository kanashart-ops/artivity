
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { initializeDatabase } from '@/database/migrations';

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="artivity.db"
      onInit={initializeDatabase}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SQLiteProvider>
  );
}
