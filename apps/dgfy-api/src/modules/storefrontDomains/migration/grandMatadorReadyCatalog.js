export const GRANDMATADOR_READY_CATALOG_SOURCE = 'local:grandmatador-ready-catalog-v1';

const CATEGORY_IDS = Object.freeze({
    Pork: 1,
    Chicken: 2,
    Beef: 3
});

const PRODUCTS = Object.freeze([
    ['Pork', 'Pork Belly', 'pork-belly', 300],
    ['Pork', 'Pork Jaw', 'pork-jaw', 200],
    ['Pork', 'Side Ribs', 'side-ribs', 290],
    ['Pork', 'Pork Steak', 'pork-steak', 290],
    ['Pork', 'Pork Loin', 'pork-loin', 250],
    ['Pork', 'Ham Leg Boneless & Skinless', 'ham-leg-boneless-skinless', 250],
    ['Pork', 'Pork Shoulder', 'pork-shoulder', 250],
    ['Pork', 'Rosary Bones', 'rosary-bones', 160],
    ['Pork', 'Maskara', 'maskara', 150],
    ['Pork', 'Pork Middle', 'pork-middle', 270],
    ['Chicken', 'Dressed Chicken', 'dressed-chicken', 185],
    ['Chicken', 'Breast & Thigh Fillet', 'breast-thigh-fillet', 280],
    ['Chicken', 'Leg Meat', 'leg-meat', 250],
    ['Chicken', 'Chicken Leg Quarter', 'chicken-leg-quarter', 175],
    ['Chicken', 'Wings', 'wings', 195],
    ['Beef', 'Short Plate', 'short-plate', 520],
    ['Beef', 'Forequarter', 'forequarter', 500],
    ['Beef', 'Beef Shank', 'beef-shank', 500]
]);

export const buildGrandMatadorReadyCatalogPages = () => [{
    categories: Object.entries(CATEGORY_IDS).map(([name, id], index) => ({
        id,
        name,
        slug: name.toLowerCase(),
        description: `Ready and available ${name.toLowerCase()} products.`,
        is_active: true,
        sort_order: index
    })),
    products: {
        data: PRODUCTS.map(([category, name, slug, price], index) => ({
            id: 101 + index,
            category_id: CATEGORY_IDS[category],
            slug,
            name,
            description: 'Ready and available. Sold per kilo.',
            base_price: price,
            pricing_unit: 'kg',
            inventory_quantity: 100,
            is_active: true,
            is_featured: false,
            variants: [],
            weight_options: [],
            addons: [],
            images: []
        })),
        next_page_url: null
    }
}];
