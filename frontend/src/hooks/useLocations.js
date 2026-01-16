import { useState, useEffect } from 'react';
import { getLocations } from '../services/stockMovementService.js';

export const useLocations = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const data = await getLocations();
                setLocations(data);
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
