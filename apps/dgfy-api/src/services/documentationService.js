/**
 * Documentation Service (RAG)
 *
 * Provides search functionality for project documentation.
 * Uses simple keyword matching for now - can be upgraded to vector search later.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Documentation index - maps topics to file paths and descriptions
const DOCUMENTATION_INDEX = [
  {
    id: 'claude-overview',
    title: 'Project Overview (CLAUDE.md)',
    file: '../../CLAUDE.md',
    keywords: ['overview', 'project', 'structure', 'architecture', 'tech stack', 'setup', 'features'],
    description: 'Main project documentation with tech stack, structure, and key concepts'
  },
  {
    id: 'api-specification',
    file: '../../../docs/api/specification.md',
    title: 'API Specification',
    keywords: ['api', 'endpoint', 'route', 'request', 'response', 'http', 'rest'],
    description: 'Complete API endpoint documentation'
  },
  {
    id: 'database-schema',
    file: '../../../docs/database/schema.md',
    title: 'Database Schema',
    keywords: ['database', 'table', 'schema', 'model', 'column', 'field', 'relation', 'mysql'],
    description: 'Database table definitions and relationships'
  },
  {
    id: 'nested-products',
    file: '../../../docs/features/NESTED_PRODUCTS.md',
    title: 'Nested Products Guide',
    keywords: ['nested', 'product', 'recipe', 'ingredient', 'composition', 'level', 'hierarchy'],
    description: 'Guide for creating products that use other products as ingredients'
  },
  {
    id: 'csv-import',
    file: '../../../docs/guides/csv_import_guide.md',
    title: 'CSV Import Guide',
    keywords: ['csv', 'import', 'export', 'file', 'upload', 'template', 'bulk', 'workflow_mode', 'msme', 'manufacturing'],
    description: 'How to import and export inventory data with workflow-mode template enforcement'
  },
  {
    id: 'quick-start',
    file: '../../QUICK_START.md',
    title: 'Quick Start Guide',
    keywords: ['start', 'setup', 'install', 'begin', 'tutorial', 'getting started'],
    description: 'Quick setup and getting started guide'
  },
  {
    id: 'troubleshooting',
    file: '../../TROUBLESHOOTING.md',
    title: 'Troubleshooting',
    keywords: ['error', 'problem', 'issue', 'fix', 'debug', 'troubleshoot', 'help'],
    description: 'Common problems and their solutions'
  },
  {
    id: 'quick-reference',
    file: '../../../docs/reference/QUICK_REFERENCE.md',
    title: 'Quick Reference',
    keywords: ['reference', 'command', 'shortcut', 'cheatsheet', 'quick'],
    description: 'Quick reference for common commands and operations'
  }
];

// Cache for loaded documentation
const documentationCache = new Map();

/**
 * Load and cache documentation content
 * @param {string} docId - Document ID
 * @returns {Promise<string|null>} Document content or null
 */
async function loadDocument(docId) {
  if (documentationCache.has(docId)) {
    return documentationCache.get(docId);
  }

  const doc = DOCUMENTATION_INDEX.find(d => d.id === docId);
  if (!doc) return null;

  try {
    const filePath = path.resolve(__dirname, doc.file);
    const content = await fs.readFile(filePath, 'utf-8');
    documentationCache.set(docId, content);
    return content;
  } catch (error) {
    logger.warn(`Could not load documentation: ${doc.file}`, error.message);
    return null;
  }
}

/**
 * Search documentation for relevant sections
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching documentation sections
 */
export async function searchDocumentation(query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  const results = [];

  for (const doc of DOCUMENTATION_INDEX) {
    // Calculate relevance score based on keyword matches
    let score = 0;

    // Check title match
    if (doc.title.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Check keyword matches
    for (const keyword of doc.keywords) {
      if (queryLower.includes(keyword)) {
        score += 5;
      }
      for (const word of queryWords) {
        if (keyword.includes(word) || word.includes(keyword)) {
          score += 2;
        }
      }
    }

    // Check description match
    for (const word of queryWords) {
      if (doc.description.toLowerCase().includes(word)) {
        score += 1;
      }
    }

    if (score > 0) {
      // Load content and extract relevant section
      const content = await loadDocument(doc.id);
      let excerpt = '';

      if (content) {
        // Find the most relevant section
        const sections = content.split(/^##\s+/m);
        let bestSection = '';
        let bestSectionScore = 0;

        for (const section of sections) {
          let sectionScore = 0;
          const sectionLower = section.toLowerCase();

          for (const word of queryWords) {
            const matches = (sectionLower.match(new RegExp(word, 'gi')) || []).length;
            sectionScore += matches;
          }

          if (sectionScore > bestSectionScore) {
            bestSectionScore = sectionScore;
            bestSection = section;
          }
        }

        // Create excerpt from best section (max 500 chars)
        if (bestSection) {
          excerpt = bestSection.substring(0, 500);
          if (bestSection.length > 500) {
            excerpt += '...';
          }
        } else {
          // Fallback to beginning of document
          excerpt = content.substring(0, 300) + '...';
        }
      }

      results.push({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        score,
        excerpt: excerpt.trim()
      });
    }
  }

  // Sort by score (highest first) and limit results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

/**
 * Get specific documentation by ID
 * @param {string} docId - Document ID
 * @returns {Promise<Object|null>} Document with content
 */
export async function getDocument(docId) {
  const doc = DOCUMENTATION_INDEX.find(d => d.id === docId);
  if (!doc) return null;

  const content = await loadDocument(docId);
  return {
    ...doc,
    content
  };
}

/**
 * Get list of all available documentation
 * @returns {Array} Documentation list
 */
export function getDocumentationList() {
  return DOCUMENTATION_INDEX.map(doc => ({
    id: doc.id,
    title: doc.title,
    description: doc.description,
    keywords: doc.keywords
  }));
}

/**
 * Get contextual help for a specific topic
 * @param {string} topic - Topic to get help for
 * @returns {Promise<string>} Help text
 */
export async function getContextualHelp(topic) {
  const topicLower = topic.toLowerCase();

  // Topic-specific help responses
  const helpTopics = {
    'purchase order': `
**Creating Purchase Orders:**
1. Go to Purchase Orders page
2. Click "Create New PO"
3. Select a supplier
4. Add items with quantities and prices
5. Set expected delivery date
6. Submit the order

**Via AI:** You can say "Create a purchase order for [supplier] with [items]" and I'll prepare it for your confirmation.
    `,
    'job order': `
**Creating Job Orders:**
1. Go to Job Orders page
2. Click "Create New JO"
3. Select the product to produce
4. Enter quantity to produce
5. Review ingredient requirements
6. Submit the order

**Via AI:** Say "Create a job order for [product] with quantity [X]" and I'll set it up.
    `,
    'item': `
**Managing Items:**
- Items can be Raw Materials, Packaging, Products, or Supplies
- Products can have recipes (ingredients from other items)
- Stock is tracked automatically via FIFO batches
- Min threshold alerts when stock is low

**Via AI:** Ask "Show me low stock items" or "Create a new item called [name]"
    `,
    'supplier': `
**Managing Suppliers:**
- Suppliers provide items for purchase orders
- Track quality ratings and delivery performance
- Assign items to suppliers for PO creation
- View purchase history per supplier

**Via AI:** Ask "Show me all suppliers" or "Which items does [supplier] provide?"
    `,
    'stock': `
**Stock Management:**
- Stock moves via Purchase Order receipts, Job Order completions, and manual adjustments
- FIFO (First-In-First-Out) tracks batch costs and expiry
- Stock movements are logged in the audit trail
- Void movements to reverse errors

**Via AI:** Ask "What's the stock level for [item]?" or "Show recent stock movements"
    `,
    'report': `
**Reports:**
- Dashboard shows overview statistics
- Inventory reports show current stock values
- Stock movement reports show transaction history
- Expiry alerts show items nearing expiration

**Via AI:** Ask "Show me dashboard statistics" or "What items are expiring soon?"
    `
  };

  // Find matching topic
  for (const [key, help] of Object.entries(helpTopics)) {
    if (topicLower.includes(key) || key.includes(topicLower)) {
      return help.trim();
    }
  }

  // Search documentation as fallback
  const searchResults = await searchDocumentation(topic);
  if (searchResults.length > 0) {
    return `Here's what I found about "${topic}":\n\n${searchResults[0].excerpt}`;
  }

  return `I don't have specific help for "${topic}". Try asking about purchase orders, job orders, items, suppliers, stock, or reports.`;
}

export default {
  searchDocumentation,
  getDocument,
  getDocumentationList,
  getContextualHelp
};
