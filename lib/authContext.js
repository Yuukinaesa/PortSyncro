// lib/authContext.js
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/router';

// Buat context
const AuthContext = createContext();

// Provider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Effect untuk memantau status autentikasi
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Timeout untuk mencegah loading yang terlalu lama
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.log("Auth loading timed out");
        setLoading(false);
      }
    }, 3000); // 3 detik timeout

    // Bersihkan listener saat komponen unmount
    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [loading]);

  // Fungsi untuk logout
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }, [router]);

  // Fungsi untuk mengambil data portfolio user
  const getUserPortfolio = useCallback(async () => {
    if (!user) return { stocks: [], crypto: [] };

    try {
      // Referensi ke dokumen user
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // Dokumen ditemukan, ambil data assets
        const userData = docSnap.data();
        return userData.assets || { stocks: [], crypto: [] };
      } else {
        // Dokumen tidak ditemukan, buat baru
        await setDoc(docRef, {
          email: user.email,
          createdAt: new Date().toISOString(),
          assets: { stocks: [], crypto: [] }
        });
        return { stocks: [], crypto: [] };
      }
    } catch (error) {
      console.error("Error getting portfolio:", error);
      return { stocks: [], crypto: [] };
    }
  }, [user]);

  // Fungsi untuk menyimpan data portfolio
  const saveUserPortfolio = useCallback(async (assets) => {
    if (!user) return false;

    try {
      const docRef = doc(db, "users", user.uid);
      await updateDoc(docRef, {
        assets: assets,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error("Error saving portfolio:", error);
      
      // Jika error karena dokumen belum ada, coba buat baru
      if (error.code === 'not-found') {
        try {
          await setDoc(docRef, {
            email: user.email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assets: assets
          });
          return true;
        } catch (setDocError) {
          console.error("Error creating new document:", setDocError);
          return false;
        }
      }
      return false;
    }
  }, [user]);

  // Nilai context yang akan disediakan
  const value = {
    user,
    loading,
    logout,
    getUserPortfolio,
    saveUserPortfolio
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook untuk menggunakan context
export function useAuth() {
  return useContext(AuthContext);
}