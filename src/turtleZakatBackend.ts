/**
 * Ocean — Digital Zakat Calculator (Feature 224)
 * -------------------------------------------------
 * Calculates Zakat (2.5% of qualifying wealth above the nisab threshold) from
 * cash, gold, silver, business assets and savings. Nisab is configurable;
 * default uses the silver (612.36g) standard ≈ 97,978 BDT (2025 estimate).
 *
 * Routes:
 *   POST /api/zakat/calculate  (public) { cash, goldValue, silverValue, businessAssets, savings } -> zakat
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export const DEFAULT_NISAB_BDT = 97_978;

export interface ZakatInput {
  cash: number;
  goldValue: number;
  silverValue: number;
  businessAssets: number;
  savings: number;
  nisab?: number;
}

export interface ZakatResult {
  totalWealth: number;
  nisab: number;
  eligible: boolean;
  zakatDue: number;
  breakdown: { label: string; value: number }[];
}

export function calculateZakat(input: ZakatInput): ZakatResult {
  const cash = Math.max(0, Number(input.cash) || 0);
  const goldValue = Math.max(0, Number(input.goldValue) || 0);
  const silverValue = Math.max(0, Number(input.silverValue) || 0);
  const businessAssets = Math.max(0, Number(input.businessAssets) || 0);
  const savings = Math.max(0, Number(input.savings) || 0);
  const nisab = Math.max(1, Number(input.nisab) || DEFAULT_NISAB_BDT);
  const totalWealth = cash + goldValue + silverValue + businessAssets + savings;
  const eligible = totalWealth >= nisab;
  return {
    totalWealth: Math.round(totalWealth),
    nisab,
    eligible,
    zakatDue: eligible ? Math.round((totalWealth * 2.5) / 100) : 0,
    breakdown: [
      { label: 'Cash at hand & bank', value: cash },
      { label: 'Gold & jewellery', value: goldValue },
      { label: 'Silver', value: silverValue },
      { label: 'Business assets / trade goods', value: businessAssets },
      { label: 'Savings & investments', value: savings },
    ],
  };
}

export function registerZakatRoutes(app: express.Express): void {
  const { getRequestUser } = getCtx();

  app.post('/api/zakat/calculate', (req, res) => {
    const body = (req.body || {}) as any;
    const result = calculateZakat({
      cash: Number(body.cash) || 0,
      goldValue: Number(body.goldValue) || 0,
      silverValue: Number(body.silverValue) || 0,
      businessAssets: Number(body.businessAssets) || 0,
      savings: Number(body.savings) || 0,
      nisab: Number.isFinite(Number(body.nisab)) ? Number(body.nisab) : undefined,
    });
    res.json({ ...result, nisabNote: 'Default nisab = silver standard (612.36g). Adjust to your calculation school.' });
  });
}
