const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../i18n.js');
require('../langs.js');
const L = require('../logic.js');

const LANGS = Object.keys(I.LANGS);
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');

test('seven languages are available', () => {
  assert.deepEqual(LANGS, ['en', 'ru', 'es', 'fr', 'de', 'pt', 'uk']);
});

for (const lang of LANGS.filter((l) => l !== 'en')) {
  test(`${lang}: has exactly the English phrases, with the same placeholders`, () => {
    const en = Object.keys(I.STRINGS.en).sort();
    const other = Object.keys(I.STRINGS[lang]).sort();
    assert.deepEqual(other.filter((k) => !en.includes(k)), [], 'extra keys');
    assert.deepEqual(en.filter((k) => !other.includes(k)), [], 'missing keys');
    for (const k of en) assert.equal(vars(I.STRINGS[lang][k]), vars(I.STRINGS.en[k]), k);
  });

  test(`${lang}: every plural unit has one word per plural category`, () => {
    assert.deepEqual(Object.keys(I.UNITS[lang]).sort(), Object.keys(I.UNITS.en).sort());
    for (const [unit, forms] of Object.entries(I.UNITS[lang])) assert.equal(forms.length, I.CATS[lang].length, unit);
    assert.ok(I.LOCALES[lang]);
  });
}

test('every catalog habit has a translated name in every language', () => {
  for (const lang of LANGS) for (const h of L.HABIT_CATALOG) assert.ok(I.STRINGS[lang]['habit.' + h.id], `${lang} ${h.id}`);
});

test('t fills variables and falls back to English', () => {
  I.setLang('en');
  assert.equal(I.t('tasks.count', { done: 2, total: 3 }), '2 of 3 done');
  I.setLang('ru');
  assert.equal(I.t('tasks.count', { done: 2, total: 3 }), 'Готово 2 из 3');
  assert.equal(I.t('no.such.key'), 'no.such.key');
  I.setLang('xx');
  assert.equal(I.getLang(), 'en');
});

test('plurals follow each language', () => {
  const cases = {
    en: [[1, '1 day'], [2, '2 days']],
    ru: [[1, '1 день'], [3, '3 дня'], [5, '5 дней'], [11, '11 дней'], [21, '21 день']],
    uk: [[1, '1 день'], [3, '3 дні'], [5, '5 днів'], [22, '22 дні']],
    es: [[1, '1 día'], [5, '5 días']],
    fr: [[1, '1 jour'], [0, '0 jour'], [2, '2 jours']],
    de: [[1, '1 Tag'], [7, '7 Tage']],
    pt: [[1, '1 dia'], [4, '4 dias']],
  };
  for (const [lang, list] of Object.entries(cases)) {
    I.setLang(lang);
    for (const [n, want] of list) assert.equal(I.pl(n, 'day'), want, `${lang} ${n}`);
  }
  I.setLang('en');
});

test('detect picks the first supported browser language', () => {
  assert.equal(I.detect('ru-RU'), 'ru');
  assert.equal(I.detect('pt-BR'), 'pt');
  assert.equal(I.detect(['ja-JP', 'de-AT', 'en']), 'de');
  assert.equal(I.detect('uk'), 'uk');
  assert.equal(I.detect('ja'), 'en');
  assert.equal(I.detect(undefined), 'en');
});
