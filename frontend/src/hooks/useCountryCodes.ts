import { COUNTRY_CODES, type CountryCode } from "@/data/countryCodes";

export function useCountryCodes(): {
  countryCodes: CountryCode[];
  loading: boolean;
} {
  return { countryCodes: COUNTRY_CODES, loading: false };
}
