import assert from 'node:assert/strict';
import test from 'node:test';

const {
  COMPOSE_DRAFT_CACHE_VERSION,
  clearComposeDraftCache,
  composeDraftCacheKey,
  readComposeDraftCache,
  writeComposeDraftCache,
} = await import('./compose-draft-cache.ts');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test('compose cache round-trips all address fields and the full body', () => {
  const storage = memoryStorage();
  const snapshot = {
    version: COMPOSE_DRAFT_CACHE_VERSION,
    userId: 'user-1',
    draftId: '00000000-0000-4000-8000-000000000001',
    from: 'owner@logivn.com',
    to: 'to@example.com',
    cc: 'cc@example.com',
    bcc: 'bcc@example.com',
    subject: '  Subject spacing  ',
    text: '\nFull body\nwith every line preserved.\n',
    inReplyTo: '<message@example.com>',
    references: '<root@example.com> <message@example.com>',
    attachments: [{ id: 'file-1', filename: 'proposal.pdf', contentType: 'application/pdf', size: 4096 }],
    updatedAt: 1234,
  };

  assert.equal(writeComposeDraftCache(storage, snapshot), true);
  assert.deepEqual(readComposeDraftCache(storage, 'user-1', ['owner@logivn.com']), snapshot);
});

test('compose cache restores attachment metadata without persisting file content', () => {
  const storage = memoryStorage();
  storage.setItem(composeDraftCacheKey('user-1'), JSON.stringify({
    version: COMPOSE_DRAFT_CACHE_VERSION,
    userId: 'user-1',
    draftId: null,
    from: 'owner@logivn.com',
    to: '', cc: '', bcc: '', subject: '', text: '', inReplyTo: null, references: null,
    attachments: [{ id: 'file-1', filename: 'secret.txt', contentType: 'text/plain', size: 12, contentBase64: 'c2VjcmV0' }],
    updatedAt: Date.now(),
  }));

  const restored = readComposeDraftCache(storage, 'user-1', ['owner@logivn.com']);
  assert.deepEqual(restored?.attachments, [{ id: 'file-1', filename: 'secret.txt', contentType: 'text/plain', size: 12 }]);
  assert.equal('contentBase64' in restored.attachments[0], false);
});

test('compose cache is user-scoped and cleanup removes the saved draft', () => {
  const storage = memoryStorage();
  storage.setItem(composeDraftCacheKey('user-1'), JSON.stringify({ version: COMPOSE_DRAFT_CACHE_VERSION, userId: 'user-2' }));
  assert.equal(readComposeDraftCache(storage, 'user-1', ['owner@logivn.com']), null);
  clearComposeDraftCache(storage, 'user-1');
  assert.equal(storage.getItem(composeDraftCacheKey('user-1')), null);
});

test('compose cache drops a draft id when its mailbox is no longer authorized', () => {
  const storage = memoryStorage();
  const snapshot = {
    version: COMPOSE_DRAFT_CACHE_VERSION,
    userId: 'user-1',
    draftId: '00000000-0000-4000-8000-000000000001',
    from: 'former@logivn.com',
    to: 'to@example.com', cc: '', bcc: '', subject: 'Keep the body', text: 'Draft body',
    inReplyTo: null, references: null, attachments: [], updatedAt: Date.now(),
  };
  writeComposeDraftCache(storage, snapshot);
  const restored = readComposeDraftCache(storage, 'user-1', ['current@logivn.com']);
  assert.equal(restored?.from, 'current@logivn.com');
  assert.equal(restored?.draftId, null);
  assert.equal(restored?.text, 'Draft body');
});
