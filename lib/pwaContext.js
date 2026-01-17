import React, { createContext, useContext, useState, useEffect } from 'react';

const PWAContext = createContext();

export function PWAProvider({ children }) {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isSupported, setIsSupported] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isAndroid, setIsAndroid] = useState(false);
    const [isMacOS, setIsMacOS] = useState(false);
    const [isWindows, setIsWindows] = useState(false);
    const [isLinux, setIsLinux] = useState(false);

    useEffect(() => {
        const userAgent = window.navigator.userAgent.toLowerCase();

        // Detect iOS (iPhone, iPod, iPad)
        // iPad on iOS 13+ detection (looks like Mac but has touch)
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent) ||
            (userAgent.includes("mac") && "ontouchend" in document);

        // Detect Android
        const isAndroidDevice = /android/.test(userAgent);

        // Detect MacOS (Desktop - not iPad)
        const isMacDevice = userAgent.includes("mac") && !isIosDevice && !isAndroidDevice;

        // Detect Windows
        const isWindowsDevice = /win/.test(userAgent);

        // Detect Linux
        const isLinuxDevice = /linux/.test(userAgent) && !isAndroidDevice;

        setIsIOS(isIosDevice);
        setIsAndroid(isAndroidDevice);
        setIsMacOS(isMacDevice);
        setIsWindows(isWindowsDevice);
        setIsLinux(isLinuxDevice);

        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsSupported(true);
            // console.log('PWA: beforeinstallprompt fired');
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const installPWA = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            // console.log('PWA: User response to install prompt:', outcome);
            setDeferredPrompt(null);
            return 'accepted';
        } else if (isIOS) {
            return 'ios';
        } else if (isMacOS) {
            return 'macos';
        } else if (isAndroid) {
            // Fallback for Android if beforeinstallprompt somehow didn't fire (e.g. Firefox)
            return 'android_instructions';
        } else if (isWindows || isLinux) {
            // Fallback for Windows/Linux if prompt didn't fire (manual install)
            return 'manual';
        } else {
            // Ultimate fallback
            return 'manual';
        }
    };

    return (
        <PWAContext.Provider value={{
            isSupported,
            deferredPrompt,
            installPWA,
            isIOS,
            isAndroid,
            isMacOS,
            isWindows,
            isLinux
        }}>
            {children}
        </PWAContext.Provider>
    );
}

export function usePWA() {
    return useContext(PWAContext);
}
