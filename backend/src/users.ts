import { Router } from 'express';
import { z } from 'zod';
import { authenticate, permit } from './auth.js';
import { pool } from './store.js';

export const usersRouter=Router();
usersRouter.use(authenticate,permit('admin'));
usersRouter.get('/users',async(_req,res,next)=>{
 try{const result=await pool.query(`SELECT id,email,display_name,role,requested_role,created_at FROM users ORDER BY created_at DESC,email`);res.json({items:result.rows});}
 catch(error){next(error);}
});
usersRouter.patch('/users/:id/role',async(req,res,next)=>{
 const parsed=z.object({role:z.enum(['admin','staff','viewer'])}).safeParse(req.body);
 if(!parsed.success){res.status(400).json({error:'Choose Admin, Staff, or Viewer.'});return;}
 try{
  const target=await pool.query('SELECT id,role FROM users WHERE id=$1',[req.params.id]);
  if(!target.rowCount){res.status(404).json({error:'User not found.'});return;}
  if(target.rows[0].id===req.user!.id&&parsed.data.role!=='admin'){res.status(409).json({error:'You cannot remove your own admin access.'});return;}
  const updated=await pool.query('UPDATE users SET role=$1,requested_role=NULL WHERE id=$2 RETURNING id,email,display_name,role,requested_role,created_at',[parsed.data.role,req.params.id]);
  res.json(updated.rows[0]);
 }catch(error){next(error);}
});
usersRouter.delete('/users/:id',async(req,res,next)=>{
 const targetId=req.params.id;
 if(targetId===req.user!.id){res.status(409).json({error:'You cannot delete the account you are currently using.'});return;}
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const target=await client.query('SELECT id,role FROM users WHERE id=$1 FOR UPDATE',[targetId]);
  if(!target.rowCount){await client.query('ROLLBACK');res.status(404).json({error:'User not found.'});return;}
  if(target.rows[0].role==='admin'){
   const count=await client.query(`SELECT COUNT(*)::int AS total FROM users WHERE role='admin'`);
   if(count.rows[0].total<=1){await client.query('ROLLBACK');res.status(409).json({error:'You cannot delete the last administrator.'});return;}
  }
  await client.query('DELETE FROM users WHERE id=$1',[targetId]);
  await client.query('COMMIT');res.status(204).end();
 }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
});
