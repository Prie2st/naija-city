// Lossless, schema-agnostic save encoding.
//
// The city is mostly arrays of 1,024 same-shaped records (tiles and per-tile
// metrics). Plain JSON repeats every key name in every record. This codec stores
// such arrays column by column, with key names written once and long runs of a
// repeated value collapsed. Decoding rebuilds exactly the value JSON would have
// produced, so no gameplay state is lost or rounded. The codec knows nothing
// about the City schema: new persisted fields (for example Milestone 8 transit
// state) are packed automatically.
//
// It also refuses non-finite numbers, reporting their path, because JSON would
// otherwise turn NaN or Infinity into null and silently corrupt the save.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Plain = Record<string, unknown>;

const TABLE = '$t', ROWS = '$n', COLUMNS = '$c', RUNS = '$r', MASK = '$m', PRESENT = '$p', FLOATS = '$f';
const MIN_ROWS = 8;

export class SaveEncodingError extends Error {
  constructor(message: string, readonly path: string) { super(`${message} at ${path}`); this.name = 'SaveEncodingError'; }
}

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);
function jsonKeys(o: Plain): string[] {
  const keys = Object.keys(o);
  for (const k of keys) if (o[k] === undefined || typeof o[k] === 'function') return keys.filter(key => o[key] !== undefined && typeof o[key] !== 'function');
  return keys;
}

function sameShape(rows: unknown[]): string[] | null {
  if (rows.length < MIN_ROWS || !isPlain(rows[0])) return null;
  const keys = jsonKeys(rows[0] as Plain);
  if (!keys.length) return null;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!isPlain(row)) return null;
    const k = jsonKeys(row); if (k.length !== keys.length) return null;
    for (let i = 0; i < k.length; i++) if (k[i] !== keys[i]) return null;
  }
  return keys;
}
const scalar = (v: unknown) => v === null || typeof v !== 'object';
// Bit-exact little-endian float64 columns in base64: about 11 characters per
// value, against 16–18 for full-precision decimals in JSON.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Uint8Array(128); for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i;
function base64(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) { const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2]; out.push(B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]); }
  if (i < bytes.length) { const n = bytes[i] << 16 | (bytes[i + 1] ?? 0) << 8; out.push(B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < bytes.length ? B64[n >> 6 & 63] : '=') + '='); }
  return out.join('');
}
function unbase64(text: string): Uint8Array {
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0, bytes = new Uint8Array(text.length / 4 * 3 - pad);
  for (let i = 0, j = 0; i < text.length; i += 4) {
    const n = B64_INDEX[text.charCodeAt(i)] << 18 | B64_INDEX[text.charCodeAt(i + 1)] << 12 | B64_INDEX[text.charCodeAt(i + 2)] << 6 | B64_INDEX[text.charCodeAt(i + 3)];
    bytes[j++] = n >> 16 & 255; if (j < bytes.length) bytes[j++] = n >> 8 & 255; if (j < bytes.length) bytes[j++] = n & 255;
  }
  return bytes;
}
function floats(values: number[]): string {
  const bytes = new Uint8Array(Float64Array.from(values).buffer);
  if (!LITTLE_ENDIAN) for (let i = 0; i < bytes.length; i += 8) bytes.subarray(i, i + 8).reverse();
  return base64(bytes);
}
function unfloats(text: string, rows: number): number[] {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Damaged save number column.');
  const bytes = unbase64(text);
  if (bytes.length !== rows * 8) throw new Error('Damaged save number column.');
  if (!LITTLE_ENDIAN) for (let i = 0; i < bytes.length; i += 8) bytes.subarray(i, i + 8).reverse();
  return Array.from(new Float64Array(bytes.buffer));
}
const LITTLE_ENDIAN = new Uint8Array(new Float64Array([1]).buffer)[7] === 0x3f;
// Estimated from a sample: exact lengths would cost as much as the encoding itself.
function jsonLength(values: Json[]) {
  const step = Math.max(1, Math.floor(values.length / 64)); let n = 0, seen = 0;
  for (let i = 0; i < values.length; i += step) { n += String(values[i]).length + 1; seen++; }
  return n / seen * values.length;
}
function runs(values: Json[]): Json {
  if (values.length < MIN_ROWS || !values.every(scalar)) return values;
  const compact = runLengths(values);
  if (values.every(v => typeof v === 'number')) {
    const binaryLength = Math.ceil(values.length * 8 / 3) * 4 + 8;
    const compactLength = compact === values ? jsonLength(values) : jsonLength((compact as Record<string, Json[]>)[RUNS]) + 8;
    if (binaryLength < compactLength) return { [FLOATS]: floats(values as number[]) };
  }
  return compact;
}
function runLengths(values: Json[]): Json {
  const out: Json[] = [];
  for (let i = 0; i < values.length;) {
    let j = i + 1; while (j < values.length && Object.is(values[j], values[i])) j++;
    out.push(values[i], j - i); i = j;
  }
  return out.length < values.length ? { [RUNS]: out } : values;
}
function column(values: unknown[], path: string): Json {
  const keys = sameShape(values);
  if (keys) return table(values as Plain[], keys, path);
  if (values.length >= MIN_ROWS && values.every(v => v === null || isPlain(v)) && values.some(v => v === null)) {
    const present = values.filter(isPlain);
    const shape = sameShape(present);
    if (shape) return { [MASK]: runs(values.map(v => v === null ? 0 : 1)), [PRESENT]: table(present, shape, path) };
  }
  if (values.every(scalar)) {
    for (let i = 0; i < values.length; i++) { const v = values[i]; if (typeof v === 'number' && !Number.isFinite(v)) throw new SaveEncodingError(`Non-finite number ${v}`, `${path}[${i}]`); }
    return runs(values.map(v => v === undefined ? null : v) as Json[]);
  }
  return runs(values.map((v, i) => encodeValue(v, `${path}[${i}]`)));
}
function table(rows: Plain[], keys: string[], path: string): Json {
  return { [TABLE]: keys, [ROWS]: rows.length, [COLUMNS]: keys.map(k => column(rows.map(r => r[k]), `${path}[*].${k}`)) };
}
function encodeValue(value: unknown, path: string): Json {
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new SaveEncodingError(`Non-finite number ${value}`, path); return value; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const keys = sameShape(value);
    return keys ? table(value as Plain[], keys, path) : value.map((v, i) => encodeValue(v === undefined ? null : v, `${path}[${i}]`));
  }
  if (isPlain(value)) {
    const out: Record<string, Json> = {};
    for (const k of jsonKeys(value)) {
      if (k.startsWith('$')) throw new SaveEncodingError('Reserved key', `${path}.${k}`);
      out[k] = encodeValue(value[k], `${path}.${k}`);
    }
    return out;
  }
  throw new SaveEncodingError(`Unsupported ${typeof value} value`, path);
}

export function encodeSaveData(value: unknown): Json { return encodeValue(value, 'city'); }

function expand(col: Json, rows: number): unknown[] {
  if (Array.isArray(col)) return col.map(decodeValue);
  if (isPlain(col) && RUNS in col) {
    const r = col[RUNS] as Json[], out: unknown[] = [];
    for (let i = 0; i < r.length; i += 2) for (let n = 0; n < (r[i + 1] as number); n++) out.push(r[i]);
    return out;
  }
  if (isPlain(col) && FLOATS in col) return unfloats(col[FLOATS] as string, rows);
  if (isPlain(col) && MASK in col) {
    const mask = expand(col[MASK] as Json, rows), present = decodeValue(col[PRESENT] as Json) as unknown[];
    let next = 0; return mask.map(m => m ? present[next++] : null);
  }
  if (isPlain(col) && TABLE in col) return decodeValue(col) as unknown[];
  throw new Error('Damaged save column.');
}
function decodeValue(value: Json): unknown {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (!isPlain(value)) return value;
  if (TABLE in value) {
    const keys = value[TABLE] as string[], rows = value[ROWS] as number, cols = value[COLUMNS] as Json[];
    if (!Array.isArray(keys) || !Number.isInteger(rows) || !Array.isArray(cols) || cols.length !== keys.length) throw new Error('Damaged save table.');
    const data = cols.map(c => expand(c, rows));
    if (data.some(d => d.length !== rows)) throw new Error('Damaged save table length.');
    const out: Plain[] = new Array(rows);
    for (let i = 0; i < rows; i++) { const row: Plain = {}; for (let k = 0; k < keys.length; k++) row[keys[k]] = data[k][i]; out[i] = row; }
    return out;
  }
  const out: Plain = {};
  for (const k of Object.keys(value)) out[k] = decodeValue(value[k]);
  return out;
}
export function decodeSaveData(value: unknown): unknown { return decodeValue(value as Json); }

// 32-bit FNV-1a: cheap corruption detection, not security.
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const SAVE_MAGIC = 'NAIJA-CITY-SAVE';
export const SAVE_FORMAT = 1;
export interface SaveHeader { format: number; encoding: 'columnar-1' | 'json'; cityVersion: number; savedAt: number; length: number; checksum: string }

export function encodeSave(city: { version: number }, savedAt: number): string {
  let data: string, encoding: SaveHeader['encoding'] = 'columnar-1';
  try { data = JSON.stringify(encodeSaveData(city)); }
  catch (error) {
    // A future field whose key starts with "$" cannot be packed; fall back to plain JSON rather than refusing to save.
    if (!(error instanceof SaveEncodingError) || !error.message.startsWith('Reserved key')) throw error;
    data = JSON.stringify(city, (key, v) => { if (typeof v === 'number' && !Number.isFinite(v)) throw new SaveEncodingError(`Non-finite number ${v}`, key); return v; });
    encoding = 'json';
  }
  const header: SaveHeader = { format: SAVE_FORMAT, encoding, cityVersion: city.version, savedAt, length: data.length, checksum: checksum(data) };
  return `${SAVE_MAGIC}\n${JSON.stringify(header)}\n${data}`;
}
export const isEnvelope = (raw: string) => raw.startsWith(`${SAVE_MAGIC}\n`);
export function decodeSave(raw: string): { header: SaveHeader; value: unknown } {
  const first = raw.indexOf('\n'), second = raw.indexOf('\n', first + 1);
  if (!isEnvelope(raw) || second < 0) throw new Error('Save header is missing.');
  let header: SaveHeader;
  try { header = JSON.parse(raw.slice(first + 1, second)); } catch { throw new Error('Save header is damaged.'); }
  if (!isPlain(header) || !Number.isInteger(header.format) || !Number.isInteger(header.cityVersion)) throw new Error('Save version information is malformed.');
  if (header.format > SAVE_FORMAT) throw new Error('This save was made by a newer version of Naija City.');
  if (header.encoding !== 'columnar-1' && header.encoding !== 'json') throw new Error('Unknown save encoding.');
  const data = raw.slice(second + 1);
  if (data.length !== header.length) throw new Error(`Save is truncated (${data.length} of ${header.length} characters).`);
  if (checksum(data) !== header.checksum) throw new Error('Save checksum does not match; the stored data is damaged.');
  const value = header.encoding === 'json' ? JSON.parse(data) : decodeSaveData(JSON.parse(data));
  if (isPlain(value) && value.version !== header.cityVersion) throw new Error('Save version information is inconsistent.');
  return { header, value };
}
