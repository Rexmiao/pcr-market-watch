import {integer, real, primaryKey, index, sqliteTable, text} from 'drizzle-orm/sqlite-core';

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
