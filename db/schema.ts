import {integer, real, primaryKey, index, uniqueIndex, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const userWatchlists = sqliteTable('user_watchlists', {
  ownerId: text('owner_id').primaryKey().notNull(),
  itemsJson: text('items_json').notNull(),
  groupsJson: text('groups_json').notNull().default('[]'),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const userMarketPcr = sqliteTable('user_market_pcr', {
  ownerId: text('owner_id').primaryKey().notNull(),
  itemsJson: text('items_json').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const optionMonitorCache = sqliteTable('option_monitor_cache', {
  cacheKey: text('cache_key').primaryKey().notNull(),
  symbol: text('symbol').notNull(),
  payloadJson: text('payload_json').notNull(),
  checkedAt: text('checked_at').notNull(),
});

export const optionMonitorOi = sqliteTable('option_monitor_oi', {
  symbol: text('symbol').notNull(),
  contract: text('contract').notNull(),
  expiration: text('expiration').notNull(),
  optionType: text('option_type').notNull(),
  strike: real('strike').notNull(),
  observedDate: text('observed_date').notNull(),
  openInterest: integer('open_interest').notNull(),
  checkedAt: text('checked_at').notNull(),
}, table=>[
  primaryKey({columns:[table.contract,table.observedDate]}),
  index('option_monitor_oi_lookup').on(table.symbol,table.expiration,table.observedDate),
]);

// Cloud activity records have independent coverage and observation times.
export const optionMonitorWebapiOi = sqliteTable('option_monitor_webapi_oi', {
  symbol: text('symbol').notNull(),
  contract: text('contract').notNull(),
  expiration: text('expiration').notNull(),
  optionType: text('option_type').notNull(),
  strike: real('strike').notNull(),
  observedDate: text('observed_date').notNull(),
  openInterest: integer('open_interest').notNull(),
  checkedAt: text('checked_at').notNull(),
}, table=>[
  primaryKey({columns:[table.contract,table.observedDate]}),
  index('option_monitor_webapi_oi_lookup').on(table.symbol,table.expiration,table.observedDate),
]);

export const oiSummaryCache = sqliteTable('oi_summary_cache', {
  symbol: text('symbol').primaryKey().notNull(),
  payloadJson: text('payload_json').notNull(),
  checkedAt: text('checked_at').notNull(),
});

export const oiSummarySnapshots = sqliteTable('oi_summary_snapshots', {
  symbol: text('symbol').notNull(),
  provider: text('provider').notNull(),
  checkedAt: text('checked_at').notNull(),
  observationDate: text('observation_date').notNull(),
  oiAsOf: text('oi_as_of'),
  oiAsOfConfirmed: integer('oi_as_of_confirmed').notNull().default(0),
  payloadJson: text('payload_json').notNull(),
  reason: text('reason').notNull(),
}, table=>[
  primaryKey({columns:[table.symbol,table.provider,table.checkedAt]}),
  index('oi_summary_snapshots_by_day').on(table.provider,table.observationDate,table.symbol,table.checkedAt),
]);

// Daily run metadata follows the same database backup/restore boundary as OI.
export const oiDailyState = sqliteTable('oi_daily_state', {
  id: text('id').primaryKey().notNull(),
  payloadJson: text('payload_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const oiDailyRuns = sqliteTable('oi_daily_runs', {
  runId: text('run_id').primaryKey().notNull(),
  observationDate: text('observation_date').notNull(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  payloadJson: text('payload_json').notNull(),
  completedAt: text('completed_at').notNull(),
}, table=>[
  index('oi_daily_runs_by_date').on(table.observationDate,table.completedAt),
]);

// Node cloud implementation of the Worker's bounded public-market Cache API.
export const workerCache = sqliteTable('worker_cache', {
  cacheKey: text('cache_key').primaryKey().notNull(),
  bodyGzipBase64: text('body_gzip_base64').notNull(),
  headersJson: text('headers_json').notNull(),
  bodyBytes: integer('body_bytes').notNull(),
  compressedBytes: integer('compressed_bytes').notNull(),
  storedAt: text('stored_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table=>[
  index('worker_cache_expiration').on(table.expiresAt,table.storedAt),
]);

// Append-only source observations. Run metadata is checkpointed separately;
// successful observation payloads are compressed without changing source times.
export const structureSnapshots = sqliteTable('structure_snapshots', {
  id: text('id').primaryKey().notNull(),
  runId: text('run_id').notNull(),
  observationDate: text('observation_date').notNull(),
  kind: text('kind').notNull(),
  symbol: text('symbol').notNull(),
  scopeKind: text('scope_kind').notNull(),
  scopeKey: text('scope_key').notNull(),
  expiriesJson: text('expiries_json').notNull(),
  queriedAt: text('queried_at').notNull(),
  providerUpdatedAt: text('provider_updated_at'),
  oiSettlementDate: text('oi_settlement_date'),
  status: text('status').notNull(),
  units: text('units').notNull(),
  payloadGzipBase64: text('payload_gzip_base64').notNull(),
  payloadBytes: integer('payload_bytes').notNull(),
  compressedBytes: integer('compressed_bytes').notNull(),
}, table=>[
  index('structure_snapshots_by_day').on(table.symbol,table.observationDate,table.queriedAt),
  uniqueIndex('structure_snapshots_scope_unique').on(table.runId,table.kind,table.symbol,table.scopeKind,table.scopeKey),
]);

export const structureDailyRuns = sqliteTable('structure_daily_runs', {
  runId: text('run_id').primaryKey().notNull(),
  observationDate: text('observation_date').notNull(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  payloadJson: text('payload_json').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
}, table=>[index('structure_daily_runs_by_day').on(table.observationDate,table.startedAt)]);

export const structureDailyState = sqliteTable('structure_daily_state', {
  id: text('id').primaryKey().notNull(),
  payloadJson: text('payload_json').notNull(),
  updatedAt: text('updated_at').notNull(),
  leaseUntil: integer('lease_until').notNull().default(0),
});
