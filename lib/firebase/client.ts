"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedAuth: Auth | null = null;

// Lazily initialized so importing this module never throws during server-side
// rendering/build (e.g. before NEXT_PUBLIC_FIREBASE_* env vars are configured).
// Only called client-side, in response to a user action (the sign-in button).
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export function getGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Don't lock the chooser to a single hosted domain — approved guests (and any
  // other allowed domain) must be able to pick their own account. Enforcement of
  // who's actually allowed happens server-side in the session route + middleware
  // (isAllowedEmail). `select_account` always shows the chooser.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
