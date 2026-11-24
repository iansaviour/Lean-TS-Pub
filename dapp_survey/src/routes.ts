export function surveyHash(id: number): string {
    return `#/survei/${id}`;
}

// Full link for sharing. Hash routing keeps this working on GitHub Pages without server rewrites.
export function surveyUrl(id: number): string {
    return `${window.location.origin}${window.location.pathname}${surveyHash(id)}`;
}
