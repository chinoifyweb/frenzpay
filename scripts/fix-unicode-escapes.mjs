// Replaces literal \u-escape 6-character sequences with real Unicode characters
// in every .ts/.tsx/.js/.jsx under a directory. Node handles UTF-8 correctly
// end-to-end (readFileSync + writeFileSync with 'utf8'); we avoid shell
// pipelines that were mangling the high-codepoint bytes.
//
// Usage:  node scripts/fix-unicode-escapes.mjs [targetDir]

import fs from 'node:fs';
import path from 'node:path';

// NB: escape strings are case-insensitive in TS source but our literal-
// string match is case-sensitive, so we must list both lowercase + upper
// variants where applicable. First pass handles surrogate pairs (emoji)
// as joint strings, second pass catches single-codepoint escapes.
// NB: we list both uppercase and lowercase variants of every escape sequence
// because our literal-string matcher is case-sensitive and the source
// uses a mix (especially the emoji surrogate pairs — some files have
// \uD83C, others \ud83c).
function caseVariants(literal) {
  return [literal.toLowerCase(), literal.toUpperCase(),
    // Common mixed-case: \uD83C (uppercase surrogate, lowercase hex suffix)
    literal.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      '\\u' + h[0].toUpperCase() + h[1].toUpperCase() + h[2].toLowerCase() + h[3].toLowerCase(),
    ),
  ];
}

const SURROGATE_PAIRS_RAW = {
  // Flag emojis
  '\\ud83c\\uddf3\\ud83c\\uddec': '\uD83C\uDDF3\uD83C\uDDEC', // 🇳🇬
  '\\ud83c\\uddfa\\ud83c\\uddf8': '\uD83C\uDDFA\uD83C\uDDF8', // 🇺🇸
  '\\ud83c\\uddec\\ud83c\\udde7': '\uD83C\uDDEC\uD83C\uDDE7', // 🇬🇧
  '\\ud83c\\uddea\\ud83c\\uddfa': '\uD83C\uDDEA\uD83C\uDDFA', // 🇪🇺
  '\\ud83c\\uddf0\\ud83c\\uddea': '\uD83C\uDDF0\uD83C\uDDEA', // 🇰🇪
  '\\ud83c\\uddec\\ud83c\\udded': '\uD83C\uDDEC\uD83C\uDDED', // 🇬🇭
  '\\ud83c\\uddea\\ud83c\\uddec': '\uD83C\uDDEA\uD83C\uDDEC', // 🇪🇬
  // Earth
  '\\ud83c\\udf0d': '\uD83C\uDF0D', // 🌍
};

// Expand to cover casing variants
const SURROGATE_PAIRS = {};
for (const [k, v] of Object.entries(SURROGATE_PAIRS_RAW)) {
  for (const variant of caseVariants(k)) SURROGATE_PAIRS[variant] = v;
}

const MAP = {
  '\\u2014': '\u2014', // em dash —
  '\\u2013': '\u2013', // en dash –
  '\\u2019': '\u2019', // right single quote ’
  '\\u2018': '\u2018', // left single quote ‘
  '\\u201c': '\u201c', // left double quote “
  '\\u201d': '\u201d', // right double quote ”
  '\\u20a6': '\u20a6', // naira ₦ (lowercase a)
  '\\u20A6': '\u20a6', // naira ₦ (uppercase A)
  '\\u20ac': '\u20ac', // euro €
  '\\u20AC': '\u20ac', // euro € (upper)
  '\\u2026': '\u2026', // ellipsis …
  '\\u21c4': '\u21c4', // ⇄
  '\\u21c6': '\u21c6', // ⇆
  '\\u2022': '\u2022', // •
  '\\u00a3': '\u00a3', // £
  '\\u00A3': '\u00a3', // £ (upper)
  '\\u00a6': '\u00a6', // ¦
  '\\u00ae': '\u00ae', // ®
  '\\u2192': '\u2192', // →
  '\\u2190': '\u2190', // ←
  '\\u2713': '\u2713', // ✓
  '\\u00a0': '\u00a0', // nbsp
  '\\u00b7': '\u00b7', // middle dot ·
  '\\u00B7': '\u00b7', // middle dot · (upper)
};

const SKIP_DIR = /(^|\/)(node_modules|\.next|dist|build|\.git)(\/|$)/;
const SRC_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;

let changed = 0, scanned = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (SKIP_DIR.test(full.replace(/\\/g, '/'))) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (SRC_EXT.test(name)) {
      scanned++;
      const before = fs.readFileSync(full, 'utf8');
      let after = before;
      // Surrogate pairs first so individual-half replacement below doesn't
      // clobber them.
      for (const [lit, real] of Object.entries(SURROGATE_PAIRS)) {
        if (after.includes(lit)) after = after.split(lit).join(real);
      }
      for (const [lit, real] of Object.entries(MAP)) {
        if (after.includes(lit)) after = after.split(lit).join(real);
      }
      if (after !== before) {
        fs.writeFileSync(full, after, 'utf8');
        changed++;
        console.log('fixed', full);
      }
    }
  }
}

const target = process.argv[2] ?? 'apps/web/src';
walk(target);
console.log(`\nScanned ${scanned} files, updated ${changed}.`);
