// ═══════════════════════════════════════════════════════════
// 🎯 Meta Ads — Targeting Search (interests + locations)
// ═══════════════════════════════════════════════════════════
// Proxies Meta's targeting search API for the campaign wizard.
// ?type=interests|locations&q=...
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getConnectionToken, errorResponse } from '@/lib/meta-ads/guard';
import { searchTargetingInterests, searchTargetingLocations } from '@/lib/meta-ads/api';

// Curated quick-pick presets so the wizard works even before a search.
const PRESET_INTERESTS = [
  { id: '6003277229371', name: 'Restaurants', category: 'Food' },
  { id: '6003348604581', name: 'Foodies', category: 'Food' },
  { id: '6002868910910', name: 'Fine dining', category: 'Food' },
  { id: '6003107902433', name: 'Travel', category: 'Travel' },
  { id: '6003456724289', name: 'Tourism', category: 'Travel' },
  { id: '6003020834693', name: 'Business travel', category: 'Travel' },
  { id: '6002991239659', name: 'Luxury goods', category: 'Lifestyle' },
];

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'interests';
    const q = searchParams.get('q') || '';

    if (!q || q.length < 2) {
      // Return presets for the interests picker
      if (type === 'interests') {
        return NextResponse.json({ results: PRESET_INTERESTS });
      }
      return NextResponse.json({ results: [] });
    }

    // The api helpers expect the ENCRYPTED token (they decrypt internally),
    // so pass connection.access_token rather than the decrypted form.
    const { connection } = await getConnectionToken(tenantId);

    if (type === 'locations') {
      const results = await searchTargetingLocations(connection.access_token, q);
      return NextResponse.json({ results });
    }

    const results = await searchTargetingInterests(connection.access_token, q);
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
