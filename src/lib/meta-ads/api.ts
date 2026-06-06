import { decryptAccessToken } from './oauth';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

function headers(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function metaFetch<T>(url: string, accessToken: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(accessToken), ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Meta API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  return res.json();
}

// ═══════════════════════════════════════
// CAMPAIGN MANAGEMENT
// ═══════════════════════════════════════

export async function createMetaCampaign(
  encryptedToken: string,
  adAccountId: string,
  params: {
    name: string;
    objective: string;
    status?: string;
    special_ad_categories?: string[];
  }
): Promise<{ id: string }> {
  const token = decryptAccessToken(encryptedToken);
  return metaFetch(
    `${META_GRAPH_BASE}/${adAccountId}/campaigns`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        name: params.name,
        objective: params.objective,
        status: params.status || 'PAUSED',
        special_ad_categories: params.special_ad_categories || ['NONE'],
      }),
    }
  );
}

export async function createMetaAdSet(
  encryptedToken: string,
  adAccountId: string,
  params: {
    name: string;
    campaign_id: string;
    optimization_goal: string;
    billing_event: string;
    bid_strategy?: string;
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    end_time?: string;
    targeting: Record<string, unknown>;
    destination_type?: string;
    promoted_object?: Record<string, unknown>;
    status?: string;
  }
): Promise<{ id: string }> {
  const token = decryptAccessToken(encryptedToken);
  const body: Record<string, unknown> = {
    name: params.name,
    campaign_id: params.campaign_id,
    optimization_goal: params.optimization_goal,
    billing_event: params.billing_event,
    targeting: params.targeting,
    status: params.status || 'PAUSED',
  };

  if (params.bid_strategy) body.bid_strategy = params.bid_strategy;
  if (params.daily_budget) body.daily_budget = Math.round(params.daily_budget * 100);
  if (params.lifetime_budget) body.lifetime_budget = Math.round(params.lifetime_budget * 100);
  if (params.start_time) body.start_time = params.start_time;
  if (params.end_time) body.end_time = params.end_time;
  if (params.destination_type) body.destination_type = params.destination_type;
  if (params.promoted_object) body.promoted_object = params.promoted_object;

  return metaFetch(`${META_GRAPH_BASE}/${adAccountId}/adsets`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createMetaAdCreative(
  encryptedToken: string,
  adAccountId: string,
  params: {
    name: string;
    page_id: string;
    primary_text: string;
    headline: string;
    description?: string;
    cta: string;
    image_url?: string;
    video_id?: string;
    whatsapp_number: string;
  }
): Promise<{ id: string }> {
  const token = decryptAccessToken(encryptedToken);

  const linkData: Record<string, unknown> = {
    message: params.primary_text,
    name: params.headline,
    call_to_action: {
      type: params.cta || 'WHATSAPP_MESSAGE',
      value: {
        app_destination: 'WHATSAPP',
        whatsapp_number: params.whatsapp_number,
      },
    },
  };

  if (params.description) linkData.description = params.description;
  if (params.image_url) linkData.picture = params.image_url;

  const body: Record<string, unknown> = {
    name: params.name,
    object_story_spec: {
      page_id: params.page_id,
      link_data: linkData,
    },
  };

  return metaFetch(`${META_GRAPH_BASE}/${adAccountId}/adcreatives`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createMetaAd(
  encryptedToken: string,
  adAccountId: string,
  params: {
    name: string;
    adset_id: string;
    creative_id: string;
    status?: string;
  }
): Promise<{ id: string }> {
  const token = decryptAccessToken(encryptedToken);
  return metaFetch(`${META_GRAPH_BASE}/${adAccountId}/ads`, token, {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      adset_id: params.adset_id,
      creative: { creative_id: params.creative_id },
      status: params.status || 'PAUSED',
    }),
  });
}

export async function updateMetaCampaignStatus(
  encryptedToken: string,
  metaCampaignId: string,
  status: 'ACTIVE' | 'PAUSED' | 'DELETED'
): Promise<{ success: boolean }> {
  const token = decryptAccessToken(encryptedToken);
  return metaFetch(`${META_GRAPH_BASE}/${metaCampaignId}`, token, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

// ═══════════════════════════════════════
// INSIGHTS (ANALYTICS)
// ═══════════════════════════════════════

export interface MetaInsight {
  impressions: string;
  clicks: string;
  spend: string;
  actions?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
}

export async function fetchCampaignInsights(
  encryptedToken: string,
  metaCampaignId: string,
  dateFrom: string,
  dateTo: string,
  level: 'campaign' | 'adset' | 'ad' = 'campaign'
): Promise<MetaInsight[]> {
  const token = decryptAccessToken(encryptedToken);
  const params = new URLSearchParams({
    fields: 'impressions,clicks,spend,actions',
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    time_increment: '1',
    level,
    access_token: token,
  });

  const data = await metaFetch<{ data: MetaInsight[] }>(
    `${META_GRAPH_BASE}/${metaCampaignId}/insights?${params.toString()}`,
    token
  );
  return data.data || [];
}

export async function fetchAccountInsights(
  encryptedToken: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string
): Promise<MetaInsight[]> {
  const token = decryptAccessToken(encryptedToken);
  const params = new URLSearchParams({
    fields: 'impressions,clicks,spend,actions',
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    time_increment: '1',
    access_token: token,
  });

  const data = await metaFetch<{ data: MetaInsight[] }>(
    `${META_GRAPH_BASE}/${adAccountId}/insights?${params.toString()}`,
    token
  );
  return data.data || [];
}

// ═══════════════════════════════════════
// TARGETING SEARCH
// ═══════════════════════════════════════

export async function searchTargetingInterests(
  encryptedToken: string,
  query: string
): Promise<{ id: string; name: string; audience_size: number; path: string[] }[]> {
  const token = decryptAccessToken(encryptedToken);
  const params = new URLSearchParams({
    type: 'adinterest',
    q: query,
    limit: '25',
    access_token: token,
  });

  const data = await metaFetch<{ data: any[] }>(
    `${META_GRAPH_BASE}/search?${params.toString()}`,
    token
  );
  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    audience_size: item.audience_size_lower_bound || 0,
    path: item.path || [],
  }));
}

export async function searchTargetingLocations(
  encryptedToken: string,
  query: string
): Promise<{ key: string; name: string; type: string; country_name?: string }[]> {
  const token = decryptAccessToken(encryptedToken);
  const params = new URLSearchParams({
    type: 'adgeolocation',
    q: query,
    location_types: '["city","region","country"]',
    limit: '25',
    access_token: token,
  });

  const data = await metaFetch<{ data: any[] }>(
    `${META_GRAPH_BASE}/search?${params.toString()}`,
    token
  );
  return (data.data || []).map((item: any) => ({
    key: item.key,
    name: item.name,
    type: item.type,
    country_name: item.country_name,
  }));
}

// ═══════════════════════════════════════
// MEDIA UPLOAD
// ═══════════════════════════════════════

export async function uploadAdImage(
  encryptedToken: string,
  adAccountId: string,
  imageUrl: string
): Promise<{ hash: string; url: string }> {
  const token = decryptAccessToken(encryptedToken);
  const res = await fetch(`${META_GRAPH_BASE}/${adAccountId}/adimages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      access_token: token,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta image upload failed: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const images = data.images || {};
  const firstKey = Object.keys(images)[0];
  return {
    hash: images[firstKey]?.hash || '',
    url: images[firstKey]?.url || imageUrl,
  };
}
