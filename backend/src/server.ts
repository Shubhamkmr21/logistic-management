import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './store.js';
import { router } from './shipments.js';
import { authRouter } from './auth.js';
import { usersRouter } from './users.js';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', async (_req,res) => { try { await pool.query('SELECT 1'); res.json({status:'ok'}); } catch { res.status(503).json({status:'database unavailable'}); } });
app.use('/api', authRouter);
app.use('/api', router);
app.use('/api', usersRouter);
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction) => { console.error(error); res.status(500).json({error:'Internal server error'}); });
const port=Number(process.env.PORT||4000);
async function start(){
 await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text; ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role app_role; CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL,used_at timestamptz); CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id,expires_at);`);
 await pool.query(`ALTER TABLE shipments ALTER COLUMN created_by DROP NOT NULL; ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_created_by_fkey; ALTER TABLE shipments ADD CONSTRAINT shipments_created_by_fkey FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL; ALTER TABLE tracking_events ADD COLUMN IF NOT EXISTS actor_name text; UPDATE tracking_events e SET actor_name=u.display_name FROM users u WHERE e.updated_by=u.id AND e.actor_name IS NULL; ALTER TABLE tracking_events DROP CONSTRAINT IF EXISTS tracking_events_updated_by_fkey; ALTER TABLE tracking_events ADD CONSTRAINT tracking_events_updated_by_fkey FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL;`);
 await pool.query('CREATE TABLE IF NOT EXISTS routeflow_schema_migrations (id text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
 const weightMigration=await pool.query("SELECT 1 FROM routeflow_schema_migrations WHERE id='item-weights-pounds-to-kg-v1'");
 if(!weightMigration.rowCount){const client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE shipment_items SET unit_weight=round(unit_weight*0.45359237,3)');await client.query("INSERT INTO routeflow_schema_migrations(id) VALUES('item-weights-pounds-to-kg-v1') ON CONFLICT DO NOTHING");await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 app.listen(port,()=>console.log(`Routeflow API listening on ${port}`));
}
void start().catch(error=>{console.error('Could not initialize Routeflow database:',error);process.exit(1);});
