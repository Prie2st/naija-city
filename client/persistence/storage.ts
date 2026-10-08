import type { City } from '../../shared/types/city';
import { decodeCityWithReport, validateCityState } from '../../shared/simulation/save-format';
import { decodeSave, encodeSave, isEnvelope } from './save-codec';

// Bounded, verified local saves.
//
// Keys (at most three city copies ever exist, plus legacy keys until cleanup):
//   CURRENT     the newest verified save
//   BACKUP      the last known-good save (the previous verified CURRENT)
//   QUARANTINE  one unreadable save kept for diagnosis, replaced on the next failure
// Legacy keys `naija-city-v1` … `naija-city-v9` are read for migration and
// removed only once CURRENT and BACKUP both hold verified saves.
export const CURRENT_KEY = 'naija-city-save-current';
export const BACKUP_KEY = 'naija-city-save-backup';
export const QUARANTINE_KEY = 'naija-city-save-quarantine';
export const BACKUP_INTERVAL_MS = 60_000;
export const LEGACY_KEYS = [9, 8, 7, 6, 5, 4, 3, 2, 1].map(v => `naija-city-v${v}`);

export type SaveFailure = 'invalid-state' | 'storage-full' | 'storage-unavailable' | 'verify-failed';
export interface SaveResult { ok: boolean; reason?: SaveFailure; detail?: string; characters: number; durationMs: number; backupUpdated: boolean }
export type SaveSource = 'current' | 'backup' | 'legacy';
export interface LoadResult { city: City; source: SaveSource; key: string; savedAt: number | null; recovered: boolean; problems: string[]; repaired: string[] }

export class SaveLoadError extends Error {
  constructor(readonly problems: string[]) { super(`No readable saved city: ${problems.join('; ')}`); this.name = 'SaveLoadError'; }
}
export interface CityRepository { save(city: City): SaveResult; load(): City | null }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isQuota = (e: unknown) => e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(e.message));

export class LocalCityRepository implements CityRepository {
  /** Raw CURRENT string known to decode and validate in this session. */
  private currentVerified: string | null = null;
  private backupVerified = false;
  /** Legacy key the open city was migrated from; kept until two verified copies exist. */
  private sourceLegacyKey: string | null = null;
  /** Set when stored copies exist but none could be read: legacy copies are then never removed automatically. */
  private protectLegacy = false;
  private backupSavedAt = -Infinity;
  lastSave: SaveResult | null = null;
  lastSuccessAt: number | null = null;

  private storage(): Storage { return localStorage; }

  /** Loads the newest readable city, falling back to the backup and then legacy keys. Throws SaveLoadError when copies exist but none is readable. */
  loadWithReport(): LoadResult | null {
    const store = this.storage(), problems: string[] = [];
    const candidates: [SaveSource, string][] = [['current', CURRENT_KEY], ['backup', BACKUP_KEY], ...LEGACY_KEYS.map(k => ['legacy', k] as [SaveSource, string])];
    let found = false;
    for (const [source, key] of candidates) {
      const raw = store.getItem(key);
      if (raw === null) continue;
      found = true;
      try {
        let value: unknown, savedAt: number | null = null;
        if (isEnvelope(raw)) { const decoded = decodeSave(raw); value = decoded.value; savedAt = decoded.header.savedAt; }
        else value = JSON.parse(raw);
        const { city, repaired } = decodeCityWithReport(value);
        this.currentVerified = source === 'current' ? raw : null;
        this.backupVerified = source === 'backup';
        this.sourceLegacyKey = source === 'legacy' ? key : null;
        const recovered = problems.length > 0;
        if (recovered) this.quarantine(store.getItem(CURRENT_KEY));
        if (problems.length || repaired.length) console.warn('[naija-city save] loaded with problems', { source, key, problems, repaired });
        return { city, source, key, savedAt, recovered, problems, repaired };
      } catch (error) {
        problems.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (found) { this.protectLegacy = true; this.quarantine(store.getItem(CURRENT_KEY)); console.error('[naija-city save] no readable save', problems); throw new SaveLoadError(problems); }
    return null;
  }
  load(): City | null { return this.loadWithReport()?.city ?? null; }

  /**
   * Validates, writes and verifies a save. Never throws and never overwrites the
   * last good copy with unverified data. Steps:
   *  1. encode the city (rejects NaN/Infinity with their path), validate it and, on the first write
   *     of a session or a manual save, decode and validate the encoded string too;
   *  2. copy the verified CURRENT to BACKUP;
   *  3. write CURRENT;
   *  4. read CURRENT back and compare;
   *  5. once CURRENT and BACKUP are both verified, remove legacy keys.
   */
  save(city: City, savedAt = Date.now(), options: { fullVerify?: boolean } = {}): SaveResult {
    const started = now();
    const done = (r: Omit<SaveResult, 'durationMs'>): SaveResult => {
      const result = { ...r, durationMs: now() - started };
      this.lastSave = result; if (result.ok) this.lastSuccessAt = savedAt;
      else console.warn('[naija-city save] save failed', { ...result, keys: this.keySizes() });
      return result;
    };
    let raw: string;
    try {
      // Encoding first reports the exact path of any NaN or Infinity; the validators then check everything else.
      raw = encodeSave(city, savedAt);
      const problem = validateCityState(city);
      if (problem) throw new Error(`This city failed validation: ${problem}.`);
      // The codec is lossless (tested), so a full decode is needed only to prove it once per session or when asked.
      if (options.fullVerify || this.currentVerified === null) decodeCityWithReport(decodeSave(raw).value);
    } catch (error) {
      return done({ ok: false, reason: 'invalid-state', detail: error instanceof Error ? error.message : String(error), characters: 0, backupUpdated: false });
    }
    let store: Storage;
    try { store = this.storage(); } catch (error) { return done({ ok: false, reason: 'storage-unavailable', detail: String(error), characters: raw.length, backupUpdated: false }); }

    let backupUpdated = false;
    // The backup trails CURRENT by at most BACKUP_INTERVAL_MS of play, so autosaves usually write one copy, not two.
    if (this.currentVerified !== null && this.currentVerified !== raw && (!this.backupVerified || savedAt - this.backupSavedAt >= BACKUP_INTERVAL_MS)) {
      backupUpdated = this.write(store, BACKUP_KEY, this.currentVerified) === null;
      if (backupUpdated) { this.backupVerified = true; this.backupSavedAt = savedAt; }
    }
    const error = this.write(store, CURRENT_KEY, raw);
    if (error !== null) return done({ ok: false, reason: isQuota(error) ? 'storage-full' : 'storage-unavailable', detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error), characters: raw.length, backupUpdated });
    let readBack: string | null = null;
    try { readBack = store.getItem(CURRENT_KEY); } catch { /* reported below */ }
    if (readBack !== raw) {
      if (this.currentVerified !== null) this.write(store, CURRENT_KEY, this.currentVerified);
      return done({ ok: false, reason: 'verify-failed', detail: 'Stored save did not read back identically.', characters: raw.length, backupUpdated });
    }
    this.currentVerified = raw;
    if (this.backupVerified) this.removeLegacy(store);
    return done({ ok: true, characters: raw.length, backupUpdated });
  }

  /** Writes a key; on a full store, frees space that is safe to free and retries once. Returns the error, or null on success. */
  private write(store: Storage, key: string, value: string): unknown {
    try { store.setItem(key, value); return null; }
    catch (error) {
      if (!isQuota(error) || !this.freeSpace(store)) return error;
      try { store.setItem(key, value); return null; } catch (retry) { return retry; }
    }
  }
  /**
   * Frees space that is safe to free: the quarantine copy, legacy copies older than
   * the one the open city came from, and every legacy copy once a verified save
   * exists. Never touches CURRENT or BACKUP.
   */
  private freeSpace(store: Storage): boolean {
    let freed = false;
    const remove = (key: string) => { try { if (store.getItem(key) !== null) { store.removeItem(key); freed = true; } } catch { /* ignore */ } };
    remove(QUARANTINE_KEY);
    const keepSource = this.currentVerified === null && !this.backupVerified;
    if (!this.protectLegacy) for (const key of LEGACY_KEYS) if (!(keepSource && key === this.sourceLegacyKey)) remove(key);
    return freed;
  }
  private removeLegacy(store: Storage) { if (this.protectLegacy) return; for (const key of LEGACY_KEYS) { try { store.removeItem(key); } catch { /* ignore */ } } }
  private quarantine(raw: string | null) {
    if (raw === null) return;
    try { this.storage().setItem(QUARANTINE_KEY, raw); } catch { /* best effort only */ }
  }
  keySizes(): Record<string, number> {
    const out: Record<string, number> = {};
    try { const store = this.storage(); for (const key of [CURRENT_KEY, BACKUP_KEY, QUARANTINE_KEY, ...LEGACY_KEYS]) { const v = store.getItem(key); if (v !== null) out[key] = v.length; } } catch { /* unavailable */ }
    return out;
  }
}
