export interface CatalogProduct {
    itemId: number;
    itemName: string;
    categoryName: string;
    price: number;
    barcode?: string | null;
    imageUrl?: string | null;
}
