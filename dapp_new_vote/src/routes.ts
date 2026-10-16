export function questionHash(id: number): string {
    return `#/kuesioner/${id}`;
}

// Full link for sharing. Hash routing keeps this working on GitHub Pages without server rewrites.
export function questionUrl(id: number): string {
    return `${window.location.origin}${window.location.pathname}${questionHash(id)}`;
}
