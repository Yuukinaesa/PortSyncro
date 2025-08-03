// lib/authContext.js
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/router';
import { secureLogger, validateInput, sanitizeInput, sessionSecurity, secureErrorHandler } from './security';

// Helper function to clean undefined values from objects
const cleanUndefinedValues = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedValues(item)).filter(item => item !== null);
  }
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanUndefinedValues(value);
    }
  }
  return cleaned;
};

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
      if (user) {
        // Validate and sanitize user data
        if (sessionSecurity.validateSession(user)) {
          const sanitizedUser = sessionSecurity.sanitizeUserData(user);
          setUser(sanitizedUser);
          secureLogger.log('User authenticated:', sanitizedUser.email);
        } else {
          secureLogger.warn('Invalid user session detected');
          setUser(null);
        }
      } else {
        setUser(null);
        secureLogger.log('User signed out');
      }
      setLoading(false);
    });

    // Timeout untuk mencegah loading yang terlalu lama
    const timeoutId = setTimeout(() => {
      if (loading) {
        secureLogger.warn("Auth loading timed out");
        setLoading(false);
      }
    }, process.env.NODE_ENV === 'production' ? 5000 : 3000); // 5 detik di production, 3 detik di development

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
      secureLogger.log('User logged out successfully');
      router.push('/login');
    } catch (error) {
      const errorResponse = secureErrorHandler.handle(error, 'LOGOUT');
      secureLogger.error("Error signing out:", errorResponse);
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
        const portfolio = userData.assets || { stocks: [], crypto: [] };
        
        // Sanitize portfolio data
        const sanitizedPortfolio = {
          stocks: Array.isArray(portfolio.stocks) ? portfolio.stocks.map(stock => ({
            ...stock,
            ticker: validateInput.stockSymbol(stock.ticker) ? stock.ticker : '',
            name: sanitizeInput.string(stock.name || ''),
            amount: validateInput.amount(stock.amount) ? stock.amount : 0,
            avgPrice: validateInput.price(stock.avgPrice) ? stock.avgPrice : 0
          })).filter(stock => stock.ticker) : [],
          crypto: Array.isArray(portfolio.crypto) ? portfolio.crypto.map(crypto => ({
            ...crypto,
            symbol: validateInput.cryptoSymbol(crypto.symbol) ? crypto.symbol : '',
            name: sanitizeInput.string(crypto.name || ''),
            amount: validateInput.amount(crypto.amount) ? crypto.amount : 0,
            avgPrice: validateInput.price(crypto.avgPrice) ? crypto.avgPrice : 0
          })).filter(crypto => crypto.symbol) : []
        };
        
        secureLogger.log('Portfolio loaded successfully');
        return sanitizedPortfolio;
      } else {
        // Dokumen tidak ditemukan, buat baru
        const newUserData = {
          email: user.email,
          createdAt: new Date().toISOString(),
          assets: { stocks: [], crypto: [] }
        };
        
        await setDoc(docRef, newUserData);
        secureLogger.log('New user document created');
        return { stocks: [], crypto: [] };
      }
    } catch (error) {
      const errorResponse = secureErrorHandler.handle(error, 'GET_PORTFOLIO');
      secureLogger.error("Error getting portfolio:", errorResponse);
      return { stocks: [], crypto: [] };
    }
  }, [user]);

  // Fungsi untuk menyimpan data portfolio
  const saveUserPortfolio = useCallback(async (assets) => {
    if (!user) return false;

    try {
      // Validate and sanitize assets before saving
      const validatedAssets = {
        stocks: Array.isArray(assets.stocks) ? assets.stocks.filter(stock => 
          validateInput.stockSymbol(stock.ticker) && 
          validateInput.amount(stock.amount) && 
          validateInput.price(stock.avgPrice)
        ).map(stock => ({
          ...stock,
          name: sanitizeInput.string(stock.name || ''),
          ticker: stock.ticker.trim().toUpperCase()
        })) : [],
        crypto: Array.isArray(assets.crypto) ? assets.crypto.filter(crypto => 
          validateInput.cryptoSymbol(crypto.symbol) && 
          validateInput.amount(crypto.amount) && 
          validateInput.price(crypto.avgPrice)
        ).map(crypto => ({
          ...crypto,
          name: sanitizeInput.string(crypto.name || ''),
          symbol: crypto.symbol.trim().toUpperCase()
        })) : []
      };
      
      // Clean undefined values before saving
      const cleanedAssets = cleanUndefinedValues(validatedAssets);
      
      const docRef = doc(db, "users", user.uid);
      await updateDoc(docRef, {
        assets: cleanedAssets,
        updatedAt: new Date().toISOString()
      });
      
      secureLogger.log('Portfolio saved successfully');
      return true;
    } catch (error) {
      const errorResponse = secureErrorHandler.handle(error, 'SAVE_PORTFOLIO');
      secureLogger.error("Error saving portfolio:", errorResponse);
      
      // Jika error karena dokumen belum ada, coba buat baru
      if (error.code === 'not-found') {
        try {
          const cleanedAssets = cleanUndefinedValues(assets);
          await setDoc(docRef, {
            email: user.email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assets: cleanedAssets
          });
          secureLogger.log('New user document created during save');
          return true;
        } catch (setDocError) {
          const setDocErrorResponse = secureErrorHandler.handle(setDocError, 'CREATE_USER_DOC');
          secureLogger.error("Error creating new document:", setDocErrorResponse);
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