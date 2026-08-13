/**
 * Ocean — Digital Contract Builder (Feature 210)
 * ------------------------------------------------
 * Contracts from templates (agreement, NDA, service, rental, freelance) with
 * parties, terms and e-signatures. Signing appends a signedAt + signer entry;
 * a contract is "executed" once all parties have signed.
 *
 * Model (global db): db.contracts — array of
 *   { id, template, title, ownerId, ownerName, parties: { id, name, email }[],
 *     terms: string, status: 'draft'|'sent'|'executed',
 *     signatures: { partyId, name, signedAt }[], createdAt }
 *
 * Routes:
 *   GET  /api/contracts              (auth) contracts I own or am a party to
 *   POST /api/contracts              (auth) create from template
 *   POST /api/contracts/:id/sign     (auth) sign as one of the parties
 *   GET  /api/contracts/templates    (public) template list
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ContractParty { id: string; name: string; email?: string }
export interface Contract {
  id: string;
  template: string;
  title: string;
  ownerId: string;
  ownerName: string;
  parties: ContractParty[];
  terms: string;
  status: 'draft' | 'sent' | 'executed';
  signatures: { partyId: string; name: string; signedAt: number }[];
  createdAt: number;
}

export const CONTRACT_TEMPLATES: Record<string, { title: string; terms: string }> = {
  service: {
    title: 'Service Agreement',
    terms: 'Party A agrees to provide the described services to Party B in exchange for the agreed fee. Scope, deadlines and deliverables are listed in the attached schedule. Either party may terminate with 14 days notice.',
  },
  nda: {
    title: 'Non-Disclosure Agreement',
    terms: 'The receiving party agrees to keep all confidential information strictly private, use it only for the stated purpose, and return or destroy it on request. This obligation survives termination.',
  },
  freelance: {
    title: 'Freelance Work Contract',
    terms: 'The contractor delivers the agreed scope for the agreed fee, 50% on signing and 50% on delivery. Revisions beyond the scope are billed separately. IP transfers on full payment.',
  },
  rental: {
    title: 'Rental Agreement',
    terms: 'The owner rents the described asset to the renter at the agreed rate. The renter is responsible for damages beyond normal wear. Security deposit refundable within 7 days of return.',
  },
  partnership: {
    title: 'Partnership Agreement',
    terms: 'The partners share roles, costs and profits as described. Major decisions require unanimous consent. Either partner may exit with 30 days notice and a fair settlement.',
  },
};

function uid(): string {
  return `ctr-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.contracts)) db.contracts = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerContractRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/contracts/templates', (_req, res) => {
    res.json({ templates: Object.entries(CONTRACT_TEMPLATES).map(([id, t]) => ({ id, title: t.title })) });
  });

  app.get('/api/contracts', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.contracts as Contract[]).filter((c) => c.ownerId === user.id || c.parties.some((p) => p.id === user.id));
    res.json({ contracts: mine });
  });

  app.post('/api/contracts', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const template = b.template;
    if (!CONTRACT_TEMPLATES[template]) return res.status(400).json({ error: 'Unknown template.' });
    const parties: ContractParty[] = Array.isArray(b.parties) ? b.parties.slice(0, 10).map((p: any) => ({
      id: s(p.id, 100), name: s(p.name, 80), email: s(p.email, 120),
    })).filter((p: ContractParty) => p.id) : [];
    if (parties.length === 0) return res.status(400).json({ error: 'At least one counterparty is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const tpl = CONTRACT_TEMPLATES[template];
    const contract: Contract = {
      id: uid(),
      template,
      title: s(b.title, 120) || tpl.title,
      ownerId: user.id,
      ownerName: user.name || user.username || 'User',
      parties,
      terms: s(b.terms, 4000) || tpl.terms,
      status: 'sent',
      signatures: [],
      createdAt: Date.now(),
    };
    (db.contracts as Contract[]).unshift(contract);
    saveDatabase(db);
    res.json({ contract });
  });

  app.post('/api/contracts/:id/sign', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const contract = (db.contracts as Contract[]).find((c) => c.id === req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    const party = contract.parties.find((p) => p.id === user.id);
    const isOwner = contract.ownerId === user.id;
    if (!party && !isOwner) return res.status(403).json({ error: 'Only parties to this contract can sign.' });
    if (contract.signatures.some((s) => s.partyId === user.id)) {
      return res.status(400).json({ error: 'You already signed.' });
    }
    contract.signatures.push({ partyId: user.id, name: user.name || user.username || 'User', signedAt: Date.now() });
    const needed = contract.parties.length + (contract.ownerId ? 1 : 0);
    if (contract.signatures.length >= needed) contract.status = 'executed';
    saveDatabase(db);
    res.json({ contract });
  });
}
