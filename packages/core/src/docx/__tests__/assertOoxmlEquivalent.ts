import { expect } from 'bun:test';

// T27-04 (issue #80): canonical OOXML comparison for round-trip tests.
// Serializer output and hand-written fixtures differ in insignificant ways
// (whitespace between tags, attribute order, `<x></x>` vs `<x/>`, envelope
// namespaces), so a raw string compare would pin formatting instead of
// semantics. Canonicalization: drop the XML declaration, collapse inter-tag
// whitespace, sort attributes alphabetically per tag, drop envelope
// namespace declarations, and normalize empty-element spellings.

function canonicalize(xml: string): string {
  // Drop envelope attributes: namespace declarations and mc:Ignorable live
  // on the root and differ between hand-written fixtures (bare `xmlns:w`)
  // and serializer output (full envelope). They carry no revision
  // semantics; the comparison targets the revision-bearing content.
  // `xmlns:w` itself is dropped too — every tag keeps its `w:` prefix, so
  // a wrong-namespace emission would still surface as a tag-name mismatch
  // at the parser level, not here.
  let out = xml.replace(/<\?[^?]*\?>/g, '');
  out = out.replace(/\s+xmlns(?::[A-Za-z0-9._-]+)?="[^"]*"/g, '');
  out = out.replace(/\s+mc:Ignorable="[^"]*"/g, '');
  // Collapse whitespace between tags; trim text-node edges is NOT done —
  // run text (`<w:t> a </w:t>`) is significant and lives inside tags, so
  // only `>...whitespace...<` boundaries are normalized.
  out = out.replace(/>\s+</g, '><').trim();
  // Sort attributes alphabetically within each start/self-closing tag.
  out = out.replace(/<([A-Za-z0-9:._-]+)((?:\s+[^<>]*?)?)(\/?)>/g, (_m, name, attrs, selfClose) => {
    const list: string[] = [];
    const re = /([A-Za-z0-9:._-]+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attrs ?? '')) !== null) list.push(`${m[1]}="${m[2]}"`);
    list.sort();
    return `<${name}${list.length ? ' ' + list.join(' ') : ''}${selfClose ? '/' : ''}>`;
  });
  // Normalize `<x></x>` to `<x/>` so empty-element spellings compare equal.
  out = out.replace(/<([A-Za-z0-9:._-]+)((?:\s+[^<>]*?)?)><\/\1>/g, '<$1$2/>');
  return out;
}

/**
 * Assert two OOXML strings are semantically equivalent: equal after
 * canonicalization. Fails with a unified-ish diff of the canonical forms so
 * a mismatch points at the divergence instead of formatting noise.
 */
export function assertOoxmlEquivalent(actual: string, expected: string): void {
  const a = canonicalize(actual);
  const b = canonicalize(expected);
  if (a === b) return;
  // Longest-common-prefix/suffix trim so the failure message shows the
  // divergent middle instead of two wall-of-XML strings.
  let start = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ctx = 120;
  expect(
    `...${a.slice(Math.max(0, start - ctx), endA + ctx)}...\n--- expected ---\n...${b.slice(Math.max(0, start - ctx), endB + ctx)}...`
  ).toBe('(identical canonical XML)');
}
