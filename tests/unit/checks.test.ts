import { describe, expect, it } from "vitest";
import { CARRIER, CARRIERS, VEHICLE } from "@/data/companies";
import { PLACE_IDS, PLACES } from "@/data/places";
import { buildLoads, eligibleCarriers } from "@/data/seed";
import type { Carrier, Vehicle } from "@/data/types";
import { en } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { eu } from "@/i18n/dictionaries/eu";
import { fr } from "@/i18n/dictionaries/fr";
import { ru } from "@/i18n/dictionaries/ru";
import {
  cabotageUsed,
  DECA_MANDATORY,
  hasDgtLabel,
  insideZbe,
  isCabotage,
  isCrossTrade,
  jobScope,
  LIGHT_VAN_TACHOGRAPH_FROM,
  licenceLocalName,
  licenceProblems,
  needsPostingDeclaration,
  touchesZbe,
  touchesZfe,
  transportDocument,
  ZBE_IN_FORCE,
  ZBE_PHASE2,
  ZBE_STOPS,
  zbeFor,
  zbeNeedsAuth,
  zbeProblem,
  zbeVerdict,
} from "@/lib/checks";

const madrid = (s: string) => Date.parse(`${s}+01:00`);
const NOW = Date.parse("2026-10-24T10:00:00+02:00");
const PHASE2_DAY = madrid("2028-01-15T09:00:00");
const v = (id: string) => VEHICLE.get(id)!;

describe("Donostia ZBE by label and date", () => {
  it("dates phase 2 exactly 36 months after entry into force (17-12-2024 → 17-12-2027)", () => {
    expect(new Date(ZBE_IN_FORCE).toISOString()).toBe("2024-12-16T23:00:00.000Z");
    expect(new Date(ZBE_PHASE2).toISOString()).toBe("2027-12-16T23:00:00.000Z");
  });

  it("lets 0, ECO, C and B in during phase 1, B only until phase 2", () => {
    for (const eco of ["0", "ECO", "C"] as const) expect(zbeVerdict({ eco }, NOW)).toEqual({ status: "free", phase: 1, declaration: false });
    expect(zbeVerdict({ eco: "B" }, NOW)).toEqual({ status: "free", phase: 1, until: ZBE_PHASE2, declaration: false });
  });

  it("bans unlabelled vehicles unless they hold the phase-1 delivery authorisation", () => {
    expect(zbeVerdict({ eco: "none" }, NOW).status).toBe("banned");
    expect(zbeVerdict({ eco: "none", zbeDeliveryAuth: true }, NOW)).toEqual({ status: "authorised", phase: 1, until: ZBE_PHASE2, declaration: false });
  });

  it("bans B and unlabelled vehicles (authorised or not) from phase 2", () => {
    expect(zbeVerdict({ eco: "B" }, PHASE2_DAY).status).toBe("banned");
    expect(zbeVerdict({ eco: "none", zbeDeliveryAuth: true }, PHASE2_DAY).status).toBe("banned");
    expect(zbeVerdict({ eco: "C" }, PHASE2_DAY).status).toBe("free");
    expect(zbeVerdict({ eco: "B" }, ZBE_PHASE2 - 1).status).toBe("free");
    expect(zbeVerdict({ eco: "B" }, ZBE_PHASE2).status).toBe("banned");
  });

  it("restricts nothing before the ordinance and asks foreign plates for a declaration", () => {
    expect(zbeVerdict({ eco: "none" }, madrid("2024-12-01T12:00:00")).status).toBe("free");
    expect(zbeVerdict({ eco: "C" }, NOW, true).declaration).toBe(true);
  });

  it("checks stops against the annex-1 perimeter, which ends at the Urumea", () => {
    expect(insideZbe([-1.9843, 43.3236])).toBe(true); // Parte Vieja, Plaza de la Constitución
    expect(insideZbe([-1.9837, 43.3175])).toBe(true); // Centro, Buen Pastor
    expect(insideZbe([-1.9845, 43.313])).toBe(true); // Amara Viejo
    expect(insideZbe([-1.9745, 43.3255])).toBe(false); // Gros, across the river
    expect(insideZbe([-1.972, 43.3175])).toBe(false); // Egia
    expect(insideZbe([-1.9735, 43.3015])).toBe(false); // Amara Berri, Anoeta
    expect([...ZBE_STOPS]).toEqual(["donostia"]);
    expect(touchesZbe({ from: "belartza", to: "pasaia" })).toBe(false);
    expect(touchesZbe({ from: "zaisa", to: "donostia" })).toBe(true);
  });

  it("keeps the places' zbe flag in step with the perimeter", () => {
    for (const p of PLACE_IDS) expect(!!PLACES[p].zbe, p).toBe(ZBE_STOPS.has(p));
  });

  it("allows the demo's B-label reefer into Donostia and flags only the unauthorised unlabelled van", () => {
    const lane = { from: "pasaia", to: "donostia" } as const;
    expect(zbeFor(lane, v("v-kf3"), NOW)?.status).toBe("free");
    expect(zbeFor(lane, v("v-ur3"), NOW)?.status).toBe("authorised");
    expect(zbeFor(lane, v("v-tx5"), NOW)?.status).toBe("banned");
    expect(zbeProblem(lane, v("v-kf3"), NOW)).toBe(false);
    expect(zbeProblem(lane, v("v-tx5"), NOW)).toBe(true);
    expect(zbeFor({ from: "pasaia", to: "irun" }, v("v-tx5"), NOW)).toBeNull();
  });

  it("asks foreign plates, which carry no DGT label, for the city's authorisation", () => {
    expect(hasDgtLabel(v("v-kf3"))).toBe(true);
    expect(hasDgtLabel(v("v-ad1"))).toBe(false);
    expect(zbeNeedsAuth({ from: "irun", to: "donostia" }, v("v-ad1"))).toBe(true);
    expect(zbeNeedsAuth({ from: "irun", to: "donostia" }, v("v-tx1"))).toBe(false);
    expect(zbeFor({ from: "irun", to: "donostia" }, v("v-br1"), NOW)?.declaration).toBe(true);
  });

  it("flags the Pays Basque ZFE on French stops only", () => {
    expect(touchesZfe({ from: "hendaye", to: "bayonne" })).toBe(true);
    expect(touchesZfe({ from: "pasaia", to: "irun" })).toBe(false);
  });

  it("says 'allowed' for a B label in all five locales", () => {
    const allowed = { en: "allowed", es: "permitida", eu: "onartuta", fr: "autorisée", ru: "допускается" };
    for (const [lang, dict] of Object.entries({ en, es, eu, fr, ru })) expect(dict.checks.zbeSoon, lang).toContain(allowed[lang as keyof typeof allowed]);
  });
});

describe("transport documents by country pair", () => {
  it("uses a DeCA inside Spain, electronic from 5-10-2026, made out by shipper and carrier", () => {
    const doc = transportDocument({ from: "pasaia", to: "irun" }, { at: NOW });
    expect(doc).toEqual({ kind: "deca", electronic: "required", issuer: "shipperAndCarrier", exemptions: [], cabotage: false });
    expect(transportDocument({ from: "pasaia", to: "irun" }, { at: DECA_MANDATORY - 1 }).electronic).toBe("optional");
  });

  it("flags the DeCA exemptions", () => {
    expect(transportDocument({ from: "pasaia", to: "irun" }, { vehicle: { mma: 2_000 } }).exemptions).toEqual(["noLicence"]);
    expect(transportDocument({ from: "pasaia", to: "irun" }, { vehicle: { mma: 2_400, electric: true } }).exemptions).toEqual(["noLicence"]);
    expect(transportDocument({ from: "pasaia", to: "irun" }, { vehicle: { mma: 3_500, electric: true } }).exemptions).toEqual([]);
    expect(transportDocument({ from: "pasaia", to: "irun" }, { removal: true, parcels: true }).exemptions).toEqual(["removal", "parcels"]);
  });

  it("uses a CMR between Spain and France, e-CMR only by agreement", () => {
    for (const lane of [
      { from: "irun", to: "bayonne" },
      { from: "bayonnePort", to: "pasaia" },
    ] as const)
      expect(transportDocument(lane, { at: NOW })).toEqual({ kind: "cmr", electronic: "byAgreement", issuer: "sender", exemptions: [], cabotage: false });
  });

  it("uses a lettre de voiture inside France, with the cabotage particulars for foreign carriers", () => {
    expect(transportDocument({ from: "hendaye", to: "bayonne" })).toMatchObject({ kind: "lettre", issuer: "carrier", electronic: "optional", cabotage: false });
    expect(transportDocument({ from: "hendaye", to: "bayonne" }, { carrierCountry: "ES" }).cabotage).toBe(true);
    expect(transportDocument({ from: "pasaia", to: "irun" }, { carrierCountry: "FR" })).toMatchObject({ kind: "deca", cabotage: true });
    expect(en.ecmr.lettre).toBe("Lettre de voiture · France");
  });

  it("never presents the e-CMR as mandatory", () => {
    const agreement = { en: "both parties agree", es: "ambas partes", eu: "bi aldeek", fr: "les deux parties", ru: "по соглашению сторон" };
    type Tree = { [k: string]: string | Tree };
    const leaves = (t: Tree): string[] => Object.values(t).flatMap((x) => (typeof x === "string" ? [x] : leaves(x)));
    for (const [lang, dict] of Object.entries({ en, es, eu, fr, ru })) {
      const withEcmr = leaves(dict as unknown as Tree).filter((s) => s.includes("e-CMR"));
      expect(withEcmr.length, lang).toBeGreaterThan(0);
      for (const s of withEcmr) expect(s, lang).toContain(agreement[lang as keyof typeof agreement]);
    }
  });
});

describe("job scope, cabotage and posting", () => {
  it("counts a Spanish carrier inside France as cabotage", () => {
    expect(isCabotage({ from: "biarritz", to: "bayonne" }, "c-txingudi")).toBe(true);
    expect(isCabotage({ from: "pasaia", to: "irun" }, "c-adour")).toBe(true);
    expect(isCabotage({ from: "biarritz", to: "bayonne" }, "c-baltic")).toBe(true);
    expect(isCabotage({ from: "irun", to: "bayonne" }, "c-txingudi")).toBe(false);
    expect(isCabotage({ from: "biarritz", to: "bayonne" }, "c-adour")).toBe(false);
  });

  it("posts drivers on cabotage and cross-trade, not on bilateral trips", () => {
    expect(needsPostingDeclaration({ from: "biarritz", to: "bayonne" }, "ES")).toBe(true);
    expect(needsPostingDeclaration({ from: "zaisa", to: "bayonne" }, "LT")).toBe(true);
    expect(isCrossTrade({ from: "zaisa", to: "bayonne" }, "LT")).toBe(true);
    expect(needsPostingDeclaration({ from: "irun", to: "bayonne" }, "ES")).toBe(false);
    expect(needsPostingDeclaration({ from: "irun", to: "bayonne" }, "FR")).toBe(false);
    expect(jobScope({ from: "pasaia", to: "irun" }, "ES")).toBe("domestic");
  });
});

describe("the market director's carrier-level cabotage count", () => {
  it("adds booked cabotage jobs to the starting figures", () => {
    const booked = { from: "biarritz", to: "bayonne", carrierId: "c-txingudi", status: "booked" } as const;
    expect(cabotageUsed("c-txingudi", [booked])).toBe(1);
    expect(cabotageUsed("c-baltic", [])).toBe(2);
    expect(cabotageUsed("c-txingudi", [{ ...booked, from: "irun" }])).toBe(0);
  });
});

describe("licences and tachographs", () => {
  const irunBayonne = { from: "irun", to: "bayonne" } as const;
  const mdl: Pick<Carrier, "country" | "licence"> = { country: "ES", licence: "MDL" };
  const community: Pick<Carrier, "country" | "licence"> = { country: "ES", licence: "community" };
  const van = (tachograph: boolean, mma = 3_500): Pick<Vehicle, "mma" | "tachograph"> => ({ mma, tachograph });

  it("keeps an MDL-only van off Irun → Bayonne", () => {
    expect(licenceProblems(mdl, van(true), irunBayonne, NOW)).toEqual(["communityLicence"]);
    expect(licenceProblems(mdl, van(true), { from: "pasaia", to: "irun" }, NOW)).toEqual([]);
  });

  it("needs a Community licence for cabotage too, and none for vehicles up to 2.5 t", () => {
    expect(licenceProblems(mdl, van(true), { from: "biarritz", to: "bayonne" }, NOW)).toEqual(["communityLicence"]);
    expect(licenceProblems(mdl, van(false, 2_400), irunBayonne, NOW)).toEqual([]);
  });

  it("requires a tachograph in light vans abroad from 1-7-2026", () => {
    expect(licenceProblems(community, van(false), irunBayonne, LIGHT_VAN_TACHOGRAPH_FROM)).toEqual(["tachograph"]);
    expect(licenceProblems(community, van(false), irunBayonne, LIGHT_VAN_TACHOGRAPH_FROM - 1)).toEqual([]);
    expect(licenceProblems(community, van(true), irunBayonne, NOW)).toEqual([]);
  });

  it("drops national-only carriers from cross-border loads, but not from domestic ones", () => {
    const job = { vehicle: "van", ...irunBayonne, pickupAt: NOW } as const;
    const ids = eligibleCarriers(job).map((c) => c.id);
    expect(ids).not.toContain("c-urumea");
    expect(ids).toEqual(expect.arrayContaining(["c-txingudi", "c-labourd"]));
    for (const c of CARRIERS.filter((x) => x.licence !== "community")) expect(ids).not.toContain(c.id);
    expect(eligibleCarriers({ vehicle: "van", from: "pasaia", to: "irun", pickupAt: NOW }).map((c) => c.id)).toContain("c-urumea");
    expect(eligibleCarriers("van").map((c) => c.id)).toContain("c-urumea");
  });

  it("gives every carrier its own country's licence", () => {
    for (const c of CARRIERS) {
      if (c.country !== "ES") expect(["MDL", "MDP"], c.id).not.toContain(c.licence);
      if (c.country !== "FR") expect(c.licence, c.id).not.toBe("LTI");
    }
    expect(licenceLocalName(CARRIER.get("c-adour")!)).toBe("Licence communautaire");
    expect(licenceLocalName(CARRIER.get("c-labourd")!)).toBe("Licence communautaire");
    expect(licenceLocalName(CARRIER.get("c-baltic")!)).toBe("Bendrijos licencija");
    expect(licenceLocalName(CARRIER.get("c-txingudi")!)).toBe("Licencia comunitaria");
  });

  it("keeps the seeded demo day legal", () => {
    for (const l of buildLoads(NOW)) {
      if (!l.vehicleId) continue;
      const veh = VEHICLE.get(l.vehicleId)!;
      expect(licenceProblems(CARRIER.get(veh.carrierId)!, veh, l, l.departedAt ?? l.pickupAt), l.id).toEqual([]);
    }
  });
});
