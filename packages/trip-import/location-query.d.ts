export function deliveryLocationQuery(query: string, city: string, province: string): string;
export function locationGeography(value: string): string;
type Candidate = { display_name: string; provinces?: string[]; cities?: string[]; country_code?: string };
export function rankDeliveryLocations<T extends Candidate>(candidates: T[], province: string, city: string): T[];
