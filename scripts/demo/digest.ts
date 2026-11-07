/**
 * Content digest for the demo showcase guard (T25-03, #54).
 *
 * `bun run demo:build` is byte-nondeterministic by design: `createEmptyDocx`
 * stamps `new Date().toISOString()` into `docProps/core.xml`, and JSZip
 * stamps the current time into every zip entry header. The builder compensates
 * by overwriting `docProps/core.xml` with a fixed timestamp (`FIXED_DATE` in
 * `build-sample-docx.ts`), but the zip headers still differ run to run.
 *
 * This digest therefore hashes **entry contents only**, never zip metadata,
 * and normalizes the two `docProps/core.xml` clock fields
 * (`dcterms:created` / `dcterms:modified`) before hashing — the same fields
 * the builder pins. Two buffers built from the same manifest compare equal;
 * any content drift (edited manifest, hand-patched byte, injected string)
 * changes the digest.
 */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

/** Clock fields in `docProps/core.xml` excluded from the digest. */
const CORE_TIME_RE = /<dcterms:(created|modified)(\s[^>]*)?>.*?<\/dcterms:\1>/gs;

/**
 * Strip the volatile clock values from a `docProps/core.xml` document,
 * keeping the elements (and their attributes) so structural drift is still
 * detected.
 */
export function normalizeCoreXml(xml: string): string {
  return xml.replace(CORE_TIME_RE, '<dcterms:$1$2></dcterms:$1>');
}

/**
 * Content digest of a DOCX buffer: sha256 over the sorted
 * `name + NUL + normalized bytes + NUL` sequence. Directory entries and all
 * zip container metadata (timestamps, compression, ordering) are ignored.
 */
export async function digestDocx(data: Uint8Array | ArrayBuffer | Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files)
    .filter((n) => !n.endsWith('/'))
    .sort();
  const hash = createHash('sha256');
  for (const name of names) {
    const raw = await zip.file(name)!.async('uint8array');
    const bytes =
      name === 'docProps/core.xml'
        ? Buffer.from(normalizeCoreXml(Buffer.from(raw).toString('utf8')), 'utf8')
        : Buffer.from(raw);
    hash.update(name, 'utf8');
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** First 12 hex chars — for human-readable `ok` lines. */
export function shortDigest(hex: string): string {
  return hex.slice(0, 12);
}
