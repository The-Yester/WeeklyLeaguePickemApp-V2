// context/UnsavedChangesContext.js
import React, { createContext, useState, useContext } from 'react';

const UnsavedChangesContext = createContext({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
});

export const useUnsavedChanges = () => {
  return useContext(UnsavedChangesContext);
};

export const UnsavedChangesProvider = ({ children }) => {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const value = {
    hasUnsavedChanges,
    setHasUnsavedChanges,
  };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
};

export default { useUnsavedChanges, UnsavedChangesProvider };
