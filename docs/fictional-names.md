# Fictional names: what was checked

Every company, person and plate in the Zama demo is invented. Some of the names reuse real place names: Txingudi, Urumea, Kantauri, Adour, Bidasoa. This log records how the names were checked against real businesses, what was renamed, and which checks are still pending. Issue: [#13](https://github.com/sardoru/zama-freight/issues/13).

## Method and limits

- **When:** 24 October 2026.
- **How:** web search only, with at least two searches per name: the exact name in quotes, then the name with its town or trade, plus the obvious Spanish or French form (for example "Muebles Bidasoa" for "Bidasoa Mobel"). We opened a page only when a result looked like a match. Each collision was confirmed by a second, independent search.
- **What a negative result means:** "No match" means the web search found nothing, not that the name is free. The search index covers small Spanish, French and Lithuanian firms only partly, and pappers.fr and scoris.lt blocked direct fetches.

## Pending before any partner demo

These are not done:

- **Spain:** BORME and the Registro Mercantil Central (*denominaciones sociales*).
- **France:** Infogreffe and the INSEE SIRENE register.
- **Lithuania:** Registrų centras, the Juridinių asmenų registras.
- **Trademarks:** OEPM, INPI and EUIPO.

## Real names next to fictional operators

| Before | After | Why |
| --- | --- | --- |
| "Zaisa Cross-Dock", run by Bidasoa Logistika | **Irun cross-dock (Zaisa area) — fictional operator** | ZAISA is a real public company that runs the Zaisa transport centre ([TED 306451-2025](https://ted.europa.eu/es/notice/306451-2025/pdf)). |
| "Herrera Port Warehouse", run by "Herrera Terminal" | **Pasaia port warehouse (Herrera quay) — fictional**, run by **Kaiaurre Biltegiak** | The Herrera quay warehouses were awarded to Algeposa and Toro y Betolaza in 2025 ([Ports Europe](https://www.portseurope.com/pasaia-port-assigns-new-storage-to-algeposa-toro-y-betolaza/)). The invented operator no longer borrows the quay's name. |

In the UI:

- the warehouse screen says "Run by {name} (fictional operator)" in all five languages;
- detail views, bid rows, return-trip offers and the fleet header tag company names as "fictional".

## Collisions found, and renamed

| Invented name | Real business found | Renamed to |
| --- | --- | --- |
| Bidasoa Mobel (furniture shipper, Irun) | Muebles Bidasoa: the same name in Spanish, for a furniture shop on Avda. Navarra in Irun ([guide-du-paysbasque.com listing](https://www.guide-du-paysbasque.com/fr/adresses-utiles/vie-quotidienne/ameublement-decoration/irun-383/muebles-bidasoa-8681.html), [mueblesbidasoa.es](https://www.mueblesbidasoa.es)) | **Lizarzur Altzariak** (search: no match) |
| Baltic Road Cargo (Lithuanian haulier) | Baltic Roads, UAB, a road haulier in Vilnius, company code 300663429 ([scoris.lt](https://scoris.lt/en/imone/300663429), [1551.lt](https://www.1551.lt/automobiliu-transportas-paslaugos/?p=112)) | **Rūkagiris Cargo** (search: no match) |

We rejected the first replacement suggested for Baltic Road Cargo, "Šilagiris Cargo": Šilagiris, UAB is a real Lithuanian company, in real estate, company code 174382494 ([scoris.lt](https://scoris.lt/en/imone/174382494)). Lithuania has dozens of hauliers with "Baltic" in their name, so the demo avoids that word.

## Every name checked

| Name | Role in the demo | Searches | Result |
| --- | --- | --- | --- |
| Itsaso Kontserbak | shipper, Lezo | "Itsaso Kontserbak"; "Conservas Itsaso" | no match |
| Burdin Steel Coils | shipper, Pasaia | "Burdin Steel Coils"; "Burdin Steel" / "Burdin Coils" | no match |
| Urumea Paper | shipper, Hernani | "Urumea Paper" Hernani; "Papelera Urumea" | no match |
| Astigarraga Sagardo Koop. | shipper, Astigarraga | "Astigarraga Sagardo" kooperatiba; cider cooperative Astigarraga | no match |
| Côte Basque Surf | shipper, Anglet | "Côte Basque Surf" Anglet; SIREN search | no match |
| Donosti Horeca Supply | shipper, Donostia | "Donosti Horeca Supply"; "Horeca Donosti" | no match |
| Bidasoa Mobel | shipper, Irun | "Bidasoa Mobel"; "Muebles Bidasoa" Irun | **collision**, renamed (above) |
| Lizarzur Altzariak | shipper, Irun (new) | "Lizarzur" / "Lizarzur Altzariak" | no match |
| Adour Agri | shipper, Port of Bayonne | "Adour Agri" Bayonne; SIREN search | no match |
| Txingudi Pharma | shipper, Hondarribia | "Txingudi Pharma"; "Farmacia Txingudi"; "TXINGUDI" S.L. | no match |
| Lasarte Auto Parts | shipper, Lasarte-Oria | "Lasarte Auto Parts"; "Recambios Lasarte" | similar only: Lizarte S.A., rebuilt car parts, Pamplona ([Automechanika](https://automechanika.messefrankfurt.com/frankfurt/en/exhibitor-search.detail.html/lizarte-sa.html)); kept, low risk |
| Txingudi Garraioak | carrier, Irun | "Txingudi Garraioak"; "Transportes Txingudi" | no match |
| Urumea Express | carrier, Donostia | "Urumea Express"; "Transportes Urumea" | no match |
| Kantauri Frigo | carrier, Pasaia | "Kantauri Frigo"; "Kantauri" frigorífico Gipuzkoa | no match |
| Adour Transports | carrier, Bayonne | "Adour Transports" Bayonne; "Transports de l'Adour"; SIREN search | similar only: ADOUR TOURISME SAS, a coach company in Riscle, Gers ([INSEE](https://api-avis-situation-sirene.insee.fr/identification/pdf/33343024700036)); kept, low risk |
| Labourd Messagerie | carrier, Biarritz | "Labourd Messagerie"; "Messageries du Labourd" | no match |
| Baltic Road Cargo | carrier, Lithuania | "Baltic Road Cargo"; "Baltic Road" UAB; "Baltic Roads" UAB Vilnius | **collision**, renamed (above) |
| Rūkagiris Cargo | carrier, Lithuania (new) | "Rūkagiris" / "Rukagiris" | no match |
| Aiako Harria Logistika | carrier, Oiartzun | "Aiako Harria Logistika"; "Aiako Harria" S.L. | no match |
| Bidasoa Logistika | warehouse operator, Irun | "Bidasoa Logistika" Irun; "Logística Bidasoa"; "Bidasoa Logistics" | no match |
| Aiako Logistika Parkea | warehouse operator, Oiartzun | "Aiako Logistika Parkea"; "Aiako Logistika" | no match (the only logistics-park company found in Oiartzun, Lanbarren Parke Logistikoa, was dissolved in 2022) |
| Herrera Terminal | warehouse operator, Pasaia | "Herrera Terminal" Pasaia; "Terminal Herrera" Pasajes | no match, but renamed (above) |
| Kaiaurre Biltegiak | warehouse operator, Pasaia (new) | "Kaiaurre" Pasaia; "Kaiaurre Biltegiak" | no match |
| Kantauri Hotza | warehouse operator, Lezo | "Kantauri Hotza"; "Frío Cantábrico" Lezo | no match |
| Donostia Hiri Logistika | warehouse operator, Donostia | "Donostia Hiri Logistika"; "Hiri Logistika" Donostia | similar only: Servicios Logísticos de Donosti SL ([eInforma](https://www.einforma.com/informacion-empresa/servicios-logisticos-donosti)); kept, low risk |
| Entrepôts de l'Adour | warehouse operator, Bayonne | "Entrepôts de l'Adour" Bayonne; SIREN search | no match |
| Ugaldetxo DC, Lezo Cold Store, Belartza Urban Hub, Adour Depot | warehouse names | each name in quotes with its town | no match |

## Plates

Every plate now starts with **DEMO-**:

- `DEMO-4821` for Spanish vehicles;
- `DEMO-F-482` for French ones;
- `DEMO-LT-418` for Lithuanian ones.

No registration system issues this format. Spain uses `1234 BCD`, France `AB-123-CD` and Lithuania `ABC 123`, so a demo plate can't match a real vehicle. The old plates were valid formats.

## People

Driver names are invented combinations of common Basque, French, Lithuanian and Russian first names and surnames. They were not checked against individuals. Each driver belongs to an invented carrier, and no screen shows anything about a driver beyond a name and languages.
