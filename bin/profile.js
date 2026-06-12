/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {parseArgs} = require('util');
const {performance} = require('perf_hooks');

const KIB = 1024;
const MIB = 1024 * 1024;
const GIB = 1024 * 1024 * 1024;

const EXIFREADER_ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_DIR = path.join('test', 'fixtures', 'images');
const CACHE_FILE = path.join(EXIFREADER_ROOT_DIR, '.profile-cache.json');
const KNOWN_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'jpg_original',
    'png',
    'gif',
    'tiff', 'tif',
    'webp',
    'heic', 'heif',
    'avif',
    'jxl'
]);
const TYPE_ALIASES = {
    jpg: ['jpg', 'jpeg', 'jpg_original'],
    jpeg: ['jpg', 'jpeg', 'jpg_original'],
    tiff: ['tiff', 'tif'],
    tif: ['tiff', 'tif'],
    heic: ['heic', 'heif'],
    heif: ['heic', 'heif']
};

main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
});

async function main() {
    const options = parseCliArgs();

    if (options.help) {
        printHelp();
        return;
    }

    if (options.lengthAuto && !options.includeIo) {
        console.error('--length-auto requires --include-io (it is an IO-loop feature).');
        process.exit(1);
    }

    const ExifReader = loadExifReader();
    const libraryHash = computeLibraryHash();

    const targetDir = path.resolve(options.dir);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        console.error(`Directory not found: ${targetDir}`);
        process.exit(1);
    }

    const {files, skipped} = discoverFiles(targetDir, options.types);
    if (files.length === 0) {
        console.error(`No matching image files found in ${targetDir}`);
        if (skipped > 0) {
            console.error(`(${skipped} files skipped due to unknown extension or filter)`);
        }
        process.exit(1);
    }

    if (!options.json) {
        printHeader(options, targetDir, files.length, skipped);
    }

    const results = await runBenchmark(ExifReader, files, options);

    if (options.probeBytes) {
        await runProbeBytes(ExifReader, files, results, options, libraryHash);
    }

    if (options.json) {
        process.stdout.write(JSON.stringify(buildJsonReport(results, options, targetDir), null, 2) + '\n');
    } else {
        printReport(results, options);
    }
}

function parseCliArgs() {
    const {values} = parseArgs({
        options: {
            dir: {type: 'string', default: DEFAULT_DIR},
            iterations: {type: 'string', short: 'n', default: '1'},
            warmup: {type: 'string', default: '0'},
            type: {type: 'string', multiple: true, default: []},
            top: {type: 'string', default: '10'},
            json: {type: 'boolean', default: false},
            'include-io': {type: 'boolean', default: false},
            'length-auto': {type: 'boolean', default: false},
            'exclude-mpf': {type: 'boolean', default: false},
            'probe-bytes': {type: 'boolean', default: false},
            'probe-equality': {type: 'string', default: 'keys'},
            help: {type: 'boolean', short: 'h', default: false}
        },
        allowPositionals: false
    });

    const iterations = parsePositiveInt(values.iterations, 'iterations');
    const warmup = parseNonNegativeInt(values.warmup, 'warmup');
    const top = parseNonNegativeInt(values.top, 'top');

    if (values['probe-equality'] !== 'keys' && values['probe-equality'] !== 'strict') {
        console.error(`Invalid --probe-equality value: ${values['probe-equality']} (expected "keys" or "strict")`);
        process.exit(1);
    }

    const types = normalizeTypes(values.type);

    return {
        dir: values.dir,
        iterations,
        warmup,
        types,
        top,
        json: values.json,
        includeIo: values['include-io'],
        lengthAuto: values['length-auto'],
        excludeMpf: values['exclude-mpf'],
        probeBytes: values['probe-bytes'],
        probeEquality: values['probe-equality'],
        help: values.help
    };
}

function parsePositiveInt(value, name) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) {
        console.error(`Invalid --${name} value: ${value} (expected positive integer)`);
        process.exit(1);
    }
    return n;
}

function parseNonNegativeInt(value, name) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) {
        console.error(`Invalid --${name} value: ${value} (expected non-negative integer)`);
        process.exit(1);
    }
    return n;
}

function normalizeTypes(rawTypes) {
    if (!rawTypes || rawTypes.length === 0) {
        return null;
    }
    const expanded = new Set();
    for (const raw of rawTypes) {
        const t = raw.toLowerCase().replace(/^\./, '');
        const aliases = TYPE_ALIASES[t] || [t];
        for (const a of aliases) {
            expanded.add(a);
        }
    }
    return expanded;
}

function printHelp() {
    console.log(`Usage: node bin/profile.js [options]

Profiles ExifReader against a folder of image files.

Options:
  --dir <path>            Folder to scan (default: ${DEFAULT_DIR})
  -n, --iterations <n>    Times to parse each file (default: 1)
  --warmup <k>            Warmup iterations to discard (default: 0)
  --type <ext>            Filter by extension; repeat for multiple
                          (aliases: jpg → jpg/jpeg/jpg_original,
                                    tiff → tiff/tif, heic → heic/heif)
  --top <n>               Show N slowest files (default: 10, 0 to hide)
  --include-io            Time fs read + parse instead of parse-only
  --length-auto           Use length: 'auto' (adaptive minimal-fetch).
                          Requires --include-io; reports bytes fetched
                          and number of IO requests per file.
  --exclude-mpf           Pass excludeTags: {mpf: true} to load(). Useful
                          with --length-auto to skip MPF sub-image blocks
                          that push the metadata range near EOF.

All runs pass expanded:true + includeOffsets:true to load() so
length:'auto' and non-auto runs are directly comparable. The overhead
versus a default flat load() is in the ~5-10% range.
  --probe-bytes           Bisect minimum prefix length needed to parse
                          equal to the full file (use for I/O optimization)
  --probe-equality <m>    "keys" (default) or "strict"
  --json                  Emit machine-readable JSON
  -h, --help              Show this help

Examples:
  node bin/profile.js
  node bin/profile.js -n 10 --warmup 2
  node bin/profile.js --type jpg --type png
  node bin/profile.js --dir /path/to/photos --probe-bytes
`);
}

function loadExifReader() {
    const distPath = path.join(EXIFREADER_ROOT_DIR, 'dist', 'exif-reader.js');
    if (!fs.existsSync(distPath)) {
        console.error('dist/exif-reader.js not found. Run "npm run build" first.');
        process.exit(1);
    }
    return require(distPath);
}

function computeLibraryHash() {
    const distPath = path.join(EXIFREADER_ROOT_DIR, 'dist', 'exif-reader.js');
    const stat = fs.statSync(distPath);
    const hash = crypto.createHash('sha1');
    hash.update(String(stat.size));
    hash.update(':');
    hash.update(String(stat.mtimeMs));
    return hash.digest('hex').slice(0, 16);
}

function discoverFiles(dir, types) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const files = [];
    let skipped = 0;
    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!KNOWN_EXTENSIONS.has(ext)) {
            skipped++;
            continue;
        }
        if (types && !types.has(ext)) {
            skipped++;
            continue;
        }
        files.push({
            name: entry.name,
            path: path.join(dir, entry.name),
            ext,
            format: canonicalFormat(ext)
        });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return {files, skipped};
}

function canonicalFormat(ext) {
    if (ext === 'jpeg' || ext === 'jpg_original') {
        return 'jpg';
    }
    if (ext === 'tif') {
        return 'tiff';
    }
    if (ext === 'heif') {
        return 'heic';
    }
    return ext;
}

function printHeader(options, targetDir, fileCount, skipped) {
    const distPath = path.relative(EXIFREADER_ROOT_DIR, path.join(EXIFREADER_ROOT_DIR, 'dist', 'exif-reader.js'));
    let mode = options.includeIo ? 'parse+IO' : 'parse-only';
    const extras = [];
    if (options.lengthAuto) {
        extras.push('length:auto');
    }
    if (options.excludeMpf) {
        extras.push('no-mpf');
    }
    if (extras.length > 0) {
        mode += ' (' + extras.join(', ') + ')';
    }
    console.log(`ExifReader profiler - entry=${distPath} mode=${mode}`);
    console.log(`dir=${targetDir} iterations=${options.iterations} warmup=${options.warmup}` + (options.probeBytes ? ` probe=${options.probeEquality}` : ''));
    console.log(`Scanned ${fileCount + skipped} files, ${fileCount} matched, ${skipped} skipped`);
    console.log('');
}

async function runBenchmark(ExifReader, files, options) {
    const fileResults = [];
    let preloadedBytes = 0;

    for (const file of files) {
        const stat = fs.statSync(file.path);
        let buffer = null;
        if (!options.includeIo) {
            buffer = fs.readFileSync(file.path);
            preloadedBytes += buffer.length;
        }
        fileResults.push({
            file,
            sizeBytes: stat.size,
            buffer,
            iterations: [],
            error: null
        });
    }

    if (!options.json && !options.includeIo) {
        console.log(`Preloaded ${formatBytes(preloadedBytes)} into memory.`);
        console.log('');
    }

    const total = files.length;
    let parsedCount = 0;

    for (const result of fileResults) {
        for (let i = 0; i < options.warmup; i++) {
            try {
                await parseFile(ExifReader, result, options);
            } catch (_warmupError) {
                // Warmup errors are discarded; the real run will surface them below.
            }
        }

        for (let i = 0; i < options.iterations; i++) {
            const start = performance.now();
            try {
                await parseFile(ExifReader, result, options);
                result.iterations.push(performance.now() - start);
            } catch (error) {
                result.error = error && error.message || String(error);
                break;
            }
        }

        parsedCount++;
        if (!options.json && (parsedCount % 25 === 0 || parsedCount === total)) {
            process.stderr.write(`  parsed ${parsedCount}/${total}\r`);
        }
    }

    if (!options.json) {
        process.stderr.write('\n');
    }

    return fileResults;
}

async function parseFile(ExifReader, result, options) {
    const loadOpts = {expanded: true, includeOffsets: true};
    if (options.lengthAuto) {
        loadOpts.length = 'auto';
    }
    if (options.excludeMpf) {
        loadOpts.excludeTags = {mpf: true};
    }

    const target = options.includeIo ? result.file.path : result.buffer;
    const out = ExifReader.load(target, loadOpts);
    const tags = isThenable(out) ? await out : out;

    if (options.lengthAuto && tags && tags.metadataRange) {
        result.lastFetched = tags.metadataRange.fetched;
        result.lastRequests = tags.metadataRange.requests;
        result.lastEnd = tags.metadataRange.end;
    }
    return tags;
}

function isThenable(value) {
    return value && typeof value.then === 'function';
}

async function runProbeBytes(ExifReader, files, results, options, libraryHash) {
    const cache = loadCache();
    let updated = false;
    const total = files.length;
    let done = 0;

    if (!options.json) {
        console.log('');
        console.log(`Probing minimum bytes (equality=${options.probeEquality})...`);
    }

    for (const result of results) {
        if (result.error) {
            result.minBytes = null;
            done++;
            continue;
        }
        const stat = fs.statSync(result.file.path);
        const cacheKey = `${result.file.path}|${stat.size}|${stat.mtimeMs}|${libraryHash}|${options.probeEquality}`;

        if (cache[cacheKey] !== undefined) {
            result.minBytes = cache[cacheKey];
        } else {
            const buffer = result.buffer || fs.readFileSync(result.file.path);
            try {
                result.minBytes = await bisectMinBytes(ExifReader, buffer, options.probeEquality);
            } catch (_probeError) {
                result.minBytes = null;
            }
            cache[cacheKey] = result.minBytes;
            updated = true;
        }

        done++;
        if (!options.json && (done % 10 === 0 || done === total)) {
            process.stderr.write(`  probed ${done}/${total}\r`);
        }
    }

    if (!options.json) {
        process.stderr.write('\n');
    }

    if (updated) {
        saveCache(cache);
    }
}

async function bisectMinBytes(ExifReader, buffer, equalityMode) {
    const full = await parseQuietly(ExifReader, buffer);
    if (full === null) {
        return null;
    }
    const fingerprint = computeFingerprint(full, equalityMode);

    let lo = 1;
    let hi = buffer.length;

    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const slice = buffer.subarray(0, mid);
        const candidate = await parseQuietly(ExifReader, slice);
        if (candidate !== null && computeFingerprint(candidate, equalityMode) === fingerprint) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    return lo;
}

async function parseQuietly(ExifReader, buffer) {
    try {
        const out = ExifReader.load(buffer);
        return isThenable(out) ? await out : out;
    } catch (_error) {
        return null;
    }
}

function computeFingerprint(result, equalityMode) {
    if (equalityMode === 'keys') {
        const keys = Object.keys(result).sort();
        return JSON.stringify(keys);
    }
    return JSON.stringify(normalizeForCompare(result));
}

function normalizeForCompare(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(normalizeForCompare);
    }
    if (Buffer.isBuffer(value)) {
        const hash = crypto.createHash('sha1').update(value).digest('hex');
        return `buf:${value.length}:${hash}`;
    }
    if (typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = normalizeForCompare(value[key]);
        }
        return out;
    }
    if (typeof value === 'bigint') {
        return `bigint:${value.toString()}`;
    }
    return value;
}

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    } catch (_error) {
        // Corrupt cache: ignore and rebuild.
    }
    return {};
}

function saveCache(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');
}

function printReport(results, options) {
    const stats = aggregate(results);

    console.log('');
    printFormatTable(stats, options);

    if (options.top > 0) {
        console.log('');
        printSlowestFiles(results, options);
    }

    console.log('');
    printOverall(stats, options);

    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
        console.log('');
        console.log(`Errors (${failed.length}):`);
        for (const r of failed) {
            console.log(`  ${r.file.name}: ${r.error}`);
        }
    }
}

function aggregate(results) {
    const byFormat = new Map();
    let totalBytes = 0;
    let totalTime = 0;
    let totalParses = 0;
    let totalFiles = 0;
    let totalErrors = 0;
    let totalMinBytes = 0;
    let totalMinBytesFiles = 0;
    let totalFetched = 0;
    let totalFetchedFiles = 0;
    let totalRequests = 0;

    for (const r of results) {
        const fmt = r.file.format;
        if (!byFormat.has(fmt)) {
            byFormat.set(fmt, {
                format: fmt,
                count: 0,
                bytes: 0,
                medians: [],
                errors: 0,
                minBytesValues: [],
                minBytesRatios: [],
                fetchedValues: [],
                fetchedRatios: [],
                requestsValues: []
            });
        }
        const bucket = byFormat.get(fmt);
        bucket.count++;
        bucket.bytes += r.sizeBytes;
        totalBytes += r.sizeBytes;
        totalFiles++;
        if (r.error) {
            bucket.errors++;
            totalErrors++;
            continue;
        }
        const median = percentile(r.iterations, 0.5);
        const sum = r.iterations.reduce((a, b) => a + b, 0);
        r.median = median;
        r.sumIterations = sum;
        bucket.medians.push(median);
        totalTime += sum;
        totalParses += r.iterations.length;

        if (typeof r.minBytes === 'number') {
            bucket.minBytesValues.push(r.minBytes);
            bucket.minBytesRatios.push(r.minBytes / r.sizeBytes);
            totalMinBytes += r.minBytes;
            totalMinBytesFiles++;
        }

        if (typeof r.lastFetched === 'number') {
            bucket.fetchedValues.push(r.lastFetched);
            bucket.fetchedRatios.push(r.lastFetched / r.sizeBytes);
            totalFetched += r.lastFetched;
            totalFetchedFiles++;
        }
        if (typeof r.lastRequests === 'number') {
            bucket.requestsValues.push(r.lastRequests);
            totalRequests += r.lastRequests;
        }
    }

    const formatStats = [];
    for (const bucket of byFormat.values()) {
        const medians = bucket.medians;
        const totalMs = medians.reduce((a, b) => a + b, 0);
        const meanMs = medians.length > 0 ? totalMs / medians.length : 0;
        const p50 = percentile(medians, 0.5);
        const p95 = percentile(medians, 0.95);
        const throughputMiBps = totalMs > 0 ? (bucket.bytes / MIB) / (totalMs / 1000) : 0;
        const bytesP50 = percentile(bucket.minBytesValues, 0.5);
        const bytesP95 = percentile(bucket.minBytesValues, 0.95);
        const meanRatio = meanOf(bucket.minBytesRatios);
        const fetchedP50 = percentile(bucket.fetchedValues, 0.5);
        const fetchedP95 = percentile(bucket.fetchedValues, 0.95);
        const fetchedRatio = meanOf(bucket.fetchedRatios);
        const requestsMean = meanOf(bucket.requestsValues);
        const requestsP95 = percentile(bucket.requestsValues, 0.95);
        formatStats.push({
            format: bucket.format,
            count: bucket.count,
            bytes: bucket.bytes,
            totalMs,
            meanMs,
            p50Ms: p50,
            p95Ms: p95,
            throughputMiBps,
            errors: bucket.errors,
            bytesP50,
            bytesP95,
            meanRatio,
            fetchedP50,
            fetchedP95,
            fetchedRatio,
            requestsMean,
            requestsP95
        });
    }

    formatStats.sort((a, b) => b.totalMs - a.totalMs);

    return {
        formats: formatStats,
        overall: {
            totalFiles,
            totalErrors,
            totalParses,
            totalBytes,
            totalTime,
            throughputMiBps: totalTime > 0 ? (totalBytes / MIB) / (totalTime / 1000) : 0,
            minBytesTotal: totalMinBytesFiles > 0 ? totalMinBytes : null,
            minBytesFiles: totalMinBytesFiles,
            minBytesRatio: totalMinBytesFiles > 0 && totalBytes > 0 ? totalMinBytes / totalBytes : null,
            fetchedTotal: totalFetchedFiles > 0 ? totalFetched : null,
            fetchedFiles: totalFetchedFiles,
            fetchedRatio: totalFetchedFiles > 0 && totalBytes > 0 ? totalFetched / totalBytes : null,
            requestsTotal: totalFetchedFiles > 0 ? totalRequests : null,
            requestsMean: totalFetchedFiles > 0 ? totalRequests / totalFetchedFiles : null
        }
    };
}

function meanOf(values) {
    if (!values || values.length === 0) {
        return null;
    }
    let sum = 0;
    for (const v of values) {
        sum += v;
    }
    return sum / values.length;
}

function percentile(values, p) {
    if (!values || values.length === 0) {
        return null;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx];
}

function printFormatTable(stats, options) {
    const columns = [
        {key: 'format', label: 'format', align: 'left'},
        {key: 'count', label: 'count', align: 'right', format: (v) => String(v)},
        {key: 'totalMiB', label: 'total MiB', align: 'right', format: (v) => v.toFixed(1)},
        {key: 'meanMs', label: 'mean ms', align: 'right', format: (v) => v.toFixed(2)},
        {key: 'p50Ms', label: 'p50 ms', align: 'right', format: (v) => v.toFixed(2)},
        {key: 'p95Ms', label: 'p95 ms', align: 'right', format: (v) => v.toFixed(2)},
        {key: 'mibps', label: 'MiB/s', align: 'right', format: (v) => v.toFixed(1)},
        {key: 'errors', label: 'errors', align: 'right', format: (v) => String(v)}
    ];
    if (options.probeBytes) {
        columns.push(
            {key: 'bytesP50', label: 'bytes-p50', align: 'right', format: formatBytesCompact},
            {key: 'bytesP95', label: 'bytes-p95', align: 'right', format: formatBytesCompact},
            {key: 'needed', label: 'needed/total', align: 'right', format: (v) => v === null ? '-' : (v * 100).toFixed(1) + '%'}
        );
    }
    if (options.lengthAuto) {
        columns.push(
            {key: 'fetchedP50', label: 'fetched-p50', align: 'right', format: formatBytesCompact},
            {key: 'fetchedP95', label: 'fetched-p95', align: 'right', format: formatBytesCompact},
            {key: 'fetchedPct', label: 'fetched/total', align: 'right', format: (v) => v === null ? '-' : (v * 100).toFixed(1) + '%'},
            {key: 'reqsMean', label: 'reqs-mean', align: 'right', format: (v) => v === null ? '-' : v.toFixed(2)}
        );
    }

    const rows = stats.formats.map((f) => ({
        format: f.format,
        count: f.count,
        totalMiB: f.bytes / MIB,
        meanMs: f.meanMs,
        p50Ms: f.p50Ms === null ? 0 : f.p50Ms,
        p95Ms: f.p95Ms === null ? 0 : f.p95Ms,
        mibps: f.throughputMiBps,
        errors: f.errors,
        bytesP50: f.bytesP50,
        bytesP95: f.bytesP95,
        needed: f.meanRatio,
        fetchedP50: f.fetchedP50,
        fetchedP95: f.fetchedP95,
        fetchedPct: f.fetchedRatio,
        reqsMean: f.requestsMean
    }));

    console.log('Per-format (sorted by total time):');
    printTable(columns, rows);
}

function printSlowestFiles(results, options) {
    const ranked = results
        .filter((r) => !r.error && typeof r.median === 'number')
        .sort((a, b) => b.median - a.median)
        .slice(0, options.top);
    if (ranked.length === 0) {
        return;
    }
    console.log(`Top ${ranked.length} slowest files (by per-file p50 across iterations):`);
    for (const r of ranked) {
        const time = r.median.toFixed(2).padStart(8) + ' ms';
        const size = formatBytesCompact(r.sizeBytes).padStart(9);
        let minBytes = '';
        if (typeof r.minBytes === 'number') {
            const ratio = ((r.minBytes / r.sizeBytes) * 100).toFixed(1);
            minBytes = '  needs ' + formatBytesCompact(r.minBytes).padStart(9) + ` (${ratio}%)`;
        }
        console.log(`  ${time}  ${size}  ${r.file.name}${minBytes}`);
    }
}

function printOverall(stats, options) {
    const o = stats.overall;
    const successFiles = o.totalFiles - o.totalErrors;
    console.log(`Overall: ${successFiles} files parsed, ${formatBytes(o.totalBytes)} total, ${o.totalTime.toFixed(0)} ms total parse time, ${o.throughputMiBps.toFixed(1)} MiB/s`);
    if (options.probeBytes && o.minBytesFiles > 0) {
        console.log(`Probe:   ${o.minBytesFiles} files bisected, needed ${formatBytes(o.minBytesTotal)} of ${formatBytes(o.totalBytes)} (${(o.minBytesRatio * 100).toFixed(1)}% of total bytes)`);
    }
    if (options.lengthAuto && o.fetchedFiles > 0) {
        console.log(`Auto:    ${o.fetchedFiles} files, fetched ${formatBytes(o.fetchedTotal)} of ${formatBytes(o.totalBytes)} (${(o.fetchedRatio * 100).toFixed(1)}% of total bytes), ${o.requestsMean.toFixed(2)} requests/file mean`);
    }
    if (o.totalErrors > 0) {
        console.log(`Errors:  ${o.totalErrors}`);
    }
}

function printTable(columns, rows) {
    const widths = columns.map((col) => {
        const headerLen = col.label.length;
        const maxData = rows.reduce((max, row) => {
            const formatted = col.format ? col.format(row[col.key]) : String(row[col.key] === null || row[col.key] === undefined ? '-' : row[col.key]);
            return Math.max(max, formatted.length);
        }, 0);
        return Math.max(headerLen, maxData);
    });

    const header = columns.map((col, i) => align(col.label, widths[i], col.align)).join('  ');
    console.log('  ' + header);

    for (const row of rows) {
        const line = columns.map((col, i) => align(renderCell(col, row[col.key]), widths[i], col.align)).join('  ');
        console.log('  ' + line);
    }
}

function renderCell(col, value) {
    if (value === null || value === undefined) {
        return '-';
    }
    if (col.format) {
        return col.format(value);
    }
    return String(value);
}

function align(text, width, alignment) {
    if (alignment === 'right') {
        return text.padStart(width);
    }
    return text.padEnd(width);
}

function formatBytes(n) {
    if (n === null || n === undefined) {
        return '-';
    }
    if (n >= GIB) {
        return (n / GIB).toFixed(2) + ' GiB';
    }
    if (n >= MIB) {
        return (n / MIB).toFixed(2) + ' MiB';
    }
    if (n >= KIB) {
        return (n / KIB).toFixed(1) + ' KiB';
    }
    return n + ' B';
}

function formatBytesCompact(n) {
    if (n === null || n === undefined) {
        return '-';
    }
    if (n >= GIB) {
        return (n / GIB).toFixed(1) + 'Gi';
    }
    if (n >= MIB) {
        return (n / MIB).toFixed(1) + 'Mi';
    }
    if (n >= KIB) {
        return (n / KIB).toFixed(0) + 'Ki';
    }
    return n + 'B';
}

function buildJsonReport(results, options, targetDir) {
    const stats = aggregate(results);
    return {
        dir: targetDir,
        options: {
            iterations: options.iterations,
            warmup: options.warmup,
            includeIo: options.includeIo,
            lengthAuto: options.lengthAuto,
            excludeMpf: options.excludeMpf,
            probeBytes: options.probeBytes,
            probeEquality: options.probeBytes ? options.probeEquality : null,
            types: options.types ? Array.from(options.types) : null
        },
        formats: stats.formats,
        overall: stats.overall,
        files: results.map((r) => ({
            name: r.file.name,
            format: r.file.format,
            sizeBytes: r.sizeBytes,
            iterations: r.iterations,
            medianMs: typeof r.median === 'number' ? r.median : null,
            minBytes: typeof r.minBytes === 'number' ? r.minBytes : null,
            fetched: typeof r.lastFetched === 'number' ? r.lastFetched : null,
            requests: typeof r.lastRequests === 'number' ? r.lastRequests : null,
            error: r.error
        }))
    };
}
