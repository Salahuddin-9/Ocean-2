/**
 * ATLAS-RANK — production feed-ranking library (pure math, ported from
 * `architecture (1)/src/lib/reco/`). No database dependencies: the Drizzle/DB
 * integration layer (pipeline.ts, store.ts, seed.ts, ingest.ts) is kept in
 * `src/reference/atlas/` for the record.
 *
 * Use:
 *   import { masterFeedScore, diversityRerank, runAuction } from './lib/reco';
 */
export * from './mathkit';
export * from './ranker';
export * from './features';
export * from './context';
export * from './integrity';
export * from './ads';
export * from './user-model';
export * from './creator-model';
export * from './content-model';
export * from './taxonomy';
export * from './dynamics';
export * from './signals';
export * from './coldstart';
export * from './models';
export * from './advanced/ann-scann';
export * from './advanced/online-ftrl';
export * from './advanced/reinforcement-learning';
export * from './advanced/deep-rankers';
export * from './advanced/feature-store';
