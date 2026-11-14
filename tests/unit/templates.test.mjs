import test from 'node:test';
import assert from 'node:assert/strict';
import { SEGMENTS } from '../../public/js/core/templates.js';
import { normalizeService } from '../../public/js/core/settings.js';

test('modelos por segmento trazem serviços válidos para começar', () => {
  assert.deepEqual(Object.keys(SEGMENTS), ['manicure', 'barbearia', 'cabeleireiro', 'sobrancelhas', 'estetica']);
  for (const [key, seg] of Object.entries(SEGMENTS)) {
    assert.ok(seg.label && /^#[0-9a-f]{6}$/.test(seg.accent), key);
    assert.ok(seg.services.length >= 3, key);
    seg.services.forEach((s, i) => {
      const n = normalizeService({ ...s, order: i + 1 });
      assert.equal(n.name, s.name);
      assert.equal(n.duration, s.duration);
    });
  }
});
