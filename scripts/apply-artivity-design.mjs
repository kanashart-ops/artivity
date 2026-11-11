import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'src', 'app', '(tabs)', 'index.tsx');
if (!fs.existsSync(sourcePath)) {
  console.error('Не найден src/app/(tabs)/index.tsx. Запускай из корня проекта artivity.');
  process.exit(1);
}
let source = fs.readFileSync(sourcePath, 'utf8');
if (source.includes('<ModernTodayBody')) {
  console.log('Новый дизайн главного экрана уже установлен.');
  process.exit(0);
}
const anchor = "import SwipeTabScreen from '@/components/swipe-tab-screen';";
if (!source.includes(anchor)) {
  console.error('Не совпадает версия главного экрана; изменения не внесены.');
  process.exit(1);
}
const open = '          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>';
const start = source.indexOf(open);
const end = source.indexOf('          </ScrollView>', start);
if (start < 0 || end < 0) {
  console.error('Не найдена область главного экрана; изменения не внесены.');
  process.exit(1);
}
const original = source;
source = source.replace(anchor, `${anchor}\nimport ModernTodayBody from '@/components/modern-today-body';`);
const newOpen = source.indexOf(open);
const newEnd = source.indexOf('          </ScrollView>', newOpen);
source = source.slice(0, newOpen) + `          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ModernTodayBody today={today} loading={loading} error={error} onOpenForm={openForm} />
          </ScrollView>` + source.slice(newEnd + '          </ScrollView>'.length);
source = source.replace("const background = dark ? '#101720' : '#F7F9FB';", "const background = dark ? '#0E1720' : '#F3F8FA';");
fs.writeFileSync(sourcePath, source, 'utf8');
console.log('Готово: обновлён экран Сегодня, анкета дня сохранена.');
console.log('Исходник можно вернуть из Git при необходимости.');

// Обновляем оформление списка тренировок, сохраняя все существующие формы и функции.
const workoutsPath = path.join(process.cwd(), 'src', 'app', '(tabs)', 'workouts.tsx');
if (fs.existsSync(workoutsPath)) {
  let workouts = fs.readFileSync(workoutsPath, 'utf8');
  const before = workouts;
  workouts = workouts.replace("const background = dark ? '#101720' : '#F7F9FB';", "const background = dark ? '#0E1720' : '#F3F8FA';");
  workouts = workouts.replace("const card = dark ? '#1B2633' : '#FFFFFF';", "const card = dark ? '#1A2935' : '#FFFFFF';");
  workouts = workouts.replace('style={[styles.item, { backgroundColor: card }]}',
    "style={[styles.item, { backgroundColor: card, borderColor: dark ? '#2F4250' : '#E5EDF2' }]}");
  workouts = workouts.replace(
    "item: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 10 },",
    "item: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, marginBottom: 11, borderWidth: 1, elevation: 2, shadowColor: '#1A5462', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },"
  );
  workouts = workouts.replaceAll("backgroundColor: '#22A788'", "backgroundColor: '#12C873'");
  if (workouts !== before) {
    fs.writeFileSync(workoutsPath, workouts, 'utf8');
    console.log('Обновлено оформление списка тренировок.');
  }
}
