import { useEffect, useState } from "react";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";

/**
 * Hook for persisting a boolean value to localStorage.
 * @param storageKey - The key to use for localStorage
 * @param fallback - The default value if no stored value exists (defaults to false)
 * @returns A tuple of [value, setValue] similar to useState
 */
export const useStoredBoolean = (
    storageKey: string,
    fallback: boolean = false,
) => {
    const [value, setValue] = useState<boolean>(() => {
        const stored = localStorageAdapter.readBoolean(storageKey);
        return stored ?? fallback;
    });

    useEffect(() => {
        localStorageAdapter.writeBoolean(storageKey, value);
    }, [storageKey, value]);

    return [value, setValue] as const;
};
