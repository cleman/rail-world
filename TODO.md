# Rail World — à faire

Fichier mis à jour à chaque avancement. `[x]` = fait, `[ ]` = à faire.

## Fait
- [x] 4e vague : drone FPV acro (manette/clavier), nuit sur l'eau, vie quotidienne (assis, enfants, passages piétons, enseignes), vallées de rivières, publication gratuite (GitHub Pages)
- [x] 3e vague : mer et plage, lacs multiples, rivières larges + affluent, ports animés (grues, cargaisons), navires, hydravion/biplan/avion de ligne, plans « eau » et « aviation » du réalisateur, vie quotidienne (marché, terrasses, écoliers)
- [x] Biomes mélangés dans un même monde, météo (pluie, brouillard, orage, neige), faune qui réagit aux trains, oiseaux posés, aérodrome avec atterrissages, port avec portiques, réalisateur 2e passe (quai, dépôt, bus, événements de faune, orage, rythme)
- [x] Biomes (tempéré, désert, neige, automne, tropical), points d'intérêt (château, phare, ruine, moulin), faune (troupeaux, oiseaux, bateaux, avion, montgolfière), mode maquette (tilt-shift)
- [x] Vie de quartier : voyageurs aux arrêts de bus, livraisons en double file, ouvriers du dépôt
- [x] Graphe de voies, aiguillages, cantons, signaux (rouge/jaune/vert)
- [x] Plusieurs trains, mini-carte, 5 caméras, touches clavier
- [x] Relief, pentes (effet sur accélération/freinage), terrassement, gares plates
- [x] Dépôts traversants (voies de garage), stock de rames par circuit
- [x] Circuits réglables en direct : nombre de trains en service, nombre de caisses, arrêt/non-arrêt gare par gare
- [x] Types de matériel : omnibus, rapide, fret (vitesse, accélération, freinage, longueur de caisse)
- [x] Villes plus riches : maisons à toit en pente, immeubles, tours, fenêtres (allumées la nuit), rues, lampadaires, arbres d'alignement
- [x] Trains détaillés : nez profilé, vitres, portes, bogies, pantographe, phares ; locomotive et wagons de fret
- [x] Gares : quai, auvent, bâtiment voyageurs, panneaux de nom, lampadaires
- [x] Dépôts : halle couverte, entrepôts, conteneurs
- [x] Ombres, cycle jour/nuit, phares, éclairage urbain
- [x] Végétation variée (conifères, feuillus, buissons), lac
- [x] Touche `H` : masque l'interface (base de la « télé d'ambiance »)
- [x] Orbite libre ou accompagnant le train suivi
- [x] Rampes d'entrée/sortie exclusives dans les gares et le dépôt : plus de rames qui se croisent (testé)
- [x] Quais, auvents, lampadaires et panneaux qui suivent la courbe de la voie
- [x] Caméra de poursuite, caméras réutilisables (vue principale, incrustations, plans de la télé)
- [x] **Monde plus grand** : ligne de 5,5 km, terrain de 4,8 km, crêtes et vallées décrites dans le layout
- [x] **Tunnels** (voûte, têtes en béton, lampes, lumière du jour coupée en cabine) et **ponts / viaducs** (tablier, piles, culées), détectés automatiquement
- [x] **Rivière** creusée dans le relief, franchie par un viaduc ; berges boueuses
- [x] **Villes irrégulières** : avenues, boulevards courbes, rues de quartier, parcs, quartiers (tours, immeubles, maisons, zone industrielle), trottoirs, marquages
- [x] **Villages** avec église, **campagne** : champs en parcelles, haies, fermes ; forêts par taches, rochers
- [x] Caténaires (fil de contact et portiques)
- [x] Menu « Aller à » : tunnels, viaducs, villes, villages, dépôt, rivière ; le réalisateur aime filmer les ponts et entrées de tunnel
- [x] Culling par cellules (terrain en tuiles, bâtiments, arbres) : environ la moitié de triangles en moins

## Génération procédurale
- [x] Monde complet à partir d'une graine (`?seed=N`), validé, testé sur 40 graines, interface « Monde (graine) »
- [x] Rues : jonctions en T, rubans continus, trottoirs sous les chaussées
- [x] Réseau ferré plus complexe, 1re étape : **corde** à double voie avec bifurcations, traversée à plat, gare centrale et circuits C1/C2 (layout.json et monde généré)
- [x] Antennes à voie unique avec évitements et terminus à rebroussement ; générateur : mondes « boucle » (0-2 cordes, 0-2 antennes) ou « étoile » (petite boucle, 2-3 antennes)
- [ ] Réseau ferré, suite : **ligne principale ouverte** (terminus à chaque bout, sans boucle), navettes aller-retour sur l'antenne sans retour par la boucle, branche en cul-de-sac depuis une corde, bifurcation vers un second dépôt, gare de triage fret
- [ ] Générateur : tailles de monde variables (petit/grand), climats (désert, neige), plusieurs rivières, lacs choisis
- [ ] Générateur : rapport visuel de plusieurs graines (planche-contact)
- [ ] Villes : places et giratoires aux carrefours importants, rues en grille dans les quartiers neufs

## Routier
- [x] Graphe routier (rues des villes + routes de campagne), intersections, feux
- [x] Voitures, bus, camions avec suivi IDM et exclusion aux carrefours
- [x] Passages à niveau (barrières, feux clignotants, voitures qui attendent), ponts routiers sur les rivières
- [x] Vue voiture (poursuite, conducteur)
- [ ] Tram sur route (partage de tronçons avec la circulation)
- [ ] Priorités (routes principales), changement de voie et dépassement, giratoires
- [ ] Arrêts de bus avec lignes, voyageurs
- [ ] Parkings, voitures garées, trafic qui dépend de l'heure (pointes, nuit)
- [ ] Passages à niveau : annonce à la cabine du train (sifflet), cloche
- [ ] Routes : tunnels routiers, ponts qui enjambent la voie ferrée (aujourd'hui toujours à niveau)
- [ ] Ombres et phares plus réalistes, plaques / immatriculations, camions articulés
- [ ] Cités : les rues sans issue ne sont pas parcourues (retirées du graphe)

## Exploitation (idées gardées)
- [ ] Fret : gare de triage, quais de chargement, composition/décomposition de rames, conteneurs et wagons variés
- [ ] Métro et tram comme types de matériel (réseau souterrain, rames courtes)
- [ ] Voyageurs sur les quais, charge des trains qui allonge l'arrêt, heures de pointe
- [ ] Incidents aléatoires (panne, signal en dérangement, limitation temporaire) avec un mode « calme »
- [ ] Plusieurs dépôts avec choix du dépôt d'attache par circuit
- [x] Bifurcations et ligne secondaire (corde)
- [x] Voie unique avec évitements (antennes)

## Infrastructure
- [ ] Deuxième ligne ou branche (le générateur ne sait faire qu'un anneau pour l'instant)
- [ ] Passages à niveau, ponts routiers au-dessus de la voie, passerelles
- [ ] Caténaires : poteaux latéraux en courbe serrée, haubans, sectionnements
- [ ] Tunnels : ventilation, issues de secours, tunnel souterrain de métro
- [ ] Rivière : écoulement animé, rives plus riches, bateaux ; lac alimenté par la rivière
- [ ] Signalisation plus réaliste (panneaux de limitation, courbes de freinage de sécurité)
- [ ] Éditeur de réseau dans le navigateur (poser lignes, gares, dépôts à la souris, export JSON)
- [ ] Graphe libre en JSON (jonctions arbitraires) au lieu du générateur d'anneau

## À améliorer (constaté)
- [ ] Cabine : pas de pupitre ni de compteur ; passager : pas d'intérieur (on voit à travers la caisse)
- [ ] Les rames déjà en circulation gardent leur nombre de caisses ; le réglage ne vaut que pour les prochaines sorties
- [ ] Phares sans éclairage réel (seulement une lampe lumineuse)

## Visuel
- [ ] Textures de façades variées, enseignes, publicités
- [ ] Clôtures, troupeaux, tracteurs, bâtiments agricoles variés
- [ ] Villes : places avec monuments, façades variées, enseignes, immeubles à cour, ponts sur la rivière
- [ ] Terrain : LOD (tuiles lointaines moins détaillées), eau avec reflets
- [ ] Météo : pluie, brouillard, neige
- [ ] Étoiles et lune la nuit
- [ ] Gares plus variées (selon la taille de la ville)

## Caméras et immersion
- [x] Cabine : tableau de bord (vitesse, limite, prochain signal, pente)
- [ ] Cabine : pupitre et vitres en 3D
- [ ] Intérieur voyageur (sièges, fenêtres)
- [ ] Écrans de gare (prochains départs lus depuis la simulation)
- [x] Multi-vues : jusqu'à 3 incrustations réglables (touche M)
- [ ] Multi-vues : disposition réglable, plein écran d'une incrustation
- [x] **Télé d'ambiance** (touche T) : plein écran sans interface, réalisateur qui choisit train et caméra selon l'action, fondus, légendes
- [x] Télé d'ambiance : réalisateur amélioré (événements, drone, téléobjectif, passage rasant, lieux, faune, anti-répétition)
- [ ] Télé d'ambiance : arrivée vue du quai, survol du dépôt, rythme réglable, plans qui suivent le bus / la faune en même temps qu'un train
- [ ] Replay, retour en arrière, ralenti, time-lapse, enregistrement vidéo
- [x] Sons : roulement et klaxon au départ de gare (Web Audio, option « Son »)
- [ ] Sons : annonces en gare, grincements en courbe, cloches de passage à niveau, stéréo

## Technique
- [ ] Simulation dans un Web Worker
- [ ] Sauvegarde/chargement de scénarios, graine de monde
- [ ] Serveur WebSocket (Raspberry Pi) : plusieurs écrans sur le même monde en direct
- [ ] Optimisation (LOD, culling) si le monde grossit

## Mis de côté pour l'instant
- Horaires, fréquences, ponctualité
- Terminus et retournement des trains (on reste sur des boucles)

## Écartés pour l'instant
- Mode régulateur
- Mode conducteur
- Consommation d'énergie

- Vie de la ville : fait — piétons, voyageurs sur les quais, arrêts de bus, circulation selon l'heure. Reste : ronds-points, passages piétons, voyageurs aux arrêts de bus, feux sur davantage de carrefours (nécessite des carrefours plus espacés).
- Ligne ouverte empruntant partiellement la boucle : demande un tronçon de voie partagé avec retournement sur la voie opposée (communications A/B), non fait.
- Ligne libre : variantes (double voie ouverte, navette sans retour).
- Villes : le côté opposé à la ville principale reste plus pauvre (surtout des hangars) ; ajouter un second foyer d'avenues de l'autre côté de la voie. Villages traversés par la voie : pas de franchissement.
- Les mondes générés dépendent de l'arithmétique flottante du moteur JS (une même graine peut différer entre Node et un navigateur).

## Idées pour la suite (ambiance)
- Tramway (rails dans les rues, arrêts, croisements avec la circulation)
- Vie quotidienne plus riche : marchés, terrasses, chantiers, écoles aux heures de sortie
- Saisons qui changent avec le temps (feuillage, neige au sol) ; routes mouillées, reflets, flaques ; vent dans les arbres
- Bateaux de port (remorqueur, ferry), écluses, ponts mobiles
- Avion : plus d'appareils, hélicoptère ; fumée des cheminées, trafic aérien lointain (traînées)
- Mêmes mondes dans Node et dans le navigateur (arithmétique flottante) pour fiabiliser les rapports

- [x] Entrée des tunnels : plus de talus visible dans l'ouverture (découpe shader du sol).
- [x] Météo : effets renforcés et transitions plus rapides.

## Idées gardées (3e vague)
- [ ] **Canaux** : canal rectiligne avec écluses, péniches qui y passent (non fait : seulement rivière élargie et affluent)
- [ ] **Tramway en petits wagons seuls** (plusieurs wagons indépendants sur un tronçon court, adapté à la taille des villes)
- [ ] Vie quotidienne, suite : ronds-points, passages piétons, clients qui s'assoient vraiment (figure assise), enfants plus petits, cafés/boutiques avec enseignes, marché avec camionnette, flâneurs au bord de l'eau
- [ ] Feux de navigation et éclairage des ports la nuit ; reflets plus riches de l'eau
- [ ] Drone FPV, suite : collisions avec arbres et bâtiments, mode course (portes à passer, chrono), enregistrement et rediffusion du vol, vue « caméra de réalisateur » depuis un drone autonome, réglages de taux enregistrés par drone
- [ ] Vie quotidienne, suite : ronds-points aux gros carrefours, cafés/boutiques en façade, clients qui arrivent et partent à pied, circulation qui s'arrête pour les piétons


## Fait (itération 5)
- [x] PNJ géants (`Figure.size`), rivière du monde par défaut retracée, ponts en arc sans pile dans le chenal, péniches sur toute la rivière.
## À voir
- [ ] Source de la rivière : l'extrémité amont forme une petite cuvette polygonale visible d'en haut.
- [ ] Arche en pierre pour les ponts routiers (aujourd'hui tablier haut sans pile dans le chenal).

## Fait (itération 6)
- [x] Villes d'un seul tenant, ronds-points à sens unique, tramway (petites voitures seules), ponts routiers en arche, source de rivière effilée.
## À voir
- [x] Les voitures cèdent au tram, arrêts visibles, boucles à plusieurs rames, FPV dans les tunnels (itération 7).
- [x] Caméra de tram, quais corrects, grandes boucles, passages à niveau en biais (itération 7b).
- [ ] Passagers aux stations ; fils aériens ; son ; correspondances entre lignes.
- [ ] Caméra de suivi du tram (comme navires et avions) et prise en compte par le réalisateur.
- [ ] Quartiers supprimés par `connectStreets` : les relier par un souterrain ou un pont quand c'est possible plutôt que de les retirer.

## Défauts connus (notés après l'itération 7b, à reprendre plus tard)
- [ ] Les étals de marché se retrouvent parfois sur la chaussée (placement des étals par rapport au bord de rue / à la place).
- [ ] Certains quais de tram empiètent un peu sur la route (la demi-largeur `line.hw` prise sur la rue la plus étroite ne correspond pas toujours à la chaussée réelle ; vérifier hw par segment et décaler le quai d'au moins 0,3 m).
- [ ] Recouvrements brefs voiture/tram dans les carrefours (bus en virage, mode « avance au pas »).

## Fait (itération 8)
- Ciel : lune et phases, étoiles, éclipses, comète, aurores, étoiles filantes, arc-en-ciel, marées, plans du réalisateur.
- Habitant : marche à 1,70 m, montée et descente tram / bus / train, journée d'un habitant (touche K).
- Safari photo : missions du jour, notes (composition, lumière, rareté), album, zoom.
- Réalisateur : plans de durée variable (entrée en gare, passage à niveau, pont, tunnel), dosage du temps d'écran.

## À voir (après l'itération 8)
- [ ] Habitant : **intérieurs** (halls de gare, mairie, école, gare routière) ; collision fine avec les bâtiments ; marcher dans les rues de campagne ; plus de moyens de transport (correspondances) ; choisir son arrêt de destination sur une carte ; plusieurs habitants avec des métiers différents.
- [ ] Safari : cibles plus fines (espèces d'oiseaux, avion de ligne en vol), missions « lieu » (se placer à un endroit précis), concours entre graines, export d'une photo vers un fichier.
- [ ] Ciel : décors animés supplémentaires (ballon dirigeable, feux d'artifice, nuages lumineux), saisons.

## Fait (itération 9)
- Sport (+ correctifs : roues, arbres hors chaussée et allées, lune, parapente, effectifs, stade déjà occupé à l’ouverture, menu « Sport (aller voir) ») : stade avec entraînements variant selon les jours, joggeurs (frontale), cyclistes, pelotons, VTT, cavaliers, aviron, tennis, foot à 5, basket 3x3, parapente, sentiers et allées, safari et réalisateur adaptés.

- Itération 9c : bras des coureurs (avant-bras plié vers l'avant), cycliste assis sur la selle, tête du cheval, rameurs au niveau de l'eau réel (rivière en pente), suivi réel des sportifs, habitant débloqué dans les rues, bouts de rue raccordés ou terminés par une placette, **planeur** (remorquage, ascendances, atterrissage).

## À voir (après l'itération 9)
- [ ] Planeurs : plusieurs ascendances liées au relief/météo, planeurs parqués sur l'aire, remorqueur qui reste en vol pour un second remorquage, pilote visible.
- [ ] Habitant : collision fine avec les bâtiments (aujourd'hui : couloir autour des rues).
- [ ] Pistes cyclables **dessinées** (bandes colorées au bord des rues), vélos qui respectent les feux ; joggeurs qui attendent aux passages piétons.
- [ ] Sport : rameurs avec une vraie pale dans l'eau (éclaboussures, sillage), nageurs, pêcheurs, ski de fond et marche nordique (écartés pour l'instant), course populaire / marathon dans les rues, pétanque, public dans les tribunes les jours de compétition seulement (déjà fait) + buvette.
- [ ] Athlétisme : épreuves complètes (relais avec témoin, steeple, triple saut, marteau), chronomètre et tableau d'affichage, juges, résultats.
- [ ] Safari : missions sportives plus fines (« un saut à la perche à l'heure dorée »).
- [ ] Parapente : décollage à plusieurs, thermiques liés au relief et à la météo, voiles qui se croisent, atterrissage avec flare plus fin.

## Après itération 10
- Vérifier visuellement le raccord de routes sur d'autres jonctions rurales/urbaines.
- Jouer : tennis, foot/basket jouables ; mode multi-joueurs en ligne.
