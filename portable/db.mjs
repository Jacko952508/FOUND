import pg from "pg";
const { Pool } = pg;
if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 10000
});
export async function query(text, params=[]){ return db.query(text, params); }
export async function close(){ await db.end(); }