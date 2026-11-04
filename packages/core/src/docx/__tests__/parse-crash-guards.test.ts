import { describe, test, expect } from 'bun:test';
import { assertSafeEntryPath } from '../unzip';
import { parseXml } from '../xmlParser';
import { parseTable, MAX_TABLE_ROWS, MAX_TABLE_NESTING_DEPTH } from '../tableParser';
import { parseBlockContent, MAX_BLOCK_CONTENT_ITEMS } from '../blockContentParser';
import { parseXmlDocument } from '../xmlParser';

describe('parse-time crash guards', () => {
  test('entry-path guard rejects traversal and absolute paths', () => {
    // JSZip normalizes `..` on generate, so hand-crafted archives are the
    // real threat — unit-test the guard directly.
    expect(() => assertSafeEntryPath('word/media/../../evil.xml')).toThrow(/unsafe entry path/);
    expect(() => assertSafeEntryPath('../evil.xml')).toThrow(/unsafe entry path/);
    expect(() => assertSafeEntryPath('/word/document.xml')).toThrow(/unsafe entry path/);
    expect(() => assertSafeEntryPath('word\\..\\evil.xml')).toThrow(/unsafe entry path/);
    expect(() => assertSafeEntryPath('word/%2e%2e/evil.xml')).toThrow(/unsafe entry path/);
    expect(() => assertSafeEntryPath('word/media/image1.png')).not.toThrow();
    expect(() => assertSafeEntryPath('word/document.xml')).not.toThrow();
  });

  test('xml parser rejects ENTITY declarations (XXE/billion-laughs)', () => {
    expect(() => parseXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY lol "x">]><x/>')).toThrow(
      /ENTITY/
    );
  });

  test('table row cap truncates absurd tables', () => {
    const rows = Array.from(
      { length: MAX_TABLE_ROWS + 10 },
      () => '<w:tr><w:tc><w:p/></w:tc></w:tr>'
    ).join('');
    const root = parseXmlDocument(
      `<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tblGrid/><w:tblPr/>${rows}</w:tbl>`
    );
    const table = parseTable(root!, null, null, null, null, null);
    expect(table.rows.length).toBe(MAX_TABLE_ROWS);
  });

  test('block content cap truncates absurd containers', () => {
    const paras = Array.from({ length: MAX_BLOCK_CONTENT_ITEMS + 10 }, () => '<w:p/>').join('');
    const root = parseXmlDocument(
      `<w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paras}</w:body>`
    );
    const blocks = parseBlockContent(root!, null, null, null, null, null);
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCK_CONTENT_ITEMS);
  });

  test('nested-table depth guard stops malicious recursion', () => {
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const open = `<w:tbl ${NS}><w:tblGrid/><w:tblPr/><w:tr><w:tc>`;
    const close = `</w:tc></w:tr></w:tbl>`;
    // Nest one level deeper than the cap; innermost tables must be dropped.
    let xml = '<w:p/>';
    for (let i = 0; i < MAX_TABLE_NESTING_DEPTH + 3; i++) xml = `${open}${xml}${close}`;
    const root = parseXmlDocument(
      `<w:tbl ${NS}><w:tblGrid/><w:tblPr/><w:tr><w:tc>${xml}</w:tc></w:tr></w:tbl>`
    );
    const table = parseTable(root!, null, null, null, null, null);
    let depth = 0;
    let current = table.rows[0]?.cells[0]?.content.find((c) => c.type === 'table');
    while (current?.type === 'table') {
      depth++;
      const cell = current.rows[0]?.cells[0];
      current = cell?.content.find((c) => c.type === 'table');
      expect(depth).toBeLessThanOrEqual(MAX_TABLE_NESTING_DEPTH + 1);
      if (depth > MAX_TABLE_NESTING_DEPTH + 2) break;
    }
    expect(depth).toBeLessThanOrEqual(MAX_TABLE_NESTING_DEPTH + 1);
  });
});
