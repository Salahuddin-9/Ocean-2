/**
 * P2PCallLayer — superseded by the self-contained calling engine.
 *
 * This file is kept as a backward-compatible re-export shim so any lingering
 * import of `P2PCallLayer` / `useP2PCallContext` still compiles. The real
 * keyless call provider now lives at src/calling/useCallEngine.tsx
 * (CallEngineProvider + useCallEngineContext), mounted once at the App root.
 */

export { CallEngineProvider as default, useCallEngineContext as useP2PCallContext } from '../../calling/useCallEngine';
