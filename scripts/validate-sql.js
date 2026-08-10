/**
 * Parses every SQL string in the codebase with the real PostgreSQL grammar.
 * Run with: node scripts/validate-sql.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadModule, parseSync } = require('pgsql-parser');

const ROOT = path.join(__dirname, '..');

// Placeholders let a fragment parse standalone; the runtime values are irrelevant here.
function stripTemplates(sql) {
    return sql
        .replace(/\\'/g, "'")
        .replace(/\$\{POINTS_EXPRESSION\}/g, '0')
        .replace(/\$\{filter\}/g, '')
        .replace(/\$\{columns\.join\([^)]*\)\}/g, 'sample_column')
        .replace(/\$\{insertPlaceholders\.join\([^)]*\)\}/g, '$2')
        .replace(/\$\{updateAssignments\.join\([^)]*\)\}/g, 'sample_column = EXCLUDED.sample_column')
        .replace(/\$\{params\.length\}/g, '1')
        .replace(/\$\{[^}]+\}/g, '1');
}

/** A real statement starts with a SQL verb, so prose that merely mentions one is skipped. */
const STARTS_WITH_SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i;

function extractSql(source) {
    const statements = [];
    const templateLiteral = /`([^`\\]*(?:\\.[^`\\]*)*)`/g;
    let match;

    while ((match = templateLiteral.exec(source))) {
        if (!STARTS_WITH_SQL.test(match[1])) continue;
        statements.push({ sql: stripTemplates(match[1]), index: match.index });
    }

    // Single-quoted SQL is always passed to query(), so anchor on that call.
    const inQueryCall = /(?:query|pool\.query|client\.query)\(\s*'([^']+)'/g;
    while ((match = inQueryCall.exec(source))) {
        if (!STARTS_WITH_SQL.test(match[1])) continue;
        statements.push({ sql: stripTemplates(match[1]), index: match.index });
    }

    return statements;
}

function walk(directory, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full, files);
        else if (entry.name.endsWith('.js')) files.push(full);
    }
    return files;
}

(async () => {
    await loadModule();

    let checked = 0;
    let failed = 0;

    for (const file of walk(ROOT)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const { sql, index } of extractSql(source)) {
            const line = source.slice(0, index).split('\n').length;
            try {
                parseSync(sql);
                checked += 1;
            } catch (error) {
                failed += 1;
                console.error(`\n✗ ${path.relative(ROOT, file)}:${line}`);
                console.error(`  ${error.message}`);
                console.error(`  ${sql.trim().slice(0, 160).replace(/\s+/g, ' ')}…`);
            }
        }
    }

    console.log(`\n${checked} SQL statement(s) parsed, ${failed} invalid.`);
    process.exit(failed ? 1 : 0);
})();
