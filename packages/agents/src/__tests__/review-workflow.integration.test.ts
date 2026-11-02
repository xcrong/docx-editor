/**
 * review-plugin 10.1 + 10.2 — headless integration workflows over real DOCX
 * fixtures (no DOM, no editor instance).
 *
 * 10.1 Full headless workflow: parse → getContent → getChanges →
 * accept/reject → addComment → export → re-parse → verify.
 *
 * 10.2 Simulated agent batch: getContent → (mock LLM picks ops) →
 * applyReview batch → export → verify comments + tracked changes in output.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';
import { DocxReviewer } from '../DocxReviewer';

const TRACKED_FIXTURE = path.resolve(
  __dirname,
  '../../../../e2e/fixtures/tracked-changes-roundtrip.docx'
);
const STYLED_FIXTURE = path.resolve(__dirname, '../../../../e2e/fixtures/styled-content.docx');

function bufOf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('review-plugin 10.1 — full headless workflow', () => {
  test('parse → getContent → getChanges → accept/reject → addComment → export → re-parse', async () => {
    // Parse a DOCX carrying tracked changes.
    const reviewer = await DocxReviewer.fromBuffer(bufOf(TRACKED_FIXTURE), 'AI');

    // Read: annotated content surfaces both pending changes.
    const blocks = reviewer.getContent();
    expect(blocks.length).toBeGreaterThan(0);
    const annotated = reviewer.getContentAsText();
    expect(annotated).toContain('[+inserted phrase+]{by:Alice}');
    expect(annotated).toContain('[-deleted phrase-]{by:Bob}');

    // Discover: one insertion + one deletion.
    const changes = reviewer.getChanges();
    expect(changes).toHaveLength(2);
    const insertion = changes.find((c) => c.type === 'insertion');
    const deletion = changes.find((c) => c.type === 'deletion');
    expect(insertion?.text).toBe('inserted phrase');
    expect(deletion?.text).toBe('deleted phrase');

    // Resolve: accept the insertion, reject the deletion (restores its text).
    reviewer.acceptChange(insertion!.id);
    reviewer.rejectChange(deletion!.id);
    expect(reviewer.getChanges()).toHaveLength(0);

    // Comment + reply on the resolved paragraph.
    const commentId = reviewer.addComment({ paragraphIndex: 0, text: 'Reads well now.' });
    reviewer.replyTo(commentId, { text: 'Agreed.' });

    // Export → re-parse → verify everything survived the round-trip.
    const reloaded = await DocxReviewer.fromBuffer(await reviewer.toBuffer(), 'AI');
    expect(reloaded.getChanges()).toHaveLength(0);

    const comments = reloaded.getComments();
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ text: 'Reads well now.' });
    expect(comments[0].replies).toHaveLength(1);
    expect(comments[0].replies[0].text).toBe('Agreed.');

    const text = reloaded.getContentAsText();
    expect(text).toContain('inserted phrase');
    expect(text).toContain('deleted phrase');
  });
});

describe('review-plugin 10.2 — simulated agent batch workflow', () => {
  test('getContent → mock LLM → applyReview → export → verify', async () => {
    const reviewer = await DocxReviewer.fromBuffer(bufOf(STYLED_FIXTURE), 'Agent');
    expect(reviewer.getChanges()).toHaveLength(0);
    expect(reviewer.getComments()).toHaveLength(0);

    // Pass 1 — the "LLM" reads the snapshot and emits a batch of ops.
    const snapshot = reviewer.getContentAsText();
    expect(snapshot).toContain('Centered paragraph.');
    const target = reviewer
      .getContent()
      .find((b) => b.type === 'paragraph' && b.text.includes('Centered paragraph.'));
    expect(target).toBeDefined();

    const pass1 = reviewer.applyReview({
      comments: [{ paragraphIndex: target!.index, text: 'Center this heading, please.' }],
      proposals: [
        {
          paragraphIndex: target!.index,
          search: 'Centered paragraph.',
          replaceWith: 'Centered paragraph (reviewed).',
        },
      ],
    });
    expect(pass1.errors).toEqual([]);
    expect(pass1).toMatchObject({ commentsAdded: 1, proposalsAdded: 1 });

    // Pass 2 — the agent re-reads, then replies + accepts the staged changes.
    const staged = reviewer.getChanges();
    expect(staged.length).toBeGreaterThan(0);
    const liveCommentId = reviewer.getComments()[0].id;
    const pass2 = reviewer.applyReview({
      accept: staged.map((c) => c.id),
      replies: [{ commentId: liveCommentId, text: 'Done.' }],
    });
    expect(pass2.errors).toEqual([]);
    expect(pass2.accepted).toBe(staged.length);
    expect(pass2.repliesAdded).toBe(1);

    // Export → re-parse → verify the reviewed output.
    const reloaded = await DocxReviewer.fromBuffer(await reviewer.toBuffer(), 'Agent');
    expect(reloaded.getChanges()).toHaveLength(0);

    const comments = reloaded.getComments();
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toContain('Center this heading');
    expect(comments[0].replies).toHaveLength(1);
    expect(comments[0].replies[0].text).toBe('Done.');

    expect(reloaded.getContentAsText()).toContain('Centered paragraph (reviewed).');
  });
});
