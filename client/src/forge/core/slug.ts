/**
 * File-name form of a display name: 'Plain Bastard Sword' -> 'plain-bastard-sword', "Merchant's Cart" ->
 * 'merchants-cart' (apostrophes dropped). Design file stems use it.
 */
export const slug = (name: string) => name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
