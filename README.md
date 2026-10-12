# Rail World

Monde ferroviaire animé en low-poly, simulé et visualisé dans le navigateur.
TypeScript + Three.js + Vite. Tout est procédural (aucun modèle 3D externe).

## Prérequis

- Node.js 20 ou plus récent
- Un navigateur avec WebGL (Firefox, Chromium...)

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
```

Le serveur écoute sur le réseau local : depuis un autre appareil, ouvre
`http://IP-DE-LA-MACHINE:5173`.

## Mondes : graine

- `http://localhost:5173/` : le monde d'origine (`src/layout.json`, écrit à la main).
- `http://localhost:5173/?seed=42&biome=neige` : thème du monde imposé (`tempéré`, `désert`, `neige`, `automne`, `tropical`) ; `?biome=désert+neige` mélange deux biomes (frontière floue au milieu du monde) ; sans `biome`, ils sont tirés de la graine (un monde sur deux en mélange deux ; le monde d'origine reste tempéré).
- `http://localhost:5173/?seed=42` : **monde généré à partir de la graine 42** (ligne en boucle, gares, dépôt, relief, rivière, villes, villages, routes). Même graine = même monde. Le panneau « Monde (graine) » permet de saisir une graine, d'en tirer une au hasard ou de revenir au monde d'origine.
- `npx vite-node scripts/worldgen-report.ts 1 2 3` : rapport de génération (longueur, ouvrages d'art, courbes). `npx vite-node scripts/worldgen-full.ts 1 2 3` : monde complet (routes, passages à niveau, 5 min de circulation).

## Commandes

| Commande          | Effet                                                  |
|-------------------|--------------------------------------------------------|
| `npm run dev`     | Serveur de développement (rechargement à chaud)        |
| `npm test`        | Tests de la simulation (vitest, plusieurs heures simulées) |
| `npm run build`   | Vérification des types + build de production (`dist/`) |
| `npm run preview` | Sert le build de production                            |

## Utilisation

- **Caméras** : touches `1` à `7` ou menu (orbite, cabine, passager, bord de voie, aérienne, poursuite, voiture). En cabine, un tableau de bord affiche vitesse, limite, prochain signal et pente.
- **Train suivi** : menu, touches `[` et `]` (trains en circulation), ou clic sur un point de la mini-carte.
- **Orbite** : souris pour tourner, molette pour zoomer ; case « Orbite : suivre le train » pour garder la caméra libre ou la faire accompagner le train.
- **Touche `H`** : masque toute l'interface (menu, mini-carte, bandeau) pour regarder en plein écran.
- **Touche `T`** : télé d'ambiance. Un réalisateur automatique choisit le train et la caméra selon l'action (sortie du dépôt, arrêt en gare, grande vitesse), avec fondus et légendes. Sans interface ; `T` pour revenir.
- **Touche `J`** : devenir un habitant (vue à pied, 1,70 m) ; **`K`** : suivre un habitant pendant une journée ; **`G`** : mode photo (viseur, molette = zoom, **`X`** déclenche, **`L`** album). Voir « Cinquième vague » plus bas.
- **Touche `M`** : multi-vues. Jusqu'à 3 incrustations en bas à droite, chacune avec sa vue et son train (réglages dans *Immersion*).
- **Son** : case « Son » du dossier *Immersion* (roulement des trains proches de la caméra, klaxon au départ de gare).
- **Routier** : dossier « Routier » du menu. Nombre de voitures, bus et camions (consigne : ils apparaissent loin de la caméra et disparaissent hors de sa vue), compteurs (véhicules, à l'arrêt, passages à niveau fermés). La vue `7` suit un véhicule : *poursuite* (derrière) ou *conducteur* (place du conducteur) ; `.` et `,` changent de véhicule, le bouton « Suivre le véhicule le plus proche » choisit celui qui est près de la caméra. Au-delà de x5, la circulation reste à x5 (les passages à niveau, eux, suivent le temps des trains).
- **Aller à** : menu qui place la caméra d'orbite devant un tunnel, un viaduc, une ville, un village, le dépôt ou la rivière.
- **Environnement** : heure de la journée, cycle jour/nuit automatique (24 h en 20 min réelles), ombres (à désactiver si la machine rame).
- **Circuits** : un dossier par circuit dans le menu.
  - *Rames en service* : sort une rame du dépôt (ou en rappelle une) ; une action toutes les 25 s au maximum.
  - *Caisses* : composition des prochaines rames qui sortent du dépôt.
  - *Arrêt <gare>* : un circuit s'arrête ou non, gare par gare. Un train sans arrêt prend la voie directe.
  - *Circulent / Au dépôt* : état du parc.
- **Signaux** : rouge (canton suivant occupé ou réservé), jaune (le suivant est occupé), vert (voie libre).

## Configurer le réseau : `src/layout.json`

| Champ            | Rôle                                                              |
|------------------|-------------------------------------------------------------------|
| `centerline`     | Points (x, z en mètres) de l'axe de la ligne, boucle fermée       |
| `trackSpacing`   | Écart entre les deux voies (m)                                    |
| `platformOffset` | Écart entre voies directe / quai / voies de garage (m)            |
| `blockLength`    | Longueur approximative d'un canton (m)                            |
| `stations`       | Nom et position (`at`, de 0 à 1 le long de la ligne)              |
| `depots`         | `name`, `at` (position), `tracks` (nombre de voies de garage), `on` (`["A","B"]` : voies desservies) |
| `circuits`       | `id`, `name`, `track` (A ou B), `type`, `fleet` (parc), `service` (rames en service au départ), `cars` (caisses), `stops` (arrêt par gare), `via` (cordes empruntées, ex. `["C"]`) |
| `branches`       | Antennes à voie unique : `id`, `name`, `from` (point de la boucle, 0-1), `side` (`"A"` intérieur / `"B"` extérieur), `stem` (m, défaut 210), `via` (tracé après le début de la voie unique : le premier point doit prolonger la direction de départ), `loops` (gares à évitement : `name`, `at` de 0 à 1 le long de l'antenne), `terminus` (nom ; la rame y fait demi-tour). Ajouter la ville dans `urban` et un circuit avec `via: ["D"]` |
| `chords`         | Lignes secondaires à double voie : `id`, `name`, `from` / `to` (points de la boucle, 0-1), `via` (points [x, z] du tracé, du côté de `from` vers `to`), `stations` (gares de la corde : `name`, `at` de 0 à 1 le long de la corde ; prévoir sa ville dans `urban`). La corde se détache à ~35° de la boucle, s'en sépare sans la couper dans un sens, la traverse à plat dans l'autre |
| `terrain`        | `seed`, `amplitude` (m), `scale` (m, taille des collines), `maxGrade` (pente max de la voie, 0.02 = 2 %), `smooth` (m, lissage du profil de la voie, 250 par défaut : plus grand = plus de tunnels et de ponts), `features` (voir ci-dessous) |
| `urban`          | Villes : `station` + `radius` (m) ; sol dégagé du dépôt : `depot` + `radius` ; ville ou village libre : `at: [x, z]`, `name`, `radius`, `village: true` |
| `rivers`         | `name`, `width` (m), `points` : suite de points [x, z] qui donne le cours (courbe lissée) ; le lit est creusé dans le relief |

**Crêtes et vallées** (`terrain.features`) : `{ "a": [x,z], "b": [x,z], "width": m, "height": m }` ajoute une bosse (height > 0) ou un creux (height < 0) le long du segment a-b. Une crête que la voie traverse donne un tunnel, une vallée un viaduc.

**Tunnels et ponts** : aucun réglage à faire. La voie suit un profil lissé qui ne colle pas au relief ; là où le sol est au moins 7 m au-dessus de la voie (cœur à 12 m) c'est un tunnel, là où il est au moins 3 m en dessous (cœur à 6 m) c'est un pont ou un viaduc, et toute traversée de rivière est un pont. Jamais dans une gare, un dépôt ni dans la ville qui l'entoure. `npx vite-node scripts/layout-report.ts` liste ce que donne un layout (tunnels, ponts, zones, rivières, pente max).

Types de matériel : `omnibus` (30 m/s, caisses de 18 m), `rapide` (36 m/s, 20 m), `fret` (22 m/s, locomotive + wagons de 14 m, ne s'arrête jamais en gare).
Une rame fait au plus ~150 m (7 caisses de voyageurs, 10 de fret).

Règles à respecter : au moins ~0,15 d'écart (en fraction de la ligne) entre deux zones (gare ou dépôt) ; assez de voies de garage dans le dépôt pour le parc au repos de tous les circuits d'une même voie ; pas plus de 3 à 4 rames en service par voie, sinon elle sature.
La simulation signale une erreur claire si l'une de ces règles n'est pas respectée.

## Structure

```
src/
  layout.json      Description du réseau, des dépôts et des circuits
  sim/             Simulation pure (aucune dépendance à Three.js), pas fixe 1/60 s
    network.ts     Graphe (nœuds, arêtes = cantons), générateur de double voie, gares, dépôts
    world.ts       Circuits, trains, répartiteur dépôt, réservation des cantons, signaux, pentes
    terrain.ts     Relief (bruit, crêtes, vallées), rivières, terrassement autour des voies, zones ville / village / dépôt
    worldgen.ts    Génération procédurale d'un monde complet à partir d'une graine (produit un layout), contrôles de validité
    worldgen.test.ts Déterminisme, 40 graines valides, mondes complets (routes, trafic, trains)
    cityplan.ts    Plan des rues d'une ville (pur, sans Three.js : sert au rendu et au réseau routier)
    planning.ts    Décisions avant construction : plans des villes, lac, fonctions de distance
    roads.ts       Réseau routier : graphe (rues + routes de campagne), passages à niveau, ponts routiers, voies à droite
    pois.ts        Placement des points d'intérêt (aérodrome, château sur une hauteur, phare et port près du lac, ruine, moulin)
    weather.ts     Météo : clair, nuageux, pluie, brouillard, orage ; transitions lissées, éclairs et tonnerre
    fauna.ts       Faune : troupeaux qui broutent, nuées, avion sur une grande boucle, montgolfière, bateaux sur les rivières, voiliers sur le lac
    sport.ts       Plan sport : complexe, chemins, site de parapente, parcours d'aviron, horaires
    athlete.ts     Moteur d'actions des sportifs (aller, attendre, piste, ligne, saut, lancer)
    athletics.ts   Programme d'athlétisme par jour et scripts des ateliers
    outdoor.ts     Joggeurs, cyclistes, cavaliers, rameurs : suivi de rues et de chemins, groupes, apparitions
    games.ts       Tennis, foot à 5, basket 3x3
    glider.ts      Parapentes
    sport.test.ts  Piste, plan, séances, plein air, matchs, vol
    streetlife.ts  Vie de quartier : voyageurs aux arrêts de bus, livreurs, ouvriers du dépôt
    traffic.ts     Circulation : véhicules (IDM), carrefours à exclusion mutuelle, feux, passages à niveau fermés par les trains
    roads.test.ts  Réseau connexe, passages à niveau, ponts, 10 min de circulation sans blocage ni véhicule sous un train
    world.test.ts  Aucune collision, aucun blocage, dépôt, arrêts par gare, rapide, relief, tunnels, ponts, rivières
  geom.ts          Générateur de maillages low-poly (murs, toits, boîtes)
  rigs.ts          Caméras attachées aux trains (cabine, passager, bord de voie, aérienne, poursuite, drone, téléobjectif, passage rasant)
  shots.ts         Plans libres du réalisateur (orbite / grue, plan fixe)
  director.ts      Réalisateur de la télé d'ambiance : plans de trains, d'événements, de lieux, de faune
  biome.ts         Biomes (tempéré, désert, neige, automne, tropical) : couleurs, végétation, ciel, eau, précipitations
  precip.ts        Neige et feuilles mortes autour de la caméra, selon le biome du lieu
  weatherview.ts   Rendu de la météo : nuages qui dérivent, pluie, éclairs, assombrissement du ciel
  poi.ts           Modèles des points d'intérêt (château, phare, ruine, moulin à vent aux ailes tournantes)
  faunaview.ts     Rendu de la faune (vaches, moutons, oiseaux, bateaux, voiliers, avion, montgolfière)
  tiltshift.ts     Mode maquette : rendu dans une texture + flou en deux passes + saturation
  audio.ts         Sons procéduraux (Web Audio)
  env.ts           Cycle jour/nuit, textures de fenêtres, matériaux lumineux
  scenery.ts       Terrain en tuiles, forêts par taches, rochers, lac ; assemble les villes et la campagne
  city.ts          Plan des rues (avenues, boulevards, rues de quartier, parcs) et bâtiments par quartier ; test dans city.test.ts
  rural.ts         Champs en parcelles, haies, fermes
  structures.ts    Ponts et viaducs (tablier, piles, culées), tunnels (voûte, têtes en béton, lampes), eau des rivières
  chunks.ts        Regroupement des maillages par cellule (la caméra n'affiche que ceux qui sont dans son champ)
  roadview.ts      Routes de campagne, ponts routiers, passages à niveau (barrières, feux clignotants), feux tricolores, véhicules instanciés
  infra.ts         Voies, caténaires, quais, gares, halles de dépôt, entrepôts, signaux
  trains.ts        Rames détaillées (nez, vitres, bogies, pantographe, fret)
  athleteview.ts   Sportifs articulés (poses, lampe frontale), accessoires (javelot, disque, balles)
  complexview.ts   Stade, courts, tribunes, projecteurs
  trailview.ts     Sentiers et allées
  mountview.ts     Vélos, chevaux, bateaux d'aviron, ailes de parapente
  main.ts          Assemblage, caméras, mini-carte, interface
scripts/worldgen-report.ts Génération : rapport pour des graines
scripts/worldgen-full.ts   Génération : monde complet pour des graines (routes, trafic)
scripts/layout-report.ts   Rapport d'un layout (tunnels, ponts, zones, rivières)
scripts/roads-report.ts    Rapport du réseau routier (liaisons, kilomètres, passages à niveau, carrefours à feux)
scripts/traffic-soak.ts    Essai de longue durée de la circulation (3 x 30 min, comptes de blocages et de véhicules sur un passage)
ARCHITECTURE.md    Décisions et état d'avancement
TODO.md            Idées et feuille de route détaillée
```

Principe : la simulation ne connaît pas le rendu. Le rendu lit l'état de la
simulation et ne la modifie jamais (sauf les consignes de circuit, via l'interface).

## Héberger sur un Raspberry Pi (plus tard)

```bash
npm run build
npx vite preview --host --port 8080   # ou tout serveur statique sur dist/
```

La feuille de route complète est dans `TODO.md`.

## Ligne libre (navette) et vie de la ville
- Une **ligne principale ouverte** indépendante de la boucle (aller-retour, deux terminus à rebroussement, un évitement) apparaît dans ~10 % des mondes générés (`BranchDef.origin` sans `from`). Circuit `X1` sans dépôt (`depotless`).
- **Piétons** (`src/sim/pedestrians.ts`, rendu `src/people.ts`) : marcheurs sur les trottoirs des rues, nombre selon l'heure (`activity`). La densité des voitures/bus/camions suit aussi l'heure (case « Densité selon l'heure » du panneau Routes).
- **Voyageurs** (`src/sim/passengers.ts`) : attente sur les quais (plus nombreux avant l'arrivée d'une rame et aux heures de pointe), descente à l'arrêt puis montée avant le départ.
- **Arrêts de bus** (`Traffic.busStops`, `src/busstops.ts`) : abribus + poteau sur certaines rues principales ; les bus s'y arrêtent 8 à 14 s.

## Villes traversées par la voie, bus
- Une ville n'est plus coupée par la voie ferrée : `planCity` trace 2-3 **rues de franchissement** perpendiculaires à la voie. Sur l'emprise d'une gare, c'est un **pont-route** (plateau à 7,6 m au-dessus des rails, rampes à 8,5 %, parapets) ; ailleurs, un passage à niveau. Elles sont reliées entre elles par des rues de rive (boucles), pour que la circulation passe réellement d'un côté à l'autre.
- **Bus** : touche **B** (ou bouton « Suivre un bus » en haut du panneau) = caméra de poursuite sur un bus ; les bus sont des points orange sur la mini-carte ; `.` / `,` passent au bus suivant/précédent ; le HUD indique « à l'arrêt de bus ».

## Ambiance : biomes, faune, points d'intérêt, réalisateur, maquette
- **Biomes** (`src/biome.ts`) : tempéré, désert (cactus), neige (flocons), automne (feuilles mortes), tropical (palmiers). Ils changent le sol, la végétation, les champs, le ciel, le brouillard et l'eau. `?biome=` impose le thème.
- **Points d'intérêt** (`sim/pois.ts`, `poi.ts`) : un château sur une hauteur, un phare près du lac (faisceau tournant la nuit), une ruine, des moulins à vent. Carrés colorés sur la mini-carte, présents dans le menu « Aller à ».
- **Faune** (`sim/fauna.ts`, `faunaview.ts`) : vaches et moutons qui broutent, oiseaux, bateaux sur les rivières (demi-tour aux extrémités), voiliers sur le lac, petit avion avec feux de position la nuit, montgolfière.
- **Vie de quartier** (`sim/streetlife.ts`) : voyageurs qui attendent aux arrêts de bus et montent, camions de livraison arrêtés en double file avec un livreur à pied, ouvriers qui font leur ronde au dépôt.
- **Réalisateur** (touche T) : à chaque coupe, il note les plans possibles (un par train, plus les événements — passage à niveau fermé, croisement de deux trains —, les villes vues du ciel, les points d'intérêt, la faune, le ciel) selon l'heure (coucher de soleil, nuit), la nouveauté et le hasard. Un événement important peut interrompre un plan ordinaire (50 s minimum entre deux événements). Nouvelles caméras de train : **drone** (orbite), **lointain** (téléobjectif), **passage** (grand angle au ras du rail). Les touches 1 à 0 choisissent : orbite, cabine, passager, bord de voie, aérienne, poursuite, voiture, drone, lointain, passage.
- **Mode maquette** (touche **P**, réglages dans « Immersion ») : effet tilt-shift (bande nette réglable, flou, saturation, contraste, vignette). Plus joli en orbite haute avec un champ étroit.

## Deuxième vague d'ambiance : monde varié, météo, faune réactive, aérodrome, port
- **Biomes mélangés** (`BiomeMap`) : deux biomes séparés par une frontière floue (droite orientée par la graine, déformée par du bruit). Le sol, les arbres (cactus, palmiers, conifères, feuillus), les champs, les haies et les précipitations suivent le biome du lieu ; le ciel est un mélange des deux.
- **Météo** (`sim/weather.ts`, `weatherview.ts`) : clair, nuageux, pluie, brouillard, orage. Le temps change toutes les 1,5 à 4 minutes (plus sec dans le désert, plus humide sous les tropiques), les niveaux se lissent. Effets : nuages qui dérivent, pluie (neige dans les biomes de neige), ciel gris, brouillard, éclairs, bruit de pluie et tonnerre (option « Son »), circulation plus lente. Réglage : « Immersion → Météo » (auto ou temps imposé) ; le temps actuel est dans la ligne d'état.
- **Faune réactive** : les troupeaux s'éloignent d'un train qui passe à moins de 150 m ; des oiseaux posés près de la voie s'envolent à l'approche d'une rame.
- **Aérodrome** : piste aplanie dans le relief, hangar, manche à air. Le petit avion tourne en circuit, atterrit, roule, reste 40 s au sol, décolle (un tour sur trois), puis repart. Sans aérodrome, il garde sa grande boucle.
- **Port** : au bord du lac quand il y a une rive basse : quai dans l'eau, terre-plein, conteneurs, deux portiques.
- **Réalisateur, 2e passe** : nouvelle caméra **quai** (la rame arrive, freine et s'arrête devant la caméra), survol du dépôt, plans « dans les rues » avec un bus, événements : troupeau qui fuit, envol d'oiseaux, atterrissage / décollage, orage sur la ville. Il tient compte de la météo (pas de téléobjectif dans le brouillard, plus de plans dramatiques par orage). **Rythme des plans** réglable dans « Immersion ». Les catégories délaissées gagnent des points : tout le monde finit par passer à l'écran.
- `scripts/pois-report.ts` : quels points d'intérêt sont placés pour chaque graine.

## Troisième vague : eau, ports, navires, avions, vie quotidienne
- **Mer** : une côte ondulante (plage, fond qui descend) sur un bord du monde, choisie là où il y a le plus de terre libre ; `?mer=0` la désactive. Rivières plus larges (×1,6), **jusqu'à 3 lacs**, un **affluent** qui rejoint la rivière (`?affluent=0` pour le retirer).
- **Ports animés** (mer et lac) : navires en circuit (cargo, ferry, pétrolier, péniche, voilier, pêcheur) qui accostent, déchargent et repartent ; portiques et grues qui travaillent, cargaison qui change.
- **Avions** : circuit d'aérodrome (décollage, tour de piste, atterrissage), biplan en passage bas, hydravion sur la côte, avion de ligne en altitude avec traînée.
- **Réalisateur** : nouvelles catégories de plans « eau » (embarqué sur un navire, quai, grue) et « aviation » (décollage, atterrissage, passage).
- **Vie quotidienne (premier jet)** : marché le matin (étals, chalands) dans les parcs des villes, terrasses de café (clients assis, hors pluie), écoliers à l'arrivée (8 h) et à la sortie (16 h 30). Données dans `window.rw.daily`.
- Scripts : `scripts/water-report.ts`, `scripts/boats-report.ts` (rapports par graine).
- **Suivi caméra navires et avions** : touche **N** (navire le plus proche, puis suivant), **V** (avion), `.` / `,` pour changer de sujet, **E** pour alterner poursuite / embarqué (pont du navire, cockpit) ; menu « Mer et ciel ».
- **Rivière** : le lit est désormais creusé en dernier (ni remblai ni butte de tunnel ne la recouvrent) ; vérification : `scripts/river-check.ts`.

## Quatrième vague : drone FPV, nuit sur l'eau, vie quotidienne complétée
- **Drone FPV (touche F)** : pose un drone au sol là où l'on regarde et passe en vue embarquée (vue n° 13 « fpv »). Physique de quadricoptère en **acro** (les manches commandent des vitesses de rotation, profil de taux type Betaflight, poussée selon l'orientation, traînée, inertie des moteurs), 3 drones : *Racer 5″*, *Whoop (Orqa)*, *Cinéwhoop*. Mode *stabilisé* (angle) pour débuter, caméra inclinable, affichage tête haute (horizon, vitesse, altitude, batterie, gaz), son de moteurs (avec l'option Son), choc violent ou eau = drone brisé, retour au point de départ.
  - **Manette** : Gamepad API du navigateur (Logitech F310 en mode XInput « X », manette Xbox, radio USB). Mode 2 par défaut : manche gauche = gaz + lacet, manche droit = tangage + roulis. Les axes se réassignent/inversent dans le menu *Drone FPV → Manette : axes* (réglages mémorisés). Boutons : A armer, B repartir, X changer de drone, Y acro/stabilisé, croix haut/bas inclinaison de caméra, START vue de poursuite. Gaz « centré » (manche au repos = vol stationnaire, adapté aux manettes à ressort) ou « direct » (radio).
  - **Clavier de secours** : flèches = tangage/roulis, W/S = gaz, A/D = lacet, Espace = armer, R = repartir, X = mode, C = poursuite, Q/E = inclinaison.
  - Le navigateur n'expose les manettes qu'en **HTTPS ou sur `localhost`** : en `http://adresse-IP`, la manette ne sera pas vue (utiliser `localhost` ou une publication HTTPS).
  - Limites : pas de collision avec les arbres et bâtiments (seulement le relief et l'eau).
- **Nuit sur l'eau** : feux de navigation (rouge à bâbord, vert à tribord, mâts blancs), fenêtres des navires, lampes et balises clignotantes des ports, feux rouges des portiques, flaques de lumière sur les quais, traînées de reflets sur l'eau.
- **Vie quotidienne** : clients assis sur leur chaise (en soirée aussi, avec parasols éclairés), enfants plus petits, passages piétons sur les carrefours (piétons qui traversent et attendent les véhicules), enseignes (café, marché, école), portail d'école.
- **Rivières** : relief en vallée évasée (pentes ≤ 30 %) autour des rivières, le remblai des voies ne recouvre plus le lit ; vérification : `scripts/river-diag.ts`.

## Cinquième vague : ciel, habitant, safari photo (itération 8)
- **Ciel** (`sim/sky.ts`, `skyview.ts`) : étoiles qui tournent autour d'un axe incliné et Voie lactée, vrai soleil visible, **lune** avec ses phases (lunaison de 14,6 jours du monde, éclairée par le soleil, mers et cratères, lumière cendrée), Vénus, Mars et Jupiter, **éclipses de soleil** (couronne, jour qui s'assombrit, étoiles qui apparaissent) et **de lune** (rousse), **comète** (queue opposée au soleil, visible quelques nuits tous les 23 jours), **aurores boréales** (une nuit sur quatre), **étoiles filantes** (pluies de météores certaines nuits), **arc-en-ciel** après la pluie quand le soleil est bas. La lune éclaire un peu les nuits. **Marées** : ±0,8 m, deux par jour lunaire, vives-eaux à la pleine et à la nouvelle lune ; la mer et les navires de mer montent et descendent. Tout est déterministe (graine + jour + heure). Dossier « Ciel » du menu : sauter à la prochaine éclipse, aurore, comète, pluie d'étoiles, pleine lune.
- **Habitant** (`sim/habitant.ts`, `habitantctl.ts`) : touche **J**. Marche à 1,70 m (ZQSD / WASD ou flèches, Maj pour courir, souris : clic puis déplacer, **C** : caméra par-dessus l'épaule). Les rues sont les trottoirs et places ; dans les villes on ne sort pas du réseau de rues (pas de collision fine avec les bâtiments), l'eau est interdite, les quais de gare sont marchables à leur hauteur. **E** : monter dans le tram, le bus ou le train dont les portes sont ouvertes à portée ; à bord on marche dans la voiture, le prochain arrêt est annoncé, **E** demande l'arrêt, puis **E** descend à l'arrêt (le quai de la gare, le trottoir du tram ou du bus).
- **Une journée d'habitant** : touche **K** (ou menu « Habitant »). Un habitant part de chez lui (7 h 10), marche jusqu'à un arrêt (tram de préférence, sinon train, sinon bus), attend, monte, descend un peu plus loin, rejoint son travail ; l'horloge saute avec un fondu (midi, fin de journée), puis il reprend le même moyen de transport pour rentrer et finir sa soirée. Visible aussi depuis les autres vues (un piéton de plus parmi les autres).
- **Safari photo** (`sim/safari.ts`, `safariview.ts`) : touche **G** (viseur avec règle des tiers, molette = zoom), **X** photographie, **L** album. Chaque cliché est noté sur 100 : **composition** (placement sur un point fort, taille du sujet), **lumière** (heure dorée, heure bleue, nuit pour les astres, brume, orage) et **rareté** (bus 0,08, tram, train, avion, bateau, animaux, puis ciel : lune, éclipse, aurore, comète, étoile filante…). Trois **missions** par jour du monde (sujet + lumière ou météo), plus une mission spéciale quand le ciel offre un phénomène ce jour-là. Points, rangs et album (18 dernières photos, `localStorage`) conservés par graine. Fonctionne dans toutes les vues, y compris le drone FPV (disponible en local seulement).
- **Réalisateur** : plans du ciel (éclipses, aurore, comète, arc-en-ciel, étoiles filantes sont des événements qui interrompent le plan en cours ; pleine lune, lever et coucher de soleil, ciel étoilé en ambiance). Dosage : trains et trams dominent, bateaux et avions au second plan, bus rarement ; entrée en gare (avant l'arrêt et après, jusqu'à la fin de l'arrêt), passages à niveau, ponts et tunnels filmés en entier.

## Sixième vague : le sport (itération 9)
- **Stade et complexe sportif** (près de la plus grande ville, sur un terrain aplani) : piste de 400 m (8 couloirs, normes : lignes droites de 84,39 m, rayon 36,8 m), tribunes couvertes, quatre mâts de projecteurs, aire de saut en longueur, perche (tapis, barre), hauteur (tapis, barre), cercles de lancer (poids, disque), couloir de javelot, haies ; à côté **deux courts de tennis**, un terrain de **foot à 5** (buts) et un terrain de **basket 3x3** (paniers), un portique d'entrée et un club-house.
- **Entraînements d'athlétisme** (`sim/athletics.ts`), qui varient selon le jour et ne se tiennent jamais la nuit : lundi vitesse (sprint, haies), mardi sauts (longueur, perche, hauteur), mercredi école d'athlétisme (enfants), jeudi demi-fond et javelot (fractionné sur la piste), vendredi lancers (poids, disque, javelot), samedi compétition du club (8 couloirs, public dans les tribunes), dimanche repos. Séances en fin d'après-midi (14 h 25 à 19 h 25 selon le jour), annulées sous la pluie ou l'orage ; **projecteurs** allumés dès le crépuscule. Les sportifs s'échauffent, se mettent en place, démarrent ensemble, sautent les haies, courent, sautent, lancent (javelot, disque, poids en vol libre) ; des entraîneurs en gilet orange passent d'une épreuve à l'autre.
- **Joggeurs** : matin, midi, grosse pointe en fin d'après-midi, quelques-uns le reste du temps (pas sous l'orage). Sur les trottoirs des villes et sur les sentiers ; seuls ou en petits groupes ; **lampe frontale** (bloc lumineux et faisceau) dès que la nuit tombe ou dans le brouillard épais.
- **Cyclistes** : sur le bord de la chaussée des villes (heures de pointe en semaine), **pelotons** de 3 à 8 sur les routes de campagne (week-end surtout), **VTT** sur les sentiers ; vitesse qui s'adapte à la pente.
- **Cavaliers** (1 à 3 chevaux de front, pas, trot ou galop selon la vitesse) sur les sentiers et allées de parc, le matin et en fin de journée.
- **Aviron** : skiffs, deux de couple et quatre de pointe avec leurs avirons animés, sur les tronçons larges des rivières et en ovale sur les lacs, à l'aube, en fin de journée et le week-end.
- **Tennis, foot à 5, basket 3x3** : les joueurs entrent par le portail, jouent (échanges avec rebond de la balle, conduite de balle, passes, tirs, buts, pressing), puis repartent. Tennis la journée, foot et basket le soir et le week-end ; terrains éclairés.
- **Parapente** : décollage en courant face à la pente depuis une colline, spirale ascendante, transit plané, spirale de descente, approche et atterrissage sur une prairie (jusqu'à 3 voiles ; de 10 h à 17 h 30, temps calme).
- **Chemins hors des routes** : boucles de sentier près des villes avec leur accès, allées de parc, allée du stade (`trailview.ts`).
- **Safari** : nouveaux sujets (joggeur, joggeur à la frontale — plus rare —, cycliste, peloton, aviron, parapente, cavalier, tennis, foot, basket, séance d'athlétisme, saut, lancer) et missions associées. **Réalisateur** : famille « sport » (≈7 % du temps d'écran) : stade pendant une séance (surtout sous les projecteurs), saut ou lancer, peloton, bateau d'aviron, parapente, cavaliers, joggeur à la frontale, match.
- **Planeur** (`sim/sailplane.ts`) : de 10 h à 17 h 30 par temps calme. Un avion remorqueur et un planeur partent de la piste de l'aérodrome (ou d'une prairie s'il n'y en a pas), le câble est dessiné ; après le largage, le planeur tourne en spirale dans des **ascendances** (jusqu'à 1 500 m au-dessus du sol), plane de l'une à l'autre, puis revient, perd son altitude en spirale, fait son approche et se pose sur la piste ; l'avion rentre se poser de son côté. Bouton « 🛩 Planeur » (il en fait voler un tout de suite si besoin).
- **Suivi des sportifs** : les boutons « Sport (aller voir) » ouvrent une vraie vue de suivi (comme tram / bus / navire) : poursuite ou **embarqué** (touche E), `.` / `,` pour le suivant du même type ; la caméra ne retourne plus au train.
- Console : `rw.athletics`, `rw.games`, `rw.outdoors`, `rw.gliders`, `rw.sailplanes`, `rw.complex`, `rw.trails`.

## Publier gratuitement (en ligne)
Le jeu est un site statique : aucun serveur n'est nécessaire. Chaque visiteur fait tourner sa propre simulation (`?seed=N` pour un même monde ; le réalisateur choisit ses plans au hasard, donc deux visiteurs ne voient pas les mêmes plans). Le fichier `.github/workflows/pages.yml` publie le site sur **GitHub Pages** à chaque envoi sur `main` (réglage unique : Settings → Pages → Source « GitHub Actions »). Cloudflare Pages ou Netlify fonctionnent aussi (commande `npm run build`, dossier `dist`).

- Rivières : ponts en arc sans pile dans le chenal, péniches sous les ponts, rivière du monde par défaut hors des villes. Les mondes générés (graines) ont changé : nouvelles règles de validité.
- Villes toujours d'un seul tenant, ronds-points à sens unique, tramway (petites rames seules : navettes et boucles à plusieurs rames dans les grandes villes, arrêts avec abri, priorité aux carrefours), ponts routiers en arche.

- Itération 7 : FPV dans les tunnels (plafond, choc contre la paroi), tram prioritaire, arrêts de tram, boucles à plusieurs rames.
- Itération 7b : quais de tram sur le trottoir, boucles de 700 m à 1,5 km avec jusqu'à 7 rames, caméra de tram (touche Y) et plans du réalisateur, passages à niveau en biais, feuilles d'automne éteintes en altitude.

## Itération 10
- Jambes de coureur/cycliste corrigées (pose réinitialisée à chaque appel) ; peloton fluide (suivi interpolé le long de la trace du chef).
- Cavaliers : répartition d'allures (pas 15 %, trot 30 %, petit galop 20 %, galop 35 %, selon tirage) ; aviron : poignées de rames à hauteur des mains ; parapente recentré sous la voile.
- Planeurs : remorquage ou treuillage, thermiques partagés (plusieurs planeurs dans la même ascendance).
- Bus : itinéraire fixe, prochain arrêt gardé jusqu'à atteinte ; mode habitant : manette (stick gauche déplacement, stick droit regard, RT/L3 courir, A interagir, Y caméra).
- Jouer (menu « Jouer ») : course, vélo, cheval, aviron, planeur, avion, parapente. Clavier : flèches/WASD, Maj, Ctrl, Espace, C (caméra), R, Échap ; manette équivalente.
- Routes : disques de raccord aux jonctions ; réparation des impasses dans cityplan.
- Itération 10b : drone — sens du lacet corrigé (test de non-régression « sens des manches ») ; planeur/parapente — cylindres rouges de thermiques (menu « Jouer » ou touche V), instruments embarqués en vue cockpit (C) : horizon artificiel, échelle de tangage, variomètre et alerte « THERMIQUE ».
