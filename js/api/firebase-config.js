import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDl6A-dVZaJ3-vgZb50elNEL1s8XpHSt-0",
  authDomain: "travel-planner-58d65.firebaseapp.com",
  projectId: "travel-planner-58d65",
  storageBucket: "travel-planner-58d65.firebasestorage.app",
  messagingSenderId: "933362923523",
  appId: "1:933362923523:web:8c3eb6993ff57466ac7636"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// Увімкнення офлайн-режиму
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
        console.warn('The current browser does not support all of the features required to enable persistence');
    }
});

export { auth, provider, db };