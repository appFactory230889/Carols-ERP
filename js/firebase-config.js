// Configuración del proyecto Firebase "distribuidora-carols" (mismo backend que la app Android).
// Sin Firebase Auth: esta web accede directo a Realtime Database y Storage.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCgIOm9B_2BkSoRwJCQaJgrt8mUTj-OnSM",
  authDomain: "distribuidora-carols.firebaseapp.com",
  databaseURL: "https://distribuidora-carols-default-rtdb.firebaseio.com",
  projectId: "distribuidora-carols",
  storageBucket: "distribuidora-carols.firebasestorage.app",
  messagingSenderId: "896145385150",
  appId: "1:896145385150:web:b192f99990609bcd7b20ef",
  measurementId: "G-JX2066C0JM"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);
