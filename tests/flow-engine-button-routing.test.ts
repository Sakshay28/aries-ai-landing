import { describe, it, expect } from 'vitest';
import { resolveReplyEdge } from '../src/lib/flows/engine';

// Regression coverage for the P0 bug: a multi-button "Date Selection" node
// always routed to whichever edge happened to be first in the flow's edges
// array (getNextNode(id, null, edges) ignores sourceHandle), regardless of
// which button the customer actually tapped. If that first edge was the
// 'fallback' wire (e.g. pointed at a "return to AI" node), every tap looked
// like the AI silently taking over the conversation.
//
// resolveReplyEdge is the fix: it resolves the edge from the ACTUAL reply
// (button id, then reply text, then 'fallback') instead of from array order.

const DATE_NODE = 'date_selection';

// Mirrors the reported flow shape: 3 date options + an implicit fallback,
// each wired to a genuinely different downstream node.
const dateOptions = [
  { id: 'btn_2jul', title: '2 Jul' },
  { id: 'btn_23jul', title: '23 Jul - 29 Jul' },
  { id: 'btn_other', title: 'Other' },
];

function buildEdges(order: Array<'2jul' | '23jul' | 'other' | 'fallback'>) {
  const byKey: Record<string, { id: string; source: string; target: string; sourceHandle?: string | null }> = {
    '2jul':     { id: 'e1', source: DATE_NODE, target: 'node_2jul_flow',   sourceHandle: 'btn_2jul' },
    '23jul':    { id: 'e2', source: DATE_NODE, target: 'node_cost_ok',     sourceHandle: 'btn_23jul' },
    'other':    { id: 'e3', source: DATE_NODE, target: 'node_custom_date', sourceHandle: 'btn_other' },
    'fallback': { id: 'e4', source: DATE_NODE, target: 'node_return_to_ai', sourceHandle: 'fallback' },
  };
  return order.map(k => byKey[k]);
}

describe('resolveReplyEdge — multi-button choice node routing', () => {
  it('routes each button to its own distinct target node', () => {
    const edges = buildEdges(['2jul', '23jul', 'other', 'fallback']);

    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { buttonId: 'btn_2jul', text: '2 Jul' }))
      .toBe('node_2jul_flow');
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { buttonId: 'btn_23jul', text: '23 Jul - 29 Jul' }))
      .toBe('node_cost_ok');
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { buttonId: 'btn_other', text: 'Other' }))
      .toBe('node_custom_date');
  });

  it('REGRESSION: routing is independent of edge array order (previously always took array[0])', () => {
    // Same edges, deliberately reordered so the "23 Jul" edge is NOT first —
    // under the old getNextNode(id, null, edges) behavior this would have
    // silently resolved to whichever edge is first instead of btn_23jul's.
    const reordered = buildEdges(['fallback', 'other', '23jul', '2jul']);

    expect(resolveReplyEdge(DATE_NODE, reordered, dateOptions, { buttonId: 'btn_23jul', text: '23 Jul - 29 Jul' }))
      .toBe('node_cost_ok');
    expect(resolveReplyEdge(DATE_NODE, reordered, dateOptions, { buttonId: 'btn_2jul', text: '2 Jul' }))
      .toBe('node_2jul_flow');
  });

  it('falls back to the fallback handle when the reply matches no known button', () => {
    const edges = buildEdges(['2jul', '23jul', 'other', 'fallback']);
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { text: 'asdkjfh nonsense' }))
      .toBe('node_return_to_ai');
  });

  it('matches by reply text when no buttonId is present (WhatsApp text fallback)', () => {
    const edges = buildEdges(['2jul', '23jul', 'other', 'fallback']);
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { text: '23 Jul - 29 Jul' }))
      .toBe('node_cost_ok');
  });

  it('matches case-insensitively and trims whitespace on text replies', () => {
    const edges = buildEdges(['2jul', '23jul', 'other', 'fallback']);
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { text: '  OTHER  ' }))
      .toBe('node_custom_date');
  });

  it('returns undefined (not an arbitrary edge) when nothing matches and no fallback is wired', () => {
    const edges = buildEdges(['2jul', '23jul']); // no fallback edge at all
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { text: 'gibberish' })).toBeUndefined();
  });

  it('an unrelated node id with a same-named handle elsewhere in the graph is not matched', () => {
    const edges = buildEdges(['2jul', '23jul', 'other', 'fallback']);
    // A completely different source node happens to reuse the 'btn_23jul' handle name —
    // resolveReplyEdge must only ever look at edges whose source is the node we asked about.
    edges.push({ id: 'e5', source: 'unrelated_node', target: 'node_should_not_be_reached', sourceHandle: 'btn_23jul' });
    expect(resolveReplyEdge(DATE_NODE, edges, dateOptions, { buttonId: 'btn_23jul', text: '23 Jul - 29 Jul' }))
      .toBe('node_cost_ok');
  });
});
