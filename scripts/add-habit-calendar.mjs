import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src', 'components', 'modern-today-body.tsx');
if (!fs.existsSync(file)) {
  console.error('Не найден modern-today-body.tsx. Сначала установи Artivity 0.9.');
  process.exit(1);
}
let source = fs.readFileSync(file, 'utf8');
if (source.includes('<HabitCalendar ')) {
  console.log('Календарь уже установлен, повторно ничего не меняем.');
  process.exit(0);
}
const importAnchor = "import { FoodProgressRing, WeeklyProgressRing } from './food-progress-ring';";
const tailAnchor = '          </View>\n        </>\n      ) : null}\n      {error ?';
if (!source.includes(importAnchor) || !source.includes(tailAnchor)) {
  console.error('Не совпадает версия экрана. Файл не изменён, чтобы сохранить текущий дизайн.');
  process.exit(1);
}
const original = source;
source = source.replace(importAnchor, `${importAnchor}\nimport HabitCalendar from './habit-calendar';`);
source = source.replace(tailAnchor, '          </View>\n          <HabitCalendar refreshToken={today} />\n        </>\n      ) : null}\n      {error ?');
fs.writeFileSync(file, source, 'utf8');
console.log('Календарь добавлен на главный экран Artivity под блоком «Эта неделя».');
