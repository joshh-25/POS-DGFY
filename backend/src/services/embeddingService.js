import OpenAI from 'openai';
import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';

let _openai = null;
const getOpenAI = () => {
    if (_openai) return _openai;
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured. Please add it to your environment.');
    }
    _openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    return _openai;
};

// Cache for embeddings to avoid re-fetching active item vectors on every search
// Keyed by tenantId: { tenantId: { itemId: [vector] } }
let EMBEDDING_CACHE = {};
let CACHE_TIMESTAMPS = {};
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

/**
 * Generate embedding for a text string using OpenAI
 * @param {string} text - text to embed
 * @returns {Promise<number[]>} vector array
 */
export const generateEmbedding = async (text) => {
    try {
        const response = await getOpenAI().embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });
        return response.data[0].embedding;
    } catch (error) {
        logger.error('Error generating embedding:', error);
        throw error;
    }
};

/**
 * Update or create embedding for an item
 * @param {Object} item - Item instance
 */
export const syncItemEmbedding = async (item) => {
    const ItemEmbedding = dbStore.get('ItemEmbedding');
    const store = dbStore.getStore();
    const tenantId = store?.tenantId || 'default';

    try {
        // Construct rich context string
        const context = `
      Item: ${item.name}
      Category: ${item.category}
      SKU: ${item.sku_code}
      Description: ${item.description || ''}
      Unit: ${item.unit_of_measure}
    `.trim().replace(/\s+/g, ' ');

        const vector = await generateEmbedding(context);

        await ItemEmbedding.upsert({
            item_id: item.item_id,
            vector: JSON.stringify(vector)
        });

        // Invalidate cache for this tenant
        delete EMBEDDING_CACHE[tenantId];

        logger.info(`Updated embedding for item ${item.item_id} (${item.name}) in tenant ${tenantId}`);
    } catch (error) {
        logger.error(`Failed to sync embedding for item ${item.item_id}:`, error);
    }
};

/**
 * Calculate Cosine Similarity between two vectors
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} similarity score (-1 to 1)
 */
export const cosineSimilarity = (vecA, vecB) => {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
};

/**
 * Perform semantic search
 * @param {string} queryText - User's search query
 * @param {number} limit - Max results
 * @param {number} threshold - Min similarity (0.3-0.5 is usually good for OpenAI small)
 * @returns {Promise<Object[]>} Array of { item_id, score }
 */
export const searchByMeaning = async (queryText, limit = 20, threshold = 0.4) => {
    const ItemEmbedding = dbStore.get('ItemEmbedding');
    const store = dbStore.getStore();
    const tenantId = store?.tenantId || 'default';

    // 1. Get query embedding
    const queryVector = await generateEmbedding(queryText);

    // 2. Load all item embeddings (cached per tenant)
    if (!EMBEDDING_CACHE[tenantId] || Date.now() - (CACHE_TIMESTAMPS[tenantId] || 0) > CACHE_TTL) {
        const allEmbeddings = await ItemEmbedding.findAll({
            attributes: ['item_id', 'vector']
        });

        EMBEDDING_CACHE[tenantId] = {};
        allEmbeddings.forEach(rec => {
            try {
                EMBEDDING_CACHE[tenantId][rec.item_id] = JSON.parse(rec.vector);
            } catch (e) {
                logger.warn(`Failed to parse vector for item ${rec.item_id} in tenant ${tenantId}`);
            }
        });
        CACHE_TIMESTAMPS[tenantId] = Date.now();
    }

    // 3. Compute similarities in-memory for this tenant
    const results = [];
    for (const [strId, vector] of Object.entries(EMBEDDING_CACHE[tenantId])) {
        const score = cosineSimilarity(queryVector, vector);
        if (score >= threshold) {
            results.push({ item_id: parseInt(strId), score });
        }
    }

    // 4. Sort and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
};
