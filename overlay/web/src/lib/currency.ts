import type { LucideIcon } from "lucide-react";
import { DollarSign, Euro, JapaneseYen, PoundSterling } from "lucide-react";
import type { DisplayCurrencyCode } from "./displayPrefs";

export const CURRENCY_OPTIONS = [
  { code: "AED", name: "United Arab Emirates dirham" },
  { code: "AFN", name: "Afghan afghani" },
  { code: "ALL", name: "Albanian lek" },
  { code: "AMD", name: "Armenian dram" },
  { code: "ANG", name: "Netherlands Antillean guilder" },
  { code: "AOA", name: "Angolan kwanza" },
  { code: "ARS", name: "Argentine peso" },
  { code: "AUD", name: "Australian dollar" },
  { code: "AWG", name: "Aruban florin" },
  { code: "AZN", name: "Azerbaijani manat" },
  { code: "BAM", name: "Bosnia-Herzegovina convertible mark" },
  { code: "BBD", name: "Barbadian dollar" },
  { code: "BDT", name: "Bangladeshi taka" },
  { code: "BGN", name: "Bulgarian lev" },
  { code: "BHD", name: "Bahraini dinar" },
  { code: "BIF", name: "Burundian franc" },
  { code: "BMD", name: "Bermudian dollar" },
  { code: "BND", name: "Brunei dollar" },
  { code: "BOB", name: "Bolivian boliviano" },
  { code: "BRL", name: "Brazilian real" },
  { code: "BSD", name: "Bahamian dollar" },
  { code: "BTN", name: "Bhutanese ngultrum" },
  { code: "BWP", name: "Botswana pula" },
  { code: "BYN", name: "Belarusian ruble" },
  { code: "BZD", name: "Belize dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "CDF", name: "Congolese franc" },
  { code: "CHF", name: "Swiss franc" },
  { code: "CLP", name: "Chilean peso" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "COP", name: "Colombian peso" },
  { code: "CRC", name: "Costa Rican colon" },
  { code: "CUP", name: "Cuban peso" },
  { code: "CVE", name: "Cape Verdean escudo" },
  { code: "CZK", name: "Czech koruna" },
  { code: "DJF", name: "Djiboutian franc" },
  { code: "DKK", name: "Danish krone" },
  { code: "DOP", name: "Dominican peso" },
  { code: "DZD", name: "Algerian dinar" },
  { code: "EGP", name: "Egyptian pound" },
  { code: "ERN", name: "Eritrean nakfa" },
  { code: "ETB", name: "Ethiopian birr" },
  { code: "EUR", name: "Euro" },
  { code: "FJD", name: "Fijian dollar" },
  { code: "FKP", name: "Falkland Islands pound" },
  { code: "GBP", name: "British pound" },
  { code: "GEL", name: "Georgian lari" },
  { code: "GHS", name: "Ghanaian cedi" },
  { code: "GIP", name: "Gibraltar pound" },
  { code: "GMD", name: "Gambian dalasi" },
  { code: "GNF", name: "Guinean franc" },
  { code: "GTQ", name: "Guatemalan quetzal" },
  { code: "GYD", name: "Guyanese dollar" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "HNL", name: "Honduran lempira" },
  { code: "HTG", name: "Haitian gourde" },
  { code: "HUF", name: "Hungarian forint" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "ILS", name: "Israeli new shekel" },
  { code: "INR", name: "Indian rupee" },
  { code: "IQD", name: "Iraqi dinar" },
  { code: "IRR", name: "Iranian rial" },
  { code: "ISK", name: "Icelandic krona" },
  { code: "JMD", name: "Jamaican dollar" },
  { code: "JOD", name: "Jordanian dinar" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KES", name: "Kenyan shilling" },
  { code: "KGS", name: "Kyrgyzstani som" },
  { code: "KHR", name: "Cambodian riel" },
  { code: "KMF", name: "Comorian franc" },
  { code: "KRW", name: "South Korean won" },
  { code: "KWD", name: "Kuwaiti dinar" },
  { code: "KYD", name: "Cayman Islands dollar" },
  { code: "KZT", name: "Kazakhstani tenge" },
  { code: "LAK", name: "Lao kip" },
  { code: "LBP", name: "Lebanese pound" },
  { code: "LKR", name: "Sri Lankan rupee" },
  { code: "LRD", name: "Liberian dollar" },
  { code: "LSL", name: "Lesotho loti" },
  { code: "LYD", name: "Libyan dinar" },
  { code: "MAD", name: "Moroccan dirham" },
  { code: "MDL", name: "Moldovan leu" },
  { code: "MGA", name: "Malagasy ariary" },
  { code: "MKD", name: "Macedonian denar" },
  { code: "MMK", name: "Myanmar kyat" },
  { code: "MNT", name: "Mongolian tugrik" },
  { code: "MOP", name: "Macanese pataca" },
  { code: "MRU", name: "Mauritanian ouguiya" },
  { code: "MUR", name: "Mauritian rupee" },
  { code: "MVR", name: "Maldivian rufiyaa" },
  { code: "MWK", name: "Malawian kwacha" },
  { code: "MXN", name: "Mexican peso" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "MZN", name: "Mozambican metical" },
  { code: "NAD", name: "Namibian dollar" },
  { code: "NGN", name: "Nigerian naira" },
  { code: "NIO", name: "Nicaraguan cordoba" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "NPR", name: "Nepalese rupee" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "OMR", name: "Omani rial" },
  { code: "PAB", name: "Panamanian balboa" },
  { code: "PEN", name: "Peruvian sol" },
  { code: "PGK", name: "Papua New Guinean kina" },
  { code: "PHP", name: "Philippine peso" },
  { code: "PKR", name: "Pakistani rupee" },
  { code: "PLN", name: "Polish zloty" },
  { code: "PYG", name: "Paraguayan guarani" },
  { code: "QAR", name: "Qatari riyal" },
  { code: "RON", name: "Romanian leu" },
  { code: "RSD", name: "Serbian dinar" },
  { code: "RUB", name: "Russian ruble" },
  { code: "RWF", name: "Rwandan franc" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "SBD", name: "Solomon Islands dollar" },
  { code: "SCR", name: "Seychellois rupee" },
  { code: "SDG", name: "Sudanese pound" },
  { code: "SEK", name: "Swedish krona" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "SHP", name: "Saint Helena pound" },
  { code: "SLE", name: "Sierra Leonean leone" },
  { code: "SOS", name: "Somali shilling" },
  { code: "SRD", name: "Surinamese dollar" },
  { code: "SSP", name: "South Sudanese pound" },
  { code: "STN", name: "Sao Tome and Principe dobra" },
  { code: "SVC", name: "Salvadoran colon" },
  { code: "SYP", name: "Syrian pound" },
  { code: "SZL", name: "Swazi lilangeni" },
  { code: "THB", name: "Thai baht" },
  { code: "TJS", name: "Tajikistani somoni" },
  { code: "TMT", name: "Turkmenistani manat" },
  { code: "TND", name: "Tunisian dinar" },
  { code: "TOP", name: "Tongan pa'anga" },
  { code: "TRY", name: "Turkish lira" },
  { code: "TTD", name: "Trinidad and Tobago dollar" },
  { code: "TWD", name: "New Taiwan dollar" },
  { code: "TZS", name: "Tanzanian shilling" },
  { code: "UAH", name: "Ukrainian hryvnia" },
  { code: "UGX", name: "Ugandan shilling" },
  { code: "USD", name: "United States dollar" },
  { code: "UYU", name: "Uruguayan peso" },
  { code: "UZS", name: "Uzbekistani som" },
  { code: "VES", name: "Venezuelan bolivar" },
  { code: "VND", name: "Vietnamese dong" },
  { code: "VUV", name: "Vanuatu vatu" },
  { code: "WST", name: "Samoan tala" },
  { code: "XAF", name: "Central African CFA franc" },
  { code: "XCD", name: "East Caribbean dollar" },
  { code: "XOF", name: "West African CFA franc" },
  { code: "XPF", name: "CFP franc" },
  { code: "YER", name: "Yemeni rial" },
  { code: "ZAR", name: "South African rand" },
  { code: "ZMW", name: "Zambian kwacha" },
  { code: "ZWG", name: "Zimbabwe gold" },
] as const;

/** Lucide glyph for a display-currency code (shared ¥ for CNY/JPY). */
const CURRENCY_ICONS: Record<DisplayCurrencyCode, LucideIcon> = {
  USD: DollarSign,
  HKD: DollarSign,
  TWD: DollarSign,
  SGD: DollarSign,
  AUD: DollarSign,
  CNY: JapaneseYen,
  JPY: JapaneseYen,
  EUR: Euro,
  GBP: PoundSterling,
};

/**
 * Disambiguated symbols — five of the offered currencies are dollars and two are
 * yen, so the bare glyph cannot tell them apart in a list.
 * Pinned rather than derived because `Intl` narrow symbols collapse to `$` / `¥`
 * and its wide symbols vary by locale (SGD renders as the code in en-US).
 */
const CURRENCY_SYMBOLS: Record<DisplayCurrencyCode, string> = {
  USD: "$",
  HKD: "HK$",
  TWD: "NT$",
  CNY: "CN¥",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  SGD: "S$",
};

/** Issuing region — the plain-language half of the code (`HKD` → Hong Kong). */
const CURRENCY_REGIONS: Record<DisplayCurrencyCode, string> = {
  USD: "United States",
  HKD: "Hong Kong",
  TWD: "Taiwan",
  CNY: "China",
  EUR: "Euro area",
  GBP: "United Kingdom",
  JPY: "Japan",
  AUD: "Australia",
  SGD: "Singapore",
};

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

export function currencyIcon(code: string): LucideIcon {
  return CURRENCY_ICONS[normalize(code) as DisplayCurrencyCode] ?? DollarSign;
}

/**
 * Short symbol for a currency code. Accounts may hold a currency outside the
 * display switch (e.g. `CAD`), so unlisted codes fall back to the Intl symbol.
 */
export function currencySymbol(code: string): string {
  const key = normalize(code);
  const pinned = CURRENCY_SYMBOLS[key as DisplayCurrencyCode];
  if (pinned) return pinned;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
      currencyDisplay: "symbol",
      maximumFractionDigits: 0,
    })
      .format(0)
      .replace(/[\d\s.,]/g, "");
  } catch {
    return "";
  }
}

/** Issuing region, or `undefined` for codes outside the display switch. */
export function currencyRegion(code: string): string | undefined {
  return CURRENCY_REGIONS[normalize(code) as DisplayCurrencyCode];
}
