import privacy from './privacy.json';
import publisher from './publisher.json';

export const storeCandidate=import.meta.env.VITE_STORE_CANDIDATE==='true';
export {publisher};
export const privacySections=privacy.sections as [string,string][];
