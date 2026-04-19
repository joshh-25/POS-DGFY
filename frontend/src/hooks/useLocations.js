import { useState, useEffect } from 'react';
import { listTenantLocations } from '../services/tenantLocationService.js';

export const useLocations = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const data = await listTenantLocations({ include_inactive: true });
                setLocations(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Failed to fetch locations", error);
                setLocations([]);
            } finally {
                setLoading(false);
            }
        };

        fetchLocations();
    }, []);

    return { locations, loading };
};
