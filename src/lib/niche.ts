// Picks the closest niche pack for a business described in the owner's own words.
import { aiEnabled, classifyNicheWithAi } from "./ai";
import { fallbackPackId, packsForMarket, type MarketCode } from "./config";

export function matchNicheByKeywords(description: string, market: MarketCode | null): string {
  const text = ` ${description.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  let best = { id: fallbackPackId, hits: 0 };
  for (const pack of packsForMarket(market)) {
    const hits = pack.keywords.filter((k) => text.includes(` ${k.toLowerCase()}`)).length;
    if (hits > best.hits) best = { id: pack.id, hits };
  }
  return best.id;
}

export async function matchNiche(description: string, market: MarketCode | null): Promise<string> {
  const byKeywords = matchNicheByKeywords(description, market);
  if (byKeywords !== fallbackPackId || !aiEnabled()) return byKeywords;
  const options = packsForMarket(market).map((p) => ({ id: p.id, name: p.name, description: p.description }));
  return (await classifyNicheWithAi(description, options)) ?? fallbackPackId;
}
