import React, { createContext, useState, useContext, useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

const UnsavedChangesContext = createContext();

export const UnsavedChangesProvider = ({ children }) => {
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const router = useRouter();

    // Logic to intercept navigation could go here, but Expo Router's handling is tricky.
    // For now, we simple expose the state so screens can check it or set it.

    return (
        <UnsavedChangesContext.Provider value={{ hasUnsavedChanges, setHasUnsavedChanges }}>
            {children}
        </UnsavedChangesContext.Provider>
    );
};

export const useUnsavedChanges = () => {
    const context = useContext(UnsavedChangesContext);
    if (!context) {
        throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
    }
    return context;
};
