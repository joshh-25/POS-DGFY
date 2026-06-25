import type { CatalogProduct } from '../domain/catalog';

export const mockCatalog: CatalogProduct[] = [
    { itemId: 101, itemName: 'Brewed Coffee', categoryName: 'Beverages', price: 95, barcode: '480000000101' },
    { itemId: 102, itemName: 'Iced Latte', categoryName: 'Beverages', price: 140, barcode: '480000000102' },
    { itemId: 201, itemName: 'Chicken Sandwich', categoryName: 'Meals', price: 175, barcode: '480000000201' },
    { itemId: 202, itemName: 'Fries', categoryName: 'Sides', price: 65, barcode: '480000000202' }
];
