/**
 * Ocean — Creator Monetization Engine backend (feature #255)
 * -----------------------------------------------------------
 * Revenue Dashboard (tips + gifts + deals + affiliate + subs), Brand Deal
 * Marketplace, Affiliate Links, Creator CRM (fan management) and Sponsorship
 * tiers — all wired to the coin wallet for actual value flow.
 *
 *   GET  /api/creator/dashboard              aggregated revenue + fans + tiers
 *   POST /api/creator/deals                  brands post opportunities
 *   GET  /api/creator/deals                  open deals (creator view)
 *   GET  /api/creator/deals/mine             deals I posted
 *   POST /api/creator/deals/:id/apply        creator applies
 *   POST /api/creator/deals/:id/accept       brand accepts + pays (wallet escrow-less)
 *   POST /api/creator/affiliate              create trackable link
 *   GET  /api/creator/affiliate              my links (+ clicks, revenue)
 *   POST /api/creator/affiliate/:id/click    register a click/conversion
 *   POST /api/creator/fans                   add / update fan note + tier
 *   GET  /api/creator/fans                   my fan CRM
 *   POST /api/creator/tiers                  create sponsorship tier
 *   GET  /api/creator/tiers                  my tiers
 *   POST /api/creator/tiers/:id/subscribe    fans subscribe (coins)
 * State in creatormonet.json; coins in community.json.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface Deal { id: string; brandId: string; brandName: string; title: string; description: string; budget: number; niche: string; status: 'open' | 'closed'; applicants: { id: string; name: string; at: number }[]; acceptedId?: string; createdAt: number }
export interface AffiliateLink { id: string; creatorId: string; label: string; code: string; clicks: number; conversions: number; revenue: number; createdAt: number }
export interface FanRecord { id: string; creatorId: string; fanId: string; fanName: string; note: string; tier: string; at: number }
export interface SponsorTier { id: string; creatorId: string; name: string; price: number; perks: string[]; subscribers: string[]; createdAt: number }
export interface IncomeLedger { id: string; creatorId: string; source: string; amount: number; note?: string; at: number }

interface CMStore { deals: Deal[]; affiliates: AffiliateLink[]; fans: FanRecord[]; tiers: SponsorTier[]; ledger: IncomeLedger[] }

const store = makeJsonStore<CMStore>('creatormonet.json', () => ({ deals: [], affiliates: [], fans: [], tiers: [], ledger: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function registerCreatorMonetizationRoutes(app: express.Express) {
  const { requireAuth, loadCommunity, saveCommunity, loadDatabase } = getCtx();

  // --- Revenue dashboard -----------------------------------------------------------
  app.get('/api/creator/dashboard', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const community = loadCommunity();
    const tips = (community.tips || []).filter((t: any) => t.to === me.id);
    const tipTotal = tips.reduce((a: number, t: any) => a + (t.amount || 0), 0);
    const tipFanIds = new Set(tips.map((t: any) => t.from));

    // gifts from liveeco.json (feature #252)
    let giftTotal = 0;
    const giftFanIds = new Set<string>();
    try {
      const livePath = path.join(process.cwd(), 'liveeco.json');
      if (fs.existsSync(livePath)) {
        const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
        for (const g of live.gifts || []) {
          if (g.to === me.id) { giftTotal += g.cost || 0; giftFanIds.add(String(g.from)); }
        }
      }
    } catch { /* noop */ }

    const affiliateTotal = s.affiliates.filter((a) => a.creatorId === me.id).reduce((acc, a) => acc + a.revenue, 0);
    const dealIncome = s.ledger.filter((l) => l.creatorId === me.id && l.source === 'deal').reduce((acc, l) => acc + l.amount, 0);
    const subIncome = s.tiers.filter((t) => t.creatorId === me.id).reduce((acc, t) => acc + t.subscribers.length * t.price, 0);
    const myFans = s.fans.filter((f) => f.creatorId === me.id);

    const fanIds = new Set<string>();
    tipFanIds.forEach((id) => { if (id) fanIds.add(String(id)); });
    giftFanIds.forEach((id) => { if (id) fanIds.add(String(id)); });
    myFans.forEach((f) => fanIds.add(f.fanId));
    const recent = s.ledger
      .filter((l) => l.creatorId === me.id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 10)
      .map((l) => ({ ...l, at: l.at }));

    res.json({
      earnings: { tips: tipTotal, gifts: giftTotal, affiliate: affiliateTotal, deals: dealIncome, subscriptions: subIncome, total: tipTotal + giftTotal + affiliateTotal + dealIncome + subIncome },
      walletBalance: community.balances[me.id] || 0,
      fans: { unique: fanIds.size, notes: myFans.length, tierSubscribers: s.tiers.filter((t) => t.creatorId === me.id).reduce((a, t) => a + t.subscribers.length, 0) },
      recentTransactions: recent,
    });
  });

  // --- Brand deals --------------------------------------------------------------------
  app.post('/api/creator/deals', requireAuth, (req, res) => {
    const me = (req as any).user;
    const title = String(req.body?.title || '').trim().slice(0, 80);
    const description = String(req.body?.description || '').trim().slice(0, 400);
    const budget = Math.max(10, Math.min(Number(req.body?.budget) || 0, 500000));
    const niche = String(req.body?.niche || 'general').slice(0, 30);
    if (!title || !description || !budget) return res.status(400).json({ error: 'Title, description and budget are required.' });
    const deal: Deal = {
      id: uid('deal'), brandId: me.id, brandName: me.name || me.username || 'Brand',
      title, description, budget, niche, status: 'open', applicants: [], createdAt: Date.now(),
    };
    store.load().deals.unshift(deal);
    store.persist();
    res.json({ deal });
  });

  app.get('/api/creator/deals', requireAuth, (req, res) => {
    const me = (req as any).user;
    const deals = store.load().deals
      .filter((d) => d.status === 'open' && d.brandId !== me.id)
      .map((d) => ({ ...d, applied: d.applicants.some((a) => a.id === me.id) }));
    res.json({ deals });
  });

  app.get('/api/creator/deals/mine', requireAuth, (req, res) => {
    const me = (req as any).user;
    const deals = store.load().deals.filter((d) => d.brandId === me.id);
    res.json({ deals });
  });

  app.post('/api/creator/deals/:id/apply', requireAuth, (req, res) => {
    const me = (req as any).user;
    const deal = store.load().deals.find((d) => d.id === req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found.' });
    if (deal.brandId === me.id) return res.status(400).json({ error: 'You cannot apply to your own deal.' });
    if (deal.applicants.some((a) => a.id === me.id)) return res.status(400).json({ error: 'You already applied.' });
    deal.applicants.push({ id: me.id, name: me.name || me.username || 'User', at: Date.now() });
    store.persist();
    res.json({ deal });
  });

  app.post('/api/creator/deals/:id/accept', requireAuth, (req, res) => {
    const me = (req as any).user;
    const deal = store.load().deals.find((d) => d.id === req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found.' });
    if (deal.brandId !== me.id) return res.status(403).json({ error: 'Only the brand can accept an applicant.' });
    const applicantId = String(req.body?.applicantId || '');
    if (!applicantId || !deal.applicants.some((a) => a.id === applicantId)) {
      return res.status(400).json({ error: 'Applicant not found on this deal.' });
    }
    const community = loadCommunity();
    if (!spendBalance(community, me.id, deal.budget)) {
      saveCommunity(community);
      return res.status(402).json({ error: `You need ${deal.budget} coins to pay this deal (balance ${community.balances[me.id] || 0}).` });
    }
    addBalance(community, applicantId, deal.budget);
    saveCommunity(community);
    deal.status = 'closed';
    deal.acceptedId = applicantId;
    store.load().ledger.push({ id: uid('inc'), creatorId: applicantId, source: 'deal', amount: deal.budget, note: deal.title, at: Date.now() });
    store.persist();
    res.json({ deal, note: `Paid ${deal.budget} coins to the creator.` });
  });

  // --- Affiliate links ----------------------------------------------------------------------
  app.post('/api/creator/affiliate', requireAuth, (req, res) => {
    const me = (req as any).user;
    const label = String(req.body?.label || '').trim().slice(0, 60);
    if (!label) return res.status(400).json({ error: 'Link label is required.' });
    const code = `oc-${me.id.slice(-6)}-${Date.now().toString(36)}`;
    const link: AffiliateLink = { id: uid('aff'), creatorId: me.id, label, code, clicks: 0, conversions: 0, revenue: 0, createdAt: Date.now() };
    store.load().affiliates.unshift(link);
    store.persist();
    res.json({ link, url: `https://ocean.app/r/${code}` });
  });

  app.get('/api/creator/affiliate', requireAuth, (req, res) => {
    const me = (req as any).user;
    const links = store.load().affiliates.filter((a) => a.creatorId === me.id);
    res.json({ links });
  });

  app.post('/api/creator/affiliate/:id/click', requireAuth, (req, res) => {
    const me = (req as any).user;
    const link = store.load().affiliates.find((a) => a.id === req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found.' });
    if (link.creatorId !== me.id) return res.status(403).json({ error: 'Only the link owner can record clicks.' });
    link.clicks += 1;
    if (req.body?.conversion) {
      link.conversions += 1;
      const revenue = Math.max(1, Math.floor(Number(req.body.revenue) || 1));
      link.revenue += revenue;
      store.load().ledger.push({ id: uid('inc'), creatorId: link.creatorId, source: 'affiliate', amount: revenue, note: link.label, at: Date.now() });
    }
    store.persist();
    res.json({ link });
  });

  // --- Fan CRM ---------------------------------------------------------------------------------
  app.post('/api/creator/fans', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const fanId = String(req.body?.fanId || '');
    if (!fanId) return res.status(400).json({ error: 'fanId is required.' });
    const fan = (db?.users || []).find((u: any) => u.id === fanId);
    const existing = store.load().fans.find((f) => f.creatorId === me.id && f.fanId === fanId);
    if (existing) {
      existing.note = String(req.body?.note || existing.note).slice(0, 300);
      existing.tier = String(req.body?.tier || existing.tier || 'fan');
      store.persist();
      return res.json({ fan: existing });
    }
    const rec: FanRecord = {
      id: uid('fan'), creatorId: me.id, fanId, fanName: fan?.name || fan?.username || 'Fan',
      note: String(req.body?.note || '').slice(0, 300), tier: String(req.body?.tier || 'fan'), at: Date.now(),
    };
    store.load().fans.unshift(rec);
    store.persist();
    res.json({ fan: rec });
  });

  app.get('/api/creator/fans', requireAuth, (req, res) => {
    const me = (req as any).user;
    const fans = store.load().fans.filter((f) => f.creatorId === me.id);
    res.json({ fans });
  });

  // --- Sponsorship tiers ------------------------------------------------------------------------
  app.post('/api/creator/tiers', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 40);
    const price = Math.max(5, Math.min(Number(req.body?.price) || 0, 100000));
    const perks = Array.isArray(req.body?.perks) ? req.body.perks.slice(0, 5).map((p: string) => String(p).slice(0, 80)) : [];
    if (!name || !price) return res.status(400).json({ error: 'Tier name and price are required.' });
    const tier: SponsorTier = { id: uid('tier'), creatorId: me.id, name, price, perks, subscribers: [], createdAt: Date.now() };
    store.load().tiers.unshift(tier);
    store.persist();
    res.json({ tier });
  });

  app.get('/api/creator/tiers', requireAuth, (req, res) => {
    const me = (req as any).user;
    const mine = store.load().tiers.filter((t) => t.creatorId === me.id);
    const others = store.load().tiers.filter((t) => t.creatorId !== me.id && !t.subscribers.includes(me.id));
    res.json({ mine, others });
  });

  app.post('/api/creator/tiers/:id/subscribe', requireAuth, (req, res) => {
    const me = (req as any).user;
    const tier = store.load().tiers.find((t) => t.id === req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found.' });
    if (tier.creatorId === me.id) return res.status(400).json({ error: 'You cannot subscribe to your own tier.' });
    const community = loadCommunity();
    if (!spendBalance(community, me.id, tier.price)) {
      saveCommunity(community);
      return res.status(402).json({ error: `You need ${tier.price} coins (balance ${community.balances[me.id] || 0}).` });
    }
    addBalance(community, tier.creatorId, tier.price);
    saveCommunity(community);
    if (!tier.subscribers.includes(me.id)) tier.subscribers.push(me.id);
    store.load().ledger.push({ id: uid('inc'), creatorId: tier.creatorId, source: 'subscription', amount: tier.price, note: tier.name, at: Date.now() });
    store.persist();
    res.json({ tier, balance: community.balances[me.id] || 0 });
  });
}
