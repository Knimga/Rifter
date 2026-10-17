/** File-name form of a display name: 'Plain Bastard Sword' -> 'plain-bastard-sword'. Design file stems use it. */
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
