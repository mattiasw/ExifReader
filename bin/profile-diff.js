/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const MIB = 1024 * 1024;

main();

function main() {
    const args = process.argv.slice(2);
    const helpRequested = args.includes('-h') || args.includes('--help');
    if (helpRequested || args.length !== 2) {
        printHelp();
        process.exit(helpRequested ? 0 : 1);
    }

    const before = readReport(args[0]);
    const after = readReport(args[1]);

    console.log(`Diff: ${shortPath(args[0])}  →  ${shortPath(args[1])}`);
    console.log(`Mode: before=${describeMode(before)}  after=${describeMode(after)}`);
    console.log('');

    const byFormat = joinByFormat(before, after);
    printFormatDiff(byFormat);

    console.log('');
    printOverallDiff(before, after);
}

function printHelp() {
    console.log(`Usage: node bin/profile-diff.js <before.json> <after.json>

Compares two JSON reports produced by bin/profile.js. Per-format and overall
deltas in mean parse time and (when --length-auto was used) bytes read.

Recommended workflow:
  node bin/profile.js --include-io -n 100 --probe-bytes --json \\
      > .profile-results/baseline.json
  node bin/profile.js --include-io -n 100 --length-auto --json \\
      > .profile-results/after.json
  node bin/profile-diff.js .profile-results/baseline.json .profile-results/after.json
`);
}

function readReport(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (error) {
        console.error(`Failed to read ${p}: ${error.message || error}`);
        process.exit(1);
    }
}

function shortPath(p) {
    const cwd = process.cwd();
    return p.startsWith(cwd) ? path.relative(cwd, p) : p;
}

function describeMode(report) {
    const o = report.options || {};
    const parts = [];
    parts.push(o.includeIo ? 'parse+IO' : 'parse-only');
    if (o.lengthAuto) {
        parts.push('length:auto');
    }
    if (o.excludeMpf) {
        parts.push('no-mpf');
    }
    if (o.probeBytes) {
        parts.push('probe');
    }
    parts.push(`n=${o.iterations}`);
    return parts.join(' ');
}

function joinByFormat(before, after) {
    const beforeByFmt = new Map();
    for (const f of before.formats) {
        beforeByFmt.set(f.format, f);
    }
    const out = [];
    for (const a of after.formats) {
        const b = beforeByFmt.get(a.format) || null;
        out.push({format: a.format, before: b, after: a});
    }
    return out;
}

function printFormatDiff(rows) {
    const headers = [
        'format', 'files', 'before-ms', 'after-ms', 'speedup',
        'before-MiB-read', 'after-MiB-read', 'bytes-saved'
    ];
    const tableRows = rows.map((r) => {
        const beforeMs = r.before ? r.before.meanMs : null;
        const afterMs = r.after ? r.after.meanMs : null;
        const speedup = (beforeMs && afterMs && afterMs > 0) ? (beforeMs / afterMs) : null;
        const beforeMiB = r.before ? r.before.bytes / MIB : null;
        const afterFetchedRatio = (r.after && typeof r.after.fetchedRatio === 'number') ? r.after.fetchedRatio : null;
        const afterMiB = (afterFetchedRatio !== null && r.after) ? (r.after.bytes * afterFetchedRatio) / MIB : null;
        const saved = (beforeMiB !== null && afterMiB !== null && beforeMiB > 0) ? 1 - (afterMiB / beforeMiB) : null;
        return [
            r.format,
            String((r.after && r.after.count) || 0),
            beforeMs === null ? '-' : beforeMs.toFixed(2),
            afterMs === null ? '-' : afterMs.toFixed(2),
            speedup === null ? '-' : speedup.toFixed(2) + 'x',
            beforeMiB === null ? '-' : beforeMiB.toFixed(1),
            afterMiB === null ? '-' : afterMiB.toFixed(1),
            saved === null ? '-' : (saved * 100).toFixed(1) + '%',
        ];
    });
    printTable(headers, tableRows);
}

function printOverallDiff(before, after) {
    const b = before.overall || {};
    const a = after.overall || {};
    const beforeMs = b.totalTime;
    const afterMs = a.totalTime;
    const speedup = (beforeMs && afterMs && afterMs > 0) ? (beforeMs / afterMs) : null;
    const beforeMiB = (b.totalBytes || 0) / MIB;
    const afterMiB = (typeof a.fetchedTotal === 'number') ? a.fetchedTotal / MIB : beforeMiB;
    const saved = (beforeMiB > 0) ? 1 - (afterMiB / beforeMiB) : 0;

    console.log(`Overall: ${formatMs(beforeMs)} → ${formatMs(afterMs)} (${speedup === null ? '-' : speedup.toFixed(2) + 'x'} speedup)`);
    if (typeof a.fetchedTotal === 'number') {
        console.log(`Bytes:   ${beforeMiB.toFixed(1)} MiB → ${afterMiB.toFixed(1)} MiB (${(saved * 100).toFixed(1)}% saved)`);
        if (typeof a.requestsMean === 'number') {
            console.log(`Requests: ${a.requestsMean.toFixed(2)} per file on average across ${a.fetchedFiles} files`);
        }
    }
}

function formatMs(v) {
    if (v === undefined || v === null) {
        return '-';
    }
    if (v >= 1000) {
        return (v / 1000).toFixed(1) + ' s';
    }
    return v.toFixed(0) + ' ms';
}

function printTable(headers, rows) {
    const widths = headers.map((h, i) => {
        let w = h.length;
        for (const r of rows) {
            if (r[i] && r[i].length > w) {
                w = r[i].length;
            }
        }
        return w;
    });
    const align = (cell, i) => {
        if (i === 0) {
            return cell.padEnd(widths[i]);
        }
        return cell.padStart(widths[i]);
    };
    console.log('  ' + headers.map((h, i) => align(h, i)).join('  '));
    for (const r of rows) {
        console.log('  ' + r.map((c, i) => align(c, i)).join('  '));
    }
}
