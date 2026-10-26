import React from 'react';
import ReactDOM from 'react-dom/client';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import App from './App';
import './styles.css';

const configured = Boolean(import.meta.env.VITE_MS_CLIENT_ID);
const msal = configured ? new PublicClientApplication({ auth: { clientId: import.meta.env.VITE_MS_CLIENT_ID, authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MS_TENANT_ID || 'common'}`, redirectUri: window.location.origin }, cache: { cacheLocation: 'sessionStorage' } }) : null;
async function start() { if (msal) await msal.initialize(); ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{msal ? <MsalProvider instance={msal}><App /></MsalProvider> : <App />}</React.StrictMode>); }
void start();
