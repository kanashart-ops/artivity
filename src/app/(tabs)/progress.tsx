
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import ArtivityScreen from '@/components/artivity-screen';
import {
    incrementTestCounter,
    readTestCounter,
} from '@/database/settings';

export default function ProgressScreen() {
  const db = useSQLiteContext();

  const [counter, setCounter] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const value = await readTestCounter(db);

        if (active) {
          setCounter(value);
        }
      } catch {
        if (active) {
          setError('Ошибка чтения базы данных');
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [db]);

  async function save() {
    if (saving) return;

    try {
      setSaving(true);
      setError('');

      const value = await incrementTestCounter(db);
      setCounter(value);
    } catch {
      setError('Не удалось сохранить данные');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ArtivityScreen
      title="Прогресс"
      icon="stats-chart-outline"
      description="Здесь будет статистика привычек и тренировок."
    >
      <View style={styles.testBox}>
        <Text style={styles.label}>
          Проверка локальной базы SQLite
        </Text>

        {counter === null && !error ? (
          <ActivityIndicator color="#22A788" />
        ) : (
          <Text style={styles.counter}>
            {counter ?? '—'}
          </Text>
        )}

        <Pressable
          style={[
            styles.button,
            saving && styles.disabled,
          ]}
          onPress={save}
          disabled={saving || counter === null}
        >
          <Text style={styles.buttonText}>
            {saving ? 'Сохраняем...' : 'Сохранить +1'}
          </Text>
        </Pressable>

        <Text style={styles.hint}>
          Нажми кнопку, закрой приложение и открой снова.
          Число должно сохраниться.
        </Text>

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}
      </View>
    </ArtivityScreen>
  );
}

const styles = StyleSheet.create({
  testBox: {
    borderRadius: 18,
    backgroundColor: '#E4F5EF',
    padding: 20,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#285D4D',
    textAlign: 'center',
  },
  counter: {
    fontSize: 44,
    fontWeight: '800',
    color: '#172F28',
    marginVertical: 14,
  },
  button: {
    backgroundColor: '#22A788',
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: '#537467',
  },
  error: {
    color: '#B42318',
    marginTop: 12,
    textAlign: 'center',
  },
});
