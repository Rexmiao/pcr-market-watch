import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';

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
