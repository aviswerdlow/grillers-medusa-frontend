/**
 * Shared eligibility utility for the checkout "Arrival Date" calendar.
 *
 * Single source of truth used by:
 *   - src/modules/checkout/components/arrival-calendar (UPS Ground / 3 Day / 2nd Day / Overnight)
 *   - src/modules/checkout/components/fulfillment-selector/scheduling/atlanta-delivery
 *   - src/modules/checkout/components/fulfillment-selector/scheduling/southeast-pickup
 *
 * Fixes #36 (Atlanta noon-prior cutoff) and #72 (UPS Ground transit time).
 *
 * Eligibility formula:
 *   1. Start from today's date in America/New_York (server-side time, not client).
 *   2. Add production lead time — catch-weight pack-out adds 1 business day.
 *   3. For UPS methods, add zip-prefix-based transit days (Ground), 3 business
 *      days (3 Day Select), 2 business days (2nd Day Air), or 1 day (Overnight).
 *   4. Skip weekends, observed UPS holidays, Shabbos (Fri sundown → Sat sundown), and
 *      major Yom Tov for both pack-out and arrival.
 *   5. For Atlanta Delivery / Southeast Pickup, only the route's specific weekdays
 *      qualify, AND the cutoff (noon the day before, by default) must not have passed.
 *
 * NOTE on time zones: All cutoff math is done in America/New_York. The plant lives in
 * Doraville, GA, so that's the operationally meaningful clock. Date construction uses
 * the *local* time zone of the server (or browser) — we never construct dates from
 * client clock for cutoff purposes; we always re-derive "now" via the EST helper below.
 */

// ---------------------------------------------------------------------------
// Hardcoded data (TODO: move to Strapi when schema lands)
// ---------------------------------------------------------------------------

/**
 * UPS Ground transit business-days table from Doraville, GA (30340) to destination zip.
 * Source: UPS published Time-in-Transit map for origin 30340, snapshot 2026-04.
 * https://www.ups.com/maps?loc=en_US (look up per origin)
 *
 * Lookup is by 3-digit zip prefix. If a prefix is missing, we fall back to a 5-day
 * conservative estimate, matching the worst-case continental US Ground transit.
 *
 * TODO: refresh annually or move to a live UPS Time-in-Transit API call.
 */
export const UPS_GROUND_TRANSIT_DAYS_BY_PREFIX: Record<string, number> = {
  // Georgia (1 day - in-region)
  "300": 1, "301": 1, "302": 1, "303": 1, "304": 2, "305": 1, "306": 2,
  "307": 2, "308": 2, "309": 2, "310": 2, "311": 2, "312": 2, "313": 2,
  "314": 2, "315": 2, "316": 2, "317": 2, "318": 2, "319": 2, "398": 2,
  "399": 2,
  // Alabama
  "350": 1, "351": 1, "352": 1, "354": 2, "355": 2, "356": 2, "357": 2,
  "358": 2, "359": 2, "360": 2, "361": 2, "362": 2, "363": 2, "364": 2,
  "365": 2, "366": 2, "367": 2, "368": 2, "369": 2,
  // Florida
  "320": 2, "321": 2, "322": 2, "323": 2, "324": 2, "325": 2, "326": 2,
  "327": 2, "328": 2, "329": 2, "330": 2, "331": 2, "332": 2, "333": 2,
  "334": 2, "335": 2, "336": 2, "337": 2, "338": 2, "339": 2, "341": 2,
  "342": 2, "344": 2, "346": 2, "347": 2, "349": 2,
  // Tennessee
  "370": 2, "371": 2, "372": 2, "373": 2, "374": 2, "375": 2, "376": 2,
  "377": 2, "378": 2, "379": 2, "380": 2, "381": 2, "382": 2, "383": 2,
  "384": 2, "385": 2,
  // Mississippi
  "386": 2, "387": 2, "388": 2, "389": 2, "390": 2, "391": 2, "392": 2,
  "393": 2, "394": 2, "395": 2, "396": 2, "397": 2,
  // South Carolina
  "290": 2, "291": 2, "292": 2, "293": 2, "294": 2, "295": 2, "296": 2,
  "297": 2, "298": 2, "299": 2,
  // North Carolina
  "270": 2, "271": 2, "272": 2, "273": 2, "274": 2, "275": 2, "276": 2,
  "277": 2, "278": 2, "279": 2, "280": 2, "281": 2, "282": 2, "283": 2,
  "284": 2, "285": 2, "286": 2, "287": 2, "288": 2, "289": 2,
  // Virginia
  "201": 3, "220": 3, "221": 3, "222": 3, "223": 3, "224": 3, "225": 3,
  "226": 3, "227": 3, "228": 3, "229": 3, "230": 3, "231": 3, "232": 3,
  "233": 3, "234": 3, "235": 3, "236": 3, "237": 3, "238": 3, "239": 3,
  "240": 3, "241": 3, "242": 3, "243": 3, "244": 3, "245": 3, "246": 3,
  // Kentucky
  "400": 2, "401": 2, "402": 2, "403": 2, "404": 2, "405": 2, "406": 2,
  "407": 2, "408": 2, "409": 2, "410": 2, "411": 2, "412": 2, "413": 2,
  "414": 2, "415": 2, "416": 2, "417": 2, "418": 2, "420": 2, "421": 2,
  "422": 2, "423": 2, "424": 2, "425": 2, "426": 2, "427": 2,
  // Louisiana
  "700": 3, "701": 3, "703": 3, "704": 3, "705": 3, "706": 3, "707": 3,
  "708": 3, "710": 3, "711": 3, "712": 3, "713": 3, "714": 3,
  // Arkansas
  "716": 3, "717": 3, "718": 3, "719": 3, "720": 3, "721": 3, "722": 3,
  "723": 3, "724": 3, "725": 3, "726": 3, "727": 3, "728": 3, "729": 3,
  // Missouri
  "630": 3, "631": 3, "633": 3, "634": 3, "635": 3, "636": 3, "637": 3,
  "638": 3, "639": 3, "640": 3, "641": 3, "644": 3, "645": 3, "646": 3,
  "647": 3, "648": 3, "650": 3, "651": 3, "652": 3, "653": 3, "654": 3,
  "655": 3, "656": 3, "657": 3, "658": 3,
  // Illinois
  "600": 3, "601": 3, "602": 3, "603": 3, "604": 3, "605": 3, "606": 3,
  "607": 3, "608": 3, "609": 3, "610": 3, "611": 3, "612": 3, "613": 3,
  "614": 3, "615": 3, "616": 3, "617": 3, "618": 3, "619": 3, "620": 3,
  "622": 3, "623": 3, "624": 3, "625": 3, "626": 3, "627": 3, "628": 3,
  "629": 3,
  // Indiana
  "460": 3, "461": 3, "462": 3, "463": 3, "464": 3, "465": 3, "466": 3,
  "467": 3, "468": 3, "469": 3, "470": 3, "471": 3, "472": 3, "473": 3,
  "474": 3, "475": 3, "476": 3, "477": 3, "478": 3, "479": 3,
  // Ohio
  "430": 3, "431": 3, "432": 3, "433": 3, "434": 3, "435": 3, "436": 3,
  "437": 3, "438": 3, "439": 3, "440": 3, "441": 3, "442": 3, "443": 3,
  "444": 3, "445": 3, "446": 3, "447": 3, "448": 3, "449": 3, "450": 3,
  "451": 3, "452": 3, "453": 3, "454": 3, "455": 3, "456": 3, "457": 3,
  "458": 3,
  // Michigan
  "480": 3, "481": 3, "482": 3, "483": 3, "484": 3, "485": 3, "486": 3,
  "487": 3, "488": 3, "489": 3, "490": 3, "491": 3, "492": 3, "493": 3,
  "494": 3, "495": 3, "496": 3, "497": 3, "498": 3, "499": 3,
  // Pennsylvania, NJ, DE, MD, DC (3 days)
  "150": 3, "151": 3, "152": 3, "153": 3, "154": 3, "155": 3, "156": 3,
  "157": 3, "158": 3, "159": 3, "160": 3, "161": 3, "162": 3, "163": 3,
  "164": 3, "165": 3, "166": 3, "167": 3, "168": 3, "169": 3, "170": 3,
  "171": 3, "172": 3, "173": 3, "174": 3, "175": 3, "176": 3, "177": 3,
  "178": 3, "179": 3, "180": 3, "181": 3, "182": 3, "183": 3, "184": 3,
  "185": 3, "186": 3, "187": 3, "188": 3, "189": 3, "190": 3, "191": 3,
  "192": 3, "193": 3, "194": 3, "195": 3, "196": 3,
  "070": 3, "071": 3, "072": 3, "073": 3, "074": 3, "075": 3, "076": 3,
  "077": 3, "078": 3, "079": 3, "080": 3, "081": 3, "082": 3, "083": 3,
  "084": 3, "085": 3, "086": 3, "087": 3, "088": 3, "089": 3,
  "197": 3, "198": 3, "199": 3,
  "206": 3, "207": 3, "208": 3, "209": 3, "210": 3, "211": 3, "212": 3,
  "214": 3, "215": 3, "216": 3, "217": 3, "218": 3, "219": 3,
  "200": 3, "202": 3, "203": 3, "204": 3, "205": 3,
  // New York
  "100": 3, "101": 3, "102": 3, "103": 3, "104": 3, "105": 3, "106": 3,
  "107": 3, "108": 3, "109": 3, "110": 3, "111": 3, "112": 3, "113": 3,
  "114": 3, "115": 3, "116": 3, "117": 3, "118": 3, "119": 3, "120": 3,
  "121": 3, "122": 3, "123": 3, "124": 3, "125": 3, "126": 3, "127": 3,
  "128": 3, "129": 3, "130": 3, "131": 3, "132": 3, "133": 3, "134": 3,
  "135": 3, "136": 3, "137": 3, "138": 3, "139": 3, "140": 3, "141": 3,
  "142": 3, "143": 3, "144": 3, "145": 3, "146": 3, "147": 3, "148": 3,
  "149": 3,
  // CT, MA, RI, VT, NH, ME (3-4 days)
  "010": 4, "011": 4, "012": 4, "013": 4, "014": 4, "015": 4, "016": 4,
  "017": 4, "018": 4, "019": 4, "020": 4, "021": 4, "022": 4, "023": 4,
  "024": 4, "025": 4, "026": 4, "027": 4, "028": 4, "029": 4,
  "030": 4, "031": 4, "032": 4, "033": 4, "034": 4, "035": 4, "036": 4,
  "037": 4, "038": 4, "039": 4, "040": 4, "041": 4, "042": 4, "043": 4,
  "044": 4, "045": 4, "046": 4, "047": 4, "048": 4, "049": 4,
  "050": 4, "051": 4, "052": 4, "053": 4, "054": 4, "055": 4, "056": 4,
  "057": 4, "058": 4, "059": 4,
  "060": 4, "061": 4, "062": 4, "063": 4, "064": 4, "065": 4, "066": 4,
  "067": 4, "068": 4, "069": 4,
  // Texas (3-4 days)
  "750": 3, "751": 3, "752": 3, "753": 3, "754": 3, "755": 3, "756": 3,
  "757": 3, "758": 3, "759": 3, "760": 3, "761": 3, "762": 3, "763": 3,
  "764": 4, "765": 4, "766": 4, "767": 4, "768": 4, "769": 4, "770": 3,
  "771": 3, "772": 3, "773": 3, "774": 3, "775": 3, "776": 3, "777": 3,
  "778": 4, "779": 4, "780": 4, "781": 4, "782": 4, "783": 4, "784": 4,
  "785": 4, "786": 4, "787": 4, "788": 4, "789": 4, "790": 4, "791": 4,
  "792": 4, "793": 4, "794": 4, "795": 4, "796": 4, "797": 4, "798": 5,
  "799": 5,
  // Oklahoma, Kansas, Nebraska, Iowa (3-4 days)
  "730": 3, "731": 3, "734": 3, "735": 3, "736": 3, "737": 3, "738": 3,
  "739": 3, "740": 3, "741": 3, "743": 3, "744": 3, "745": 3, "746": 3,
  "747": 3, "748": 3, "749": 3,
  "660": 3, "661": 3, "662": 3, "664": 3, "665": 3, "666": 3, "667": 3,
  "668": 3, "669": 3, "670": 3, "671": 3, "672": 3, "673": 3, "674": 3,
  "675": 3, "676": 3, "677": 3, "678": 3, "679": 3,
  "500": 4, "501": 4, "502": 4, "503": 4, "504": 4, "505": 4, "506": 4,
  "507": 4, "508": 4, "509": 4, "510": 4, "511": 4, "512": 4, "513": 4,
  "514": 4, "515": 4, "516": 4, "520": 4, "521": 4, "522": 4, "523": 4,
  "524": 4, "525": 4, "526": 4, "527": 4, "528": 4,
  "680": 4, "681": 4, "683": 4, "684": 4, "685": 4, "686": 4, "687": 4,
  "688": 4, "689": 4, "690": 4, "691": 4, "692": 4, "693": 4,
  // North & South Dakota, Minnesota, Wisconsin (4 days)
  "550": 4, "551": 4, "553": 4, "554": 4, "555": 4, "556": 4, "557": 4,
  "558": 4, "559": 4, "560": 4, "561": 4, "562": 4, "563": 4, "564": 4,
  "565": 4, "566": 4, "567": 4,
  "570": 4, "571": 4, "572": 4, "573": 4, "574": 4, "575": 4, "576": 4,
  "577": 4,
  "580": 4, "581": 4, "582": 4, "583": 4, "584": 4, "585": 4, "586": 4,
  "587": 4, "588": 4,
  "530": 4, "531": 4, "532": 4, "534": 4, "535": 4, "537": 4, "538": 4,
  "539": 4, "540": 4, "541": 4, "542": 4, "543": 4, "544": 4, "545": 4,
  "546": 4, "547": 4, "548": 4, "549": 4,
  // Mountain West (4 days)
  "590": 4, "591": 4, "592": 4, "593": 4, "594": 4, "595": 4, "596": 4,
  "597": 4, "598": 4, "599": 4,
  "800": 4, "801": 4, "802": 4, "803": 4, "804": 4, "805": 4, "806": 4,
  "807": 4, "808": 4, "809": 4, "810": 4, "811": 4, "812": 4, "813": 4,
  "814": 4, "815": 4, "816": 4,
  "820": 4, "821": 4, "822": 4, "823": 4, "824": 4, "825": 4, "826": 4,
  "827": 4, "828": 4, "829": 4, "830": 4, "831": 4,
  // Utah, Idaho, Nevada, Arizona, New Mexico (4-5 days)
  "840": 4, "841": 4, "843": 4, "844": 4, "845": 4, "846": 4, "847": 4,
  "832": 5, "833": 5, "834": 5, "835": 5, "836": 5, "837": 5, "838": 5,
  "850": 4, "851": 4, "852": 4, "853": 4, "855": 4, "856": 4, "857": 4,
  "859": 4, "860": 4, "863": 4, "864": 4, "865": 4,
  "870": 4, "871": 4, "872": 4, "873": 4, "874": 4, "875": 4, "877": 4,
  "878": 4, "879": 4, "880": 4, "881": 4, "882": 4, "883": 4, "884": 4,
  "889": 5, "890": 5, "891": 5, "893": 5, "894": 5, "895": 5, "897": 5,
  "898": 5,
  // California, Oregon, Washington (5 days)
  "900": 5, "901": 5, "902": 5, "903": 5, "904": 5, "905": 5, "906": 5,
  "907": 5, "908": 5, "910": 5, "911": 5, "912": 5, "913": 5, "914": 5,
  "915": 5, "916": 5, "917": 5, "918": 5, "919": 5, "920": 5, "921": 5,
  "922": 5, "923": 5, "924": 5, "925": 5, "926": 5, "927": 5, "928": 5,
  "930": 5, "931": 5, "932": 5, "933": 5, "934": 5, "935": 5, "936": 5,
  "937": 5, "939": 5, "940": 5, "941": 5, "942": 5, "943": 5, "944": 5,
  "945": 5, "946": 5, "947": 5, "948": 5, "949": 5, "950": 5, "951": 5,
  "952": 5, "953": 5, "954": 5, "955": 5, "956": 5, "957": 5, "958": 5,
  "959": 5, "960": 5, "961": 5,
  "970": 5, "971": 5, "972": 5, "973": 5, "974": 5, "975": 5, "976": 5,
  "977": 5, "978": 5, "979": 5,
  "980": 5, "981": 5, "982": 5, "983": 5, "984": 5, "985": 5, "986": 5,
  "988": 5, "989": 5, "990": 5, "991": 5, "992": 5, "993": 5, "994": 5,
  // Hawaii / Alaska — UPS Ground does not service these reliably; default to 7 days
  "967": 7, "968": 7,
  "995": 7, "996": 7, "997": 7, "998": 7, "999": 7,
}

/**
 * Observed UPS holidays (US). Source: ups.com/us/en/help-center/holiday-schedule.page
 * On these dates UPS does not pick up or deliver — neither pack-out nor arrival.
 *
 * TODO: Refresh annually each Q4 for the next calendar year.
 */
export const UPS_HOLIDAYS_ISO: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-05-25", // Memorial Day
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas Day
  // 2027
  "2027-01-01",
  "2027-05-31",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24", // Christmas (observed)
])

/**
 * Major Yom Tov + first/last day Pesach + Rosh Hashanah + Yom Kippur + Sukkot/Shemini Atzeret
 * + Shavuot. We don't pack-out on these days. List is hardcoded for the next ~24 months.
 *
 * TODO: refresh annually. Consider replacing with a Hebcal-style helper if list grows.
 */
export const JEWISH_NO_OPERATIONS_ISO: ReadonlySet<string> = new Set([
  // 2026
  "2026-04-02", // Pesach I
  "2026-04-03", // Pesach II
  "2026-04-08", // Pesach VII
  "2026-04-09", // Pesach VIII
  "2026-05-22", // Shavuot I
  "2026-05-23", // Shavuot II
  "2026-09-12", // Rosh Hashanah I
  "2026-09-13", // Rosh Hashanah II
  "2026-09-21", // Yom Kippur
  "2026-09-26", // Sukkot I
  "2026-09-27", // Sukkot II
  "2026-10-03", // Shemini Atzeret
  "2026-10-04", // Simchat Torah
  // 2027
  "2027-04-22", // Pesach I
  "2027-04-23", // Pesach II
  "2027-04-28", // Pesach VII
  "2027-04-29", // Pesach VIII
  "2027-06-11", // Shavuot I
  "2027-06-12", // Shavuot II
  "2027-10-02", // Rosh Hashanah I
  "2027-10-03", // Rosh Hashanah II
  "2027-10-11", // Yom Kippur
  "2027-10-16", // Sukkot I
  "2027-10-17", // Sukkot II
  "2027-10-23", // Shemini Atzeret
  "2027-10-24", // Simchat Torah
])

// ---------------------------------------------------------------------------
// Method config types
// ---------------------------------------------------------------------------

export type ArrivalMethod =
  | "atlanta_delivery"
  | "southeast_pickup"
  | "plant_pickup"
  | "ups_ground"
  | "ups_3day"
  | "ups_overnight"
  | "ups_2day"

export type FulfillmentBlackouts = {
  /** Plant closures: no pack-out, plant pickup, Atlanta delivery, or route run. */
  operationsIso?: string[]
  /** UPS will not accept an outbound shipment. */
  upsPickupIso?: string[]
  /** UPS will not deliver to the customer. */
  upsDeliveryIso?: string[]
}

type NormalizedFulfillmentBlackouts = {
  operationsIso: Set<string>
  upsPickupIso: Set<string>
  upsDeliveryIso: Set<string>
}

export type AtlantaZipDayConfig = {
  /** Zero-indexed weekday: 0 = Sunday, 1 = Monday, ... 6 = Saturday */
  weekdays: number[]
  /** Cutoff hour (0-23) the day BEFORE the delivery day. Defaults to 12 (noon). */
  cutoffHour?: number
  /** Optional per-zip cutoff weekday override (e.g., a Tuesday route closes Mon noon). */
  cutoffWeekdayOffset?: number // days before delivery day; default 1
}

export type ComputeArrivalDatesInput = {
  /** Selected fulfillment method. */
  method: ArrivalMethod
  /** Destination zip — required for ups_* methods. */
  destinationZip?: string
  /** Server-side current time. Defaults to nowEST() if not provided. */
  now?: Date
  /** Production lead time in business days. Defaults to 1 (catch-weight pack-out). */
  packLeadTimeDays?: number
  /** Lookahead window in days. Defaults to 30. */
  lookAheadDays?: number
  /**
   * Atlanta delivery: per-zip weekday + cutoff config. If method is atlanta_delivery
   * and destinationZip is provided, we look up here.
   */
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  /**
   * Southeast pickup: explicit list of available ISO dates (YYYY-MM-DD) provided by
   * Strapi/config. We then apply the cutoff (default noon-prior).
   */
  southeastAvailableIso?: string[]
  /** Override default cutoff hour (12 = noon EST). */
  defaultCutoffHour?: number
  /** Override default UPS daily pickup cutoff hour EST (15 = 3 PM ET). */
  upsPickupCutoffHour?: number
  /** Operator-managed closures from Strapi. Static annual lists remain fallback. */
  blackouts?: FulfillmentBlackouts
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns "now" in America/New_York. We do checkout cutoff math in Eastern time
 * because the plant ships from Doraville, GA.
 */
export function nowEST(): Date {
  const now = new Date()
  const estStr = now.toLocaleString("en-US", { timeZone: "America/New_York" })
  return new Date(estStr)
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

function normalizeBlackouts(
  blackouts?: FulfillmentBlackouts
): NormalizedFulfillmentBlackouts {
  return {
    operationsIso: new Set(blackouts?.operationsIso || []),
    upsPickupIso: new Set(blackouts?.upsPickupIso || []),
    upsDeliveryIso: new Set(blackouts?.upsDeliveryIso || []),
  }
}

function isUpsHoliday(d: Date): boolean {
  return UPS_HOLIDAYS_ISO.has(toIsoDate(d))
}

function isJewishNoOps(d: Date): boolean {
  return JEWISH_NO_OPERATIONS_ISO.has(toIsoDate(d))
}

function isConfiguredOperationsBlackout(
  d: Date,
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  return blackouts.operationsIso.has(toIsoDate(d))
}

function isConfiguredUpsPickupBlackout(
  d: Date,
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  return blackouts.upsPickupIso.has(toIsoDate(d))
}

function isConfiguredUpsDeliveryBlackout(
  d: Date,
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  return blackouts.upsDeliveryIso.has(toIsoDate(d))
}

/**
 * Friday after sundown → Sunday morning we don't pack-out.
 * Approximation: we treat all of Friday and all of Saturday as no-ops for pack-out.
 * (We already skip Saturday for weekend; Friday afternoon Shabbos is captured by
 * the simple Friday rule when isPackOutCandidate is called for pack-out only.)
 */
function isShabbosPackoutBlocked(d: Date): boolean {
  // Friday: don't pack out same-day; we'd miss the dispatch window before sundown.
  // Saturday: no operations.
  return d.getDay() === 5 || d.getDay() === 6
}

/**
 * A day on which we can hand product to UPS / drive a delivery van.
 * Skips weekends, UPS holidays, Jewish no-op days, and Shabbos.
 */
function isOperatingDay(
  d: Date,
  opts: { forPackout: boolean; forUpsDispatch?: boolean },
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  if (isWeekend(d)) return false
  if (isJewishNoOps(d)) return false
  if (isConfiguredOperationsBlackout(d, blackouts)) return false
  if (
    opts.forUpsDispatch &&
    (isUpsHoliday(d) || isConfiguredUpsPickupBlackout(d, blackouts))
  ) {
    return false
  }
  if (opts.forPackout && isShabbosPackoutBlocked(d)) return false
  return true
}

/**
 * A day on which UPS will *deliver* (skips weekends, UPS holidays).
 * UPS does deliver on some Saturdays for residential, but Ground typically
 * doesn't — keep Saturday excluded for safety. Customers in CA or TX who want
 * Saturday delivery should select Overnight or coordinate separately.
 */
function isUpsDeliveryDay(
  d: Date,
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  if (isWeekend(d)) return false
  if (isUpsHoliday(d)) return false
  if (isConfiguredUpsDeliveryBlackout(d, blackouts)) return false
  return true
}

/**
 * Add N business days to a date, where business days are operating days
 * (skipping weekends, UPS holidays, Jewish no-ops, and Shabbos for pack-out).
 */
function addBusinessDays(
  start: Date,
  days: number,
  forPackout: boolean,
  blackouts: NormalizedFulfillmentBlackouts,
  forUpsDispatch = false
): Date {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  let added = 0
  while (added < days) {
    cursor.setDate(cursor.getDate() + 1)
    if (
      isOperatingDay(
        cursor,
        { forPackout, forUpsDispatch },
        blackouts
      )
    ) {
      added += 1
    }
  }
  return cursor
}

/**
 * Add N delivery days (UPS arrival side — only weekends/holidays excluded).
 */
function addUpsDeliveryDays(
  start: Date,
  days: number,
  blackouts: NormalizedFulfillmentBlackouts
): Date {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  let added = 0
  while (added < days) {
    cursor.setDate(cursor.getDate() + 1)
    if (isUpsDeliveryDay(cursor, blackouts)) added += 1
  }
  return cursor
}

function subtractUpsDeliveryDays(
  start: Date,
  days: number,
  blackouts: NormalizedFulfillmentBlackouts
): Date {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  let subtracted = 0
  while (subtracted < days) {
    cursor.setDate(cursor.getDate() - 1)
    if (isUpsDeliveryDay(cursor, blackouts)) subtracted += 1
  }
  return cursor
}

/**
 * #288: a UPS arrival is only offerable if the shipment reaches the customer within `transit`
 * CALENDAR days of dispatch. UPS business-transit skips weekends/holidays, but a frozen package
 * physically sits in a hub over those days and the dry ice is sized for the business-transit
 * count. So any arrival that would require the package to sit in transit across a weekend or
 * holiday (calendar gap > business transit) would spoil and must not be offered. Example: a
 * 2-business-day-transit ZIP cannot deliver Monday or Tuesday, because that requires shipping
 * Thursday/Friday and sitting over the weekend.
 */
function upsArrivalIsTransitFeasible(
  arrival: Date,
  transit: number,
  msPerDay: number,
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  const shipDate = subtractUpsDeliveryDays(arrival, transit, blackouts)
  const calendarGap = Math.round((arrival.getTime() - shipDate.getTime()) / msPerDay)
  return (
    calendarGap <= transit &&
    isOperatingDay(
      shipDate,
      { forPackout: true, forUpsDispatch: true },
      blackouts
    )
  )
}

/**
 * Look up Ground transit days from the hardcoded table by 3-digit zip prefix.
 * Falls back to 5 days for the conservative continental-US worst case if missing.
 */
export function lookupUpsGroundDays(zip: string): number {
  const prefix = (zip || "").slice(0, 3)
  return UPS_GROUND_TRANSIT_DAYS_BY_PREFIX[prefix] ?? 5
}

export function isUpsGroundAvailableForZip(zip: string): boolean {
  return lookupUpsGroundDays(zip) <= 3
}

export function normalizeUpsServiceCode(
  serviceCode?: string | null
): "GROUND" | "OVERNIGHT" | "2ND_DAY_AIR" | "3_DAY_SELECT" | string {
  const normalized = String(serviceCode || "")
    .trim()
    .toUpperCase()

  if (!normalized) return ""
  if (normalized.includes("GROUND")) return "GROUND"
  if (
    normalized.includes("OVERNIGHT") ||
    normalized.includes("NEXT_DAY") ||
    normalized.includes("NEXT DAY")
  ) {
    return "OVERNIGHT"
  }
  if (
    normalized.includes("2ND_DAY") ||
    normalized.includes("2ND DAY") ||
    normalized.includes("SECOND_DAY") ||
    normalized.includes("SECOND DAY") ||
    normalized.includes("TWO_DAY") ||
    normalized.includes("TWO DAY") ||
    normalized.includes("2DAY")
  ) {
    return "2ND_DAY_AIR"
  }
  if (
    normalized.includes("3_DAY") ||
    normalized.includes("3 DAY") ||
    normalized.includes("3RD_DAY") ||
    normalized.includes("3RD DAY") ||
    normalized.includes("THIRD_DAY") ||
    normalized.includes("THIRD DAY") ||
    normalized.includes("THREE_DAY") ||
    normalized.includes("THREE DAY") ||
    normalized.includes("3DAY")
  ) {
    return "3_DAY_SELECT"
  }

  return normalized
}

function isAllowedUpsArrivalDay(
  d: Date,
  blackouts: NormalizedFulfillmentBlackouts
): boolean {
  if (!isUpsDeliveryDay(d, blackouts)) return false

  // Frozen UPS deliveries should land Monday-Thursday only. Friday arrivals
  // leave too little room for missed-delivery recovery before Shabbos/weekend.
  const day = d.getDay()
  return day >= 1 && day <= 4
}

/**
 * Determine the earliest pack-out date.
 *
 * Rule: if today is an operating day AND we're before the UPS pickup cutoff (3 PM ET),
 * we can pack today; otherwise pack tomorrow (next operating day).
 * For atlanta_delivery / southeast_pickup we don't ship via UPS so the only constraint
 * is that we pack a business day before the route runs.
 */
function earliestPackoutDate(
  now: Date,
  upsCutoffHour: number,
  forPackout: boolean,
  blackouts: NormalizedFulfillmentBlackouts,
  forUpsDispatch: boolean
): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayOk = isOperatingDay(
    today,
    { forPackout, forUpsDispatch },
    blackouts
  )
  const beforeCutoff = now.getHours() < upsCutoffHour
  if (todayOk && beforeCutoff) return today
  return addBusinessDays(
    today,
    1,
    forPackout,
    blackouts,
    forUpsDispatch
  )
}

// ---------------------------------------------------------------------------
// Public: compute eligible arrival dates
// ---------------------------------------------------------------------------

export type EligibleArrivalResult = {
  /** Sorted list of eligible Date objects (local-zone midnight). */
  dates: Date[]
  /** Set of YYYY-MM-DD strings, for quick `isDateUnavailable` lookups. */
  isoSet: Set<string>
  /** Earliest eligible date, or null if none. */
  earliest: Date | null
  /** A short, customer-facing reason describing the constraint applied. */
  reason: string
}

export function computeEligibleArrivalDates(
  input: ComputeArrivalDatesInput
): EligibleArrivalResult {
  const {
    method,
    destinationZip = "",
    packLeadTimeDays = 1,
    lookAheadDays = 30,
    atlantaZipConfig,
    southeastAvailableIso,
    defaultCutoffHour = 12,
    upsPickupCutoffHour = 15,
    blackouts,
  } = input

  const now = input.now ?? nowEST()
  const normalizedBlackouts = normalizeBlackouts(blackouts)
  const out: Date[] = []
  let reason = ""
  const usesUps = method.startsWith("ups_")

  // Earliest pack-out date — same logic for all methods. We add the catch-weight
  // pack lead time on top of that; if packLeadTimeDays === 0 the earliest packout
  // IS the dispatch day.
  const packoutBase = earliestPackoutDate(
    now,
    upsPickupCutoffHour,
    true,
    normalizedBlackouts,
    usesUps
  )
  const dispatchDate =
    packLeadTimeDays > 0
      ? addBusinessDays(
          packoutBase,
          packLeadTimeDays - 1,
          true,
          normalizedBlackouts,
          usesUps
        )
      : packoutBase

  if (
    method === "ups_ground" ||
    method === "ups_3day" ||
    method === "ups_overnight" ||
    method === "ups_2day"
  ) {
    const transit =
      method === "ups_overnight"
        ? 1
        : method === "ups_2day"
          ? 2
          : method === "ups_3day"
            ? 3
            : lookupUpsGroundDays(destinationZip)

    if (method === "ups_ground" && !isUpsGroundAvailableForZip(destinationZip)) {
      reason = destinationZip
        ? `UPS Ground to ${destinationZip} takes ~${transit} business days, so please choose UPS 2nd Day Air or Overnight.`
        : "UPS Ground is only available where transit is 3 business days or less."
      return {
        dates: [],
        isoSet: new Set(),
        earliest: null,
        reason,
      }
    }

    // Earliest arrival = dispatch + transit business days (UPS-side: weekends + holidays only)
    const earliest = addUpsDeliveryDays(
      dispatchDate,
      transit,
      normalizedBlackouts
    )
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    horizon.setDate(horizon.getDate() + lookAheadDays)

    const cursor = new Date(earliest)
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    while (cursor <= horizon) {
      if (
        isAllowedUpsArrivalDay(cursor, normalizedBlackouts) &&
        upsArrivalIsTransitFeasible(
          cursor,
          transit,
          MS_PER_DAY,
          normalizedBlackouts
        )
      ) {
        out.push(new Date(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const methodLabel =
      method === "ups_overnight"
        ? "UPS Overnight"
        : method === "ups_2day"
          ? "UPS 2nd Day Air"
          : method === "ups_3day"
            ? "UPS 3 Day Select"
            : "UPS Ground"
    const zipNote = destinationZip ? ` to ${destinationZip}` : ""
    reason = `${methodLabel}${zipNote} needs ~${transit} business day${transit === 1 ? "" : "s"} of transit. We schedule frozen UPS arrivals Monday-Thursday, and only when the package won't sit in transit over a weekend.`
  } else if (method === "atlanta_delivery") {
    // Per-zip weekday + cutoff
    const cfg = atlantaZipConfig?.[destinationZip] ?? {
      // Default Atlanta delivery weekdays = Tue/Wed/Thu, cutoff = noon prior day
      weekdays: [2, 3, 4],
      cutoffHour: defaultCutoffHour,
    }

    const cutoffHour = cfg.cutoffHour ?? defaultCutoffHour
    const cutoffOffset = cfg.cutoffWeekdayOffset ?? 1

    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    horizon.setDate(horizon.getDate() + lookAheadDays)

    const cursor = new Date(dispatchDate)
    while (cursor <= horizon) {
      if (
        cfg.weekdays.includes(cursor.getDay()) &&
        isOperatingDay(
          cursor,
          { forPackout: false, forUpsDispatch: false },
          normalizedBlackouts
        )
      ) {
        // Cutoff: cutoffHour on the day "cutoffOffset" days before the delivery day
        const cutoff = new Date(cursor)
        cutoff.setDate(cutoff.getDate() - cutoffOffset)
        cutoff.setHours(cutoffHour, 0, 0, 0)
        if (now < cutoff) {
          out.push(new Date(cursor))
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    reason = `Atlanta Delivery to ${destinationZip || "this zip"} runs on specific weekdays; orders must be in by ${cutoffHour === 12 ? "noon" : `${cutoffHour}:00`} the day before.`
  } else if (method === "southeast_pickup") {
    // Strapi provides the available dates; we apply the cutoff.
    const list = southeastAvailableIso ?? []
    for (const iso of list) {
      const [y, m, d] = iso.split("-").map(Number)
      if (!y || !m || !d) continue
      const date = new Date(y, m - 1, d)
      if (
        isJewishNoOps(date) ||
        isConfiguredOperationsBlackout(date, normalizedBlackouts)
      ) {
        continue
      }
      const cutoff = new Date(date)
      cutoff.setDate(cutoff.getDate() - 1)
      cutoff.setHours(defaultCutoffHour, 0, 0, 0)
      if (now < cutoff) {
        out.push(date)
      }
    }
    reason = `Southeast Pickup runs on scheduled route days; orders must be in by ${defaultCutoffHour === 12 ? "noon" : `${defaultCutoffHour}:00`} the day before.`
  } else {
    // plant_pickup is handled by getAvailablePickupDates in pickup-dates.ts already.
    // We still produce a result here for API completeness.
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    horizon.setDate(horizon.getDate() + lookAheadDays)
    const cursor = new Date(dispatchDate)
    while (cursor <= horizon) {
      if (
        isOperatingDay(
          cursor,
          { forPackout: true, forUpsDispatch: false },
          normalizedBlackouts
        )
      ) {
        out.push(new Date(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    reason = "Plant Pickup runs on operating days."
  }

  out.sort((a, b) => a.getTime() - b.getTime())
  const isoSet = new Set(out.map(toIsoDate))
  return {
    dates: out,
    isoSet,
    earliest: out[0] ?? null,
    reason,
  }
}

/**
 * Server-side validation: returns true if the given date string (MM/DD/YYYY) is
 * valid for the given method+zip combination using the same rules.
 */
export function isArrivalDateValid(
  dateMmDdYyyy: string,
  input: Omit<ComputeArrivalDatesInput, "now"> & { now?: Date }
): boolean {
  if (!dateMmDdYyyy) return false
  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateMmDdYyyy)
  const parts = dateMmDdYyyy.split(isIsoDate ? "-" : "/").map(Number)
  if (parts.length !== 3) return false
  const [y, m, d] = isIsoDate ? parts : [parts[2], parts[0], parts[1]]
  if (!m || !d || !y) return false
  const date = new Date(y, m - 1, d)
  const iso = toIsoDate(date)
  const result = computeEligibleArrivalDates(input)
  return result.isoSet.has(iso)
}

export function parseCheckoutDate(dateMmDdYyyyOrIso: string): Date | null {
  if (!dateMmDdYyyyOrIso) return null

  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateMmDdYyyyOrIso)
  const parts = dateMmDdYyyyOrIso.split(isIsoDate ? "-" : "/").map(Number)
  if (parts.length !== 3) return null

  const [y, m, d] = isIsoDate ? parts : [parts[2], parts[0], parts[1]]
  if (!m || !d || !y) return null

  return new Date(y, m - 1, d)
}

export function computeQuickBooksDueDateForArrival(
  dateMmDdYyyyOrIso: string,
  input: Pick<
    ComputeArrivalDatesInput,
    "method" | "destinationZip" | "blackouts"
  >
): string | null {
  const arrivalDate = parseCheckoutDate(dateMmDdYyyyOrIso)
  if (!arrivalDate) return null

  if (
    input.method !== "ups_ground" &&
    input.method !== "ups_3day" &&
    input.method !== "ups_overnight" &&
    input.method !== "ups_2day"
  ) {
    return toIsoDate(arrivalDate)
  }

  const transit =
    input.method === "ups_overnight"
      ? 1
      : input.method === "ups_2day"
        ? 2
        : input.method === "ups_3day"
          ? 3
          : lookupUpsGroundDays(input.destinationZip || "")

  if (input.method === "ups_ground" && transit > 3) {
    return null
  }

  const normalizedBlackouts = normalizeBlackouts(input.blackouts)
  const shipDate = subtractUpsDeliveryDays(
    arrivalDate,
    transit,
    normalizedBlackouts
  )
  if (
    !isOperatingDay(
      shipDate,
      { forPackout: true, forUpsDispatch: true },
      normalizedBlackouts
    )
  ) {
    return null
  }

  return toIsoDate(shipDate)
}
