import { auth, provider } from '../api/firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export function login() {
    return signInWithPopup(auth, provider);
}

export function logout() {
    return signOut(auth);
}

export function observeAuth(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}