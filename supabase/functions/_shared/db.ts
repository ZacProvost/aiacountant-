import { Pool, PoolClient } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
import { getEnvVar } from './env.ts';
import { createLogger } from './logger.ts';

let DATABASE_URL: string;
try {
  DATABASE_URL = getEnvVar('SUPABASE_DB_URL');
  
  // Supabase connection string handling
  // The connection string should use the connection pooler (port 6543) for better compatibility
  // If it's using direct connection (port 5432), we should prefer the pooler
  // Also ensure SSL is properly configured
  
  // Parse the URL to check and fix if needed
  try {
    const url = new URL(DATABASE_URL);
    
    // If using direct connection (port 5432), suggest using pooler (6543) instead
    // But don't change it automatically as the user might have specific reasons
    if (url.port === '5432' && !url.hostname.includes('pooler')) {
      console.warn('[db] Using direct connection (port 5432). Consider using connection pooler (port 6543) for better compatibility.');
    }
    
    // Ensure SSL parameters are set
    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
      DATABASE_URL = url.toString();
      console.log('[db] Added sslmode=require to connection string');
    }
  } catch (urlError) {
    // If URL parsing fails, try simple string manipulation
    if (DATABASE_URL && !DATABASE_URL.includes('sslmode=')) {
      const separator = DATABASE_URL.includes('?') ? '&' : '?';
      DATABASE_URL = `${DATABASE_URL}${separator}sslmode=require`;
      console.log('[db] Added sslmode=require to connection string (fallback method)');
    }
  }
} catch (error) {
  console.error('[db] Missing SUPABASE_DB_URL environment variable:', error);
  throw new Error('SUPABASE_DB_URL is required for database operations. Please set it in your Supabase project secrets.');
}

const POOL_CONNECTIONS = Number.parseInt(Deno.env.get('AI_DB_POOL_SIZE') ?? '4', 10);

let pool: Pool;
try {
  // The third parameter (lazy) set to true means connections are created on demand
  // This helps avoid connection issues during function cold starts
  const poolSize = Number.isFinite(POOL_CONNECTIONS) && POOL_CONNECTIONS > 0 ? POOL_CONNECTIONS : 4;
  pool = new Pool(DATABASE_URL, poolSize, true);
  console.log(`[db] Database pool initialized with ${poolSize} connections`);
} catch (error) {
  console.error('[db] Failed to create database pool:', error);
  throw new Error(`Failed to initialize database connection pool: ${error instanceof Error ? error.message : String(error)}`);
}

export type TransactionClient = PoolClient;

export const acquireClient = () => pool.connect();

export const withTransaction = async <T>(
  executor: (client: TransactionClient) => Promise<T>,
  metadata: { correlationId?: string } = {},
): Promise<T> => {
  const logger = createLogger({ correlationId: metadata.correlationId ?? crypto.randomUUID(), scope: 'db.transaction' });
  let connection: PoolClient | null = null;
  
  try {
    connection = await pool.connect();
    // Test the connection with a simple query to ensure it's working
    await connection.queryArray`SELECT 1`;
  } catch (connectionError) {
    logger.error('Failed to acquire database connection', { 
      error: connectionError instanceof Error ? connectionError.message : String(connectionError),
      errorName: connectionError instanceof Error ? connectionError.name : 'Unknown',
      stack: connectionError instanceof Error ? connectionError.stack : undefined
    });
    
    // Provide more helpful error messages for common issues
    const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
    if (errorMessage.includes('Unknown response')) {
      throw new Error(`PostgreSQL protocol error. This usually means:
1. The connection string format is incorrect
2. SSL/TLS configuration mismatch
3. Using direct connection instead of connection pooler
Please verify SUPABASE_DB_URL uses the connection pooler (port 6543) and includes sslmode=require`);
    }
    throw new Error(`Database connection failed: ${errorMessage}`);
  }
  
  try {
    await connection.queryArray`BEGIN`;
    const result = await executor(connection);
    await connection.queryArray`COMMIT`;
    return result;
  } catch (error) {
    try {
      await connection.queryArray`ROLLBACK`;
    } catch (rollbackError) {
      logger.error('Failed to rollback transaction', { error: String(rollbackError) });
    }
    // Re-throw with more context if it's a PostgreSQL protocol error
    if (error instanceof Error && error.message.includes('Unknown response')) {
      logger.error('PostgreSQL protocol error detected', { 
        originalError: error.message,
        databaseUrl: DATABASE_URL ? `${DATABASE_URL.substring(0, 20)}...` : 'not set'
      });
      throw new Error(`Database connection error: ${error.message}. Please verify SUPABASE_DB_URL is correctly configured.`);
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

