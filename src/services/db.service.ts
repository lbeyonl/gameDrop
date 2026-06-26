import pg from "pg";
import { logger } from "../utils/logger.js";
import type { DbGame, DbFreeGame, DbGamePrice, SaveGameInput, SavePriceInput } from "../types/game.js";

const { Pool } = pg;

export class DbService {
  private pool: pg.Pool | null = null;

  async initialize(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    
    // Connection pool configuration
    const poolConfig: pg.PoolConfig = connectionString
      ? { connectionString }
      : {
          host: process.env.PGHOST || "localhost",
          port: parseInt(process.env.PGPORT || "5432", 10),
          user: process.env.PGUSER || "postgres",
          password: process.env.PGPASSWORD || "password",
          database: process.env.PGDATABASE || "gamedrop",
        };

    try {
      this.pool = new Pool(poolConfig);
      
      // Test database connection
      const client = await this.pool.connect();
      client.release();
      logger.info("Connected to PostgreSQL database successfully");

      // Verify or create schemas
      await this.createTables();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Failed to connect to PostgreSQL database: " + msg);
      this.pool = null;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. games table (with extra metadata fields for Steam/CheapShark identifiers and thumbnails)
      await client.query(`
        CREATE TABLE IF NOT EXISTS games (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) UNIQUE NOT NULL,
          localized_title VARCHAR(255),
          slug VARCHAR(255) UNIQUE NOT NULL,
          developer VARCHAR(255),
          publisher VARCHAR(255),
          release_date VARCHAR(100),
          steam_app_id VARCHAR(50),
          cheapshark_game_id VARCHAR(50),
          thumbnail VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. game_prices table (with url for direct redirects)
      await client.query(`
        CREATE TABLE IF NOT EXISTS game_prices (
          id SERIAL PRIMARY KEY,
          game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
          store VARCHAR(100) NOT NULL,
          normal_price NUMERIC(10, 2) NOT NULL,
          sale_price NUMERIC(10, 2) NOT NULL,
          discount_percent INTEGER NOT NULL,
          url TEXT,
          last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(game_id, store)
        )
      `);

      // 3. free_games table (with url for redirect)
      await client.query(`
        CREATE TABLE IF NOT EXISTS free_games (
          id SERIAL PRIMARY KEY,
          game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
          platform VARCHAR(100) NOT NULL,
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          url TEXT,
          UNIQUE(game_id, platform)
        )
      `);

      // 4. price_history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS price_history (
          id SERIAL PRIMARY KEY,
          game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
          store VARCHAR(100) NOT NULL,
          price NUMERIC(10, 2) NOT NULL,
          discount_percent INTEGER NOT NULL,
          recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for optimized lookups
      await client.query(`CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_games_title ON games(title)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_game_prices_game_id ON game_prices(game_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_free_games_game_id ON free_games(game_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_price_history_game_id ON price_history(game_id)`);

      await client.query("COMMIT");
      logger.info("PostgreSQL database tables and indexes verified successfully");
    } catch (e: unknown) {
      await client.query("ROLLBACK");
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Failed to initialize PostgreSQL database tables: " + msg);
      throw e;
    } finally {
      client.release();
    }
  }

  async query(text: string, params?: (string | number | Date | null)[]): Promise<pg.QueryResult> {
    if (!this.pool) {
      throw new Error("PostgreSQL pool not initialized. Please verify your connection configuration.");
    }
    return this.pool.query(text, params);
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  async findGameBySlugOrTitle(slug: string, title?: string): Promise<DbGame | null> {
    if (!this.pool) return null;
    const queryStr = `
      SELECT * FROM games 
      WHERE slug = $1 ${title ? "OR LOWER(title) = LOWER($2) OR LOWER(localized_title) = LOWER($2)" : ""}
      LIMIT 1
    `;
    const params = title ? [slug, title] : [slug];
    const res = await this.query(queryStr, params);
    return (res.rows[0] as DbGame) || null;
  }

  async saveGame(gameData: SaveGameInput): Promise<DbGame> {
    if (!this.pool) throw new Error("DB not connected");
    const { title, localized_title, slug, developer, publisher, release_date, steam_app_id, cheapshark_game_id, thumbnail } = gameData;
    
    const queryStr = `
      INSERT INTO games (title, localized_title, slug, developer, publisher, release_date, steam_app_id, cheapshark_game_id, thumbnail, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (slug) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        localized_title = COALESCE(EXCLUDED.localized_title, games.localized_title),
        developer = COALESCE(EXCLUDED.developer, games.developer),
        publisher = COALESCE(EXCLUDED.publisher, games.publisher),
        release_date = COALESCE(EXCLUDED.release_date, games.release_date),
        steam_app_id = COALESCE(EXCLUDED.steam_app_id, games.steam_app_id),
        cheapshark_game_id = COALESCE(EXCLUDED.cheapshark_game_id, games.cheapshark_game_id),
        thumbnail = COALESCE(EXCLUDED.thumbnail, games.thumbnail),
        updated_at = NOW()
      RETURNING *
    `;
    const res = await this.query(queryStr, [
      title, localized_title || null, slug,
      developer || null, publisher || null, release_date || null,
      steam_app_id || null, cheapshark_game_id || null, thumbnail || null
    ]);
    return res.rows[0] as DbGame;
  }

  async saveGamePrices(gameId: number, prices: SavePriceInput[]): Promise<void> {
    if (!this.pool) return;
    
    for (const p of prices) {
      const queryStr = `
        INSERT INTO game_prices (game_id, store, normal_price, sale_price, discount_percent, url, last_checked_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (game_id, store)
        DO UPDATE SET
          normal_price = EXCLUDED.normal_price,
          sale_price = EXCLUDED.sale_price,
          discount_percent = EXCLUDED.discount_percent,
          url = COALESCE(EXCLUDED.url, game_prices.url),
          last_checked_at = NOW()
      `;
      await this.query(queryStr, [gameId, p.store, p.normalPrice, p.salePrice, p.discountPercent, p.url || null]);

      // Add to price history
      await this.addPriceHistory(gameId, p.store, p.salePrice, p.discountPercent);
    }
  }

  async getGamePrices(gameId: number): Promise<DbGamePrice[]> {
    if (!this.pool) return [];
    const queryStr = `
      SELECT gp.*, g.title, g.localized_title 
      FROM game_prices gp
      JOIN games g ON gp.game_id = g.id
      WHERE gp.game_id = $1
    `;
    const res = await this.query(queryStr, [gameId]);
    return res.rows as DbGamePrice[];
  }

  async addPriceHistory(gameId: number, store: string, price: number, discountPercent: number): Promise<void> {
    if (!this.pool) return;
    
    const checkQuery = `
      SELECT price, discount_percent FROM price_history
      WHERE game_id = $1 AND store = $2
      ORDER BY recorded_at DESC LIMIT 1
    `;
    const checkRes = await this.query(checkQuery, [gameId, store]);
    const latest = checkRes.rows[0] as { price: string; discount_percent: number } | undefined;
    
    if (latest && parseFloat(latest.price) === price && latest.discount_percent === discountPercent) {
      return;
    }

    const queryStr = `
      INSERT INTO price_history (game_id, store, price, discount_percent, recorded_at)
      VALUES ($1, $2, $3, $4, NOW())
    `;
    await this.query(queryStr, [gameId, store, price, discountPercent]);
  }

  async saveFreeGame(gameId: number, platform: string, startDate?: string, endDate?: string, url?: string): Promise<void> {
    if (!this.pool) return;
    const queryStr = `
      INSERT INTO free_games (game_id, platform, start_date, end_date, url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (game_id, platform)
      DO UPDATE SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        url = COALESCE(EXCLUDED.url, free_games.url)
    `;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    await this.query(queryStr, [gameId, platform, start, end, url || null]);
  }

  async getFreeGames(): Promise<DbFreeGame[]> {
    if (!this.pool) return [];
    const queryStr = `
      SELECT fg.*, g.title, g.localized_title, g.slug, g.developer, g.publisher
      FROM free_games fg
      JOIN games g ON fg.game_id = g.id
      ORDER BY fg.end_date ASC
    `;
    const res = await this.query(queryStr);
    return res.rows as DbFreeGame[];
  }

  async getAllGames(): Promise<DbGame[]> {
    if (!this.pool) return [];
    const res = await this.query(`SELECT * FROM games`);
    return res.rows as DbGame[];
  }
}

export const dbService = new DbService();
