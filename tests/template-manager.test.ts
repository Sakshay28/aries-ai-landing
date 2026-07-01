import { describe, it, expect } from 'vitest';
import { mapVariablesToPositional } from '../src/lib/whatsapp/templateManager';

// ═══════════════════════════════════════
// Template Manager — positional variable mapping
// ═══════════════════════════════════════
describe('mapVariablesToPositional', () => {
  it('maps named variables into Meta positional order', () => {
    const variableMap = { customer_name: 1, reservation_id: 2 };
    const vars = { customer_name: 'Ravi', reservation_id: 'RES-1234' };
    expect(mapVariablesToPositional(variableMap, vars)).toEqual(['Ravi', 'RES-1234']);
  });

  it('handles out-of-order index declaration', () => {
    const variableMap = { reservation_id: 2, customer_name: 1 };
    const vars = { customer_name: 'Ravi', reservation_id: 'RES-1234' };
    expect(mapVariablesToPositional(variableMap, vars)).toEqual(['Ravi', 'RES-1234']);
  });

  it('missing values render as empty string, never block the send', () => {
    const variableMap = { customer_name: 1, reservation_id: 2 };
    const vars = { customer_name: 'Ravi' };
    expect(mapVariablesToPositional(variableMap, vars)).toEqual(['Ravi', '']);
  });

  it('empty variableMap yields an empty positional array', () => {
    expect(mapVariablesToPositional({}, { customer_name: 'Ravi' })).toEqual([]);
  });

  it('ignores indices outside the 1..maxIndex range defensively', () => {
    const variableMap = { customer_name: 1, weird: 0 };
    const vars = { customer_name: 'Ravi', weird: 'should not appear' };
    expect(mapVariablesToPositional(variableMap, vars)).toEqual(['Ravi']);
  });
});
