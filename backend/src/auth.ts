import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from './store.js';

export type Role = 'admin'|'staff'|'viewer';
declare global { namespace Express { interface Request { user?: { id:string; role:Role; email:string; name:string } } } }
const tenant=process.env.MS_TENANT_ID || '';
const audience=process.env.MS_API_AUDIENCE || '';
const jwks=tenant?createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`)):null;
const authMode=process.env.AUTH_MODE || (tenant?'microsoft':'local');
const googleClientId=process.env.GOOGLE_CLIENT_ID || '';
const googleClient=new OAuth2Client(googleClientId || undefined);
const smtpHost=process.env.SMTP_HOST||'';
const mailer=smtpHost?nodemailer.createTransport({host:smtpHost,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined}):null;
const devSecret=new TextEncoder().encode(process.env.DEV_AUTH_SECRET || 'local-only-routeflow-development-signing-key-change-before-deploy');
const localUsers=[
 {email:'admin@routeflow.local',name:'Local Admin',role:'admin' as const,password:process.env.DEV_ADMIN_PASSWORD||'admin1234'},
 {email:'staff@routeflow.local',name:'Local Staff',role:'staff' as const,password:process.env.DEV_STAFF_PASSWORD||'staff1234'},
 {email:'viewer@routeflow.local',name:'Local Viewer',role:'viewer' as const,password:process.env.DEV_VIEWER_PASSWORD||'viewer1234'},
];

export const authRouter=Router();
authRouter.get('/auth/providers',(_req,res)=>res.json({google:Boolean(googleClientId),email:!!mailer,localDevelopment:authMode==='local'}));
authRouter.post('/auth/register',async(req,res)=>{
 if(authMode!=='local'){res.status(404).json({error:'Email registration is available in local authentication mode.'});return;}
 const input=z.object({name:z.string().trim().min(2).max(100),email:z.string().email().max(254),password:z.string().min(8).max(128),role:z.enum(['admin','staff','viewer'])}).safeParse(req.body);
 if(!input.success){res.status(400).json({error:'Enter your name, a valid email, and a password with at least 8 characters.'});return;}
 const email=input.data.email.toLowerCase();
 if(localUsers.some(account=>account.email===email)){res.status(409).json({error:'That email belongs to a workspace development account. Sign in with its configured password.'});return;}
 try{
  const existing=await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)',[email]);
  if(existing.rowCount){res.status(409).json({error:'An account already exists for this email. Sign in or reset its password.'});return;}
  const passwordHash=await bcrypt.hash(input.data.password,12);
  const requestedRole=input.data.role==='viewer'?null:input.data.role;
  const inserted=await pool.query(`INSERT INTO users (entra_oid,email,display_name,role,password_hash,requested_role) VALUES ($1,$2,$3,'viewer',$4,$5) RETURNING id,role,email,display_name`,[`password:${randomUUID()}`,email,input.data.name,passwordHash,requestedRole]);
  const user=inserted.rows[0];
  const token=await new SignJWT({email:user.email}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime('12h').sign(devSecret);
  res.status(201).json({token,user:{id:user.id,email:user.email,name:user.display_name,role:user.role},message:requestedRole?`Account created with Viewer access. Your ${requestedRole} access request is pending admin review.`:'Account created with Viewer access.'});
 }catch(error){console.error(error);res.status(503).json({error:'Could not create your account. Please try again.'});}
});
authRouter.post('/auth/login',async(req,res)=>{
 if(authMode!=='local'){res.status(404).json({error:'Local development sign-in is disabled.'});return;}
 const input=z.object({email:z.string().email(),password:z.string().min(1),role:z.enum(['admin','staff','viewer'])}).safeParse(req.body);
 if(!input.success){res.status(400).json({error:'Enter a valid email and password.'});return;}
 try{
  const account=localUsers.find(user=>user.email===input.data.email.toLowerCase());
  let user;
  if(account){
   if(account.role!==input.data.role){res.status(403).json({error:`This account has ${account.role} access. Choose the ${account.role} section to sign in.`});return;}
   const result=await pool.query(`INSERT INTO users (entra_oid,email,display_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT (entra_oid) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name RETURNING id,role,email,display_name,password_hash`,[`dev:${account.email}`,account.email,account.name,account.role]);user=result.rows[0];
   const passwordValid=user.password_hash?await bcrypt.compare(input.data.password,user.password_hash):account.password===input.data.password;
   if(!passwordValid){res.status(401).json({error:'Email or password is incorrect.'});return;}
  }else{
   const result=await pool.query(`SELECT id,role,email,display_name,password_hash FROM users WHERE lower(email)=lower($1) AND password_hash IS NOT NULL ORDER BY created_at LIMIT 1`,[input.data.email]);
   if(!result.rowCount||!(await bcrypt.compare(input.data.password,result.rows[0].password_hash))){res.status(401).json({error:'Email or password is incorrect.'});return;}
   user=result.rows[0];if(user.role!==input.data.role){res.status(403).json({error:`This account has ${user.role} access. Choose the ${user.role} section to sign in.`});return;}
  }
  const token=await new SignJWT({email:user.email}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime('12h').sign(devSecret);
  res.json({token,user:{id:user.id,email:user.email,name:user.display_name,role:user.role}});
 }catch(error){console.error(error);res.status(503).json({error:'Database is unavailable. Start the local database and try again.'});}
});
authRouter.post('/auth/forgot-password',async(req,res)=>{
 if(authMode!=='local'){res.status(404).json({error:'Password reset is not available in this authentication mode.'});return;}
 const input=z.object({email:z.string().email()}).safeParse(req.body);
 if(!input.success){res.status(400).json({error:'Enter a valid email address.'});return;}
 try{
  const devAccount=localUsers.find(account=>account.email===input.data.email.toLowerCase());
  if(devAccount)await pool.query(`INSERT INTO users (entra_oid,email,display_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT (entra_oid) DO NOTHING`,[`dev:${devAccount.email}`,devAccount.email,devAccount.name,devAccount.role]);
  const result=await pool.query(`SELECT id,email FROM users WHERE lower(email)=lower($1) AND (password_hash IS NOT NULL OR entra_oid LIKE 'dev:%') LIMIT 1`,[input.data.email]);
  if(!result.rowCount){res.json({message:'If an email account exists, reset instructions have been sent.'});return;}
  const rawToken=randomBytes(32).toString('base64url');const tokenHash=createHash('sha256').update(rawToken).digest('hex');
  await pool.query(`INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')`,[tokenHash,result.rows[0].id]);
  const resetUrl=`${process.env.FRONTEND_ORIGIN||'http://localhost:5173'}?reset=${encodeURIComponent(rawToken)}`;
  if(mailer){await mailer.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:result.rows[0].email,subject:'Reset your Routeflow password',text:`Use this link within 30 minutes to reset your Routeflow password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`});res.json({message:'If an email account exists, reset instructions have been sent.'});}
  else if(authMode==='local'){res.json({message:'Local development reset link created. It expires in 30 minutes.',resetToken:rawToken});}
  else{res.json({message:'If an email account exists, reset instructions have been sent.'});}
 }catch(error){console.error(error);res.status(503).json({error:'Could not create reset instructions. Please try again.'});}
});
authRouter.post('/auth/reset-password',async(req,res)=>{
 if(authMode!=='local'){res.status(404).json({error:'Password reset is not available in this authentication mode.'});return;}
 const input=z.object({token:z.string().min(20),password:z.string().min(8).max(128)}).safeParse(req.body);
 if(!input.success){res.status(400).json({error:'Choose a password with at least 8 characters.'});return;}
 const tokenHash=createHash('sha256').update(input.data.token).digest('hex');const client=await pool.connect();
 try{await client.query('BEGIN');const found=await client.query(`SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[tokenHash]);if(!found.rowCount){await client.query('ROLLBACK');res.status(400).json({error:'This reset link is invalid or expired. Request a new one.'});return;}const passwordHash=await bcrypt.hash(input.data.password,12);await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[passwordHash,found.rows[0].user_id]);await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[found.rows[0].user_id]);await client.query('COMMIT');res.json({message:'Password updated. Sign in with your new password.'});}
 catch(error){await client.query('ROLLBACK');console.error(error);res.status(503).json({error:'Could not reset your password. Please try again.'});}finally{client.release();}
});
authRouter.post('/auth/google',async(req,res)=>{
 if(authMode!=='local'){res.status(404).json({error:'Google sign-in is not enabled in this authentication mode.'});return;}
 if(!googleClientId){res.status(503).json({error:'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID.'});return;}
 const input=z.object({credential:z.string().min(1),role:z.enum(['admin','staff','viewer'])}).safeParse(req.body);
 if(!input.success){res.status(400).json({error:'A valid Google sign-in is required.'});return;}
 try{
  const ticket=await googleClient.verifyIdToken({idToken:input.data.credential,audience:googleClientId});
  const claims=ticket.getPayload();
  if(!claims?.sub||!claims.email||claims.email_verified!==true){res.status(403).json({error:'Google must provide a verified email address.'});return;}
  const googleSubject=`google:${claims.sub}`;
  let result=await pool.query(`SELECT id,role,email,display_name FROM users WHERE entra_oid=$1`,[googleSubject]);
  if(!result.rowCount){
   const sameEmail=await pool.query(`SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1`,[claims.email]);
   if(sameEmail.rowCount)result=await pool.query(`UPDATE users SET entra_oid=$1,display_name=$2 WHERE id=$3 RETURNING id,role,email,display_name`,[googleSubject,claims.name||claims.email,sameEmail.rows[0].id]);
   else{
    if(input.data.role!=='viewer'){res.status(403).json({error:'New Google registrations start with Viewer access. Choose Viewer to register, then ask an admin to grant another role.'});return;}
    result=await pool.query(`INSERT INTO users (entra_oid,email,display_name,role) VALUES ($1,$2,$3,'viewer') ON CONFLICT (entra_oid) DO UPDATE SET email=EXCLUDED.email RETURNING id,role,email,display_name`,[googleSubject,claims.email.toLowerCase(),claims.name||claims.email]);
   }
  }
  const user=result.rows[0];
  if(user.role!==input.data.role){res.status(403).json({error:`This Google account has ${user.role} access. Choose the ${user.role} section to sign in.`});return;}
  const token=await new SignJWT({email:user.email}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime('12h').sign(devSecret);
  res.json({token,user:{id:user.id,email:user.email,name:user.display_name,role:user.role}});
 }catch(error){console.error('Google sign-in failed:',error);res.status(401).json({error:'Google sign-in could not be verified. Please try again.'});}
});
authRouter.get('/auth/me',authenticate,async(req,res)=>res.json(req.user));

export async function authenticate(req:Request,res:Response,next:NextFunction) {
 const token=req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
 if(!token){res.status(401).json({error:'Sign in to continue.'});return;}
 try{
  if(authMode==='local'){
   const {payload}=await jwtVerify(token,devSecret,{algorithms:['HS256']});
   const result=await pool.query(`SELECT id,role,email,display_name FROM users WHERE id=$1`,[payload.sub]);
   if(!result.rowCount){res.status(401).json({error:'This local account no longer exists.'});return;}
   req.user={id:result.rows[0].id,role:result.rows[0].role,email:result.rows[0].email,name:result.rows[0].display_name};next();return;
  }
  if(!jwks||!audience){res.status(401).json({error:'Microsoft API authentication is not configured.'});return;}
  const {payload}=await jwtVerify(token,jwks,{issuer:`https://login.microsoftonline.com/${tenant}/v2.0`,audience});
  const oid=String(payload.oid||payload.sub||'');const email=String(payload.preferred_username||payload.email||'').toLowerCase();
  if(!oid||!email){res.status(403).json({error:'The token does not include an employee identity.'});return;}
  const result=await pool.query(`INSERT INTO users (entra_oid,email,display_name,role) VALUES ($1,$2,$3,'viewer') ON CONFLICT (entra_oid) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name RETURNING id,role,email,display_name`,[oid,email,String(payload.name||email)]);
  req.user={id:result.rows[0].id,role:result.rows[0].role,email:result.rows[0].email,name:result.rows[0].display_name};next();
 }catch{res.status(401).json({error:'Session is invalid or expired. Please sign in again.'});}
}
export function permit(...roles:Role[]) { return (req:Request,res:Response,next:NextFunction)=>{if(!req.user||!roles.includes(req.user.role)){res.status(403).json({error:'Your account does not have permission to do that.'});return;}next();}; }
