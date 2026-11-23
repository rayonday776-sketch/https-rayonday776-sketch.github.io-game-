# Chroniques des Âges : document de design

> Grand strategy jouable dans le navigateur. Un continent généré procéduralement, qui **grandit** de l'Antiquité à l'ère moderne : les villages deviennent des villes, les villes débordent de leurs murailles, les routes deviennent des voies ferrées, les royaumes deviennent des républiques.

## 1. Intention

| Ce qui plaît | Ce qui manque ailleurs | Notre réponse |
|---|---|---|
| Monde construit avec soin : relief, rivières, réseaux de villes, quartiers (inspiration *Iron Kings*) | Monde figé, aucune croissance visible | Simulation continue : population, fondations, routes, quartiers qui s'ajoutent |
| Dirigeants incarnés, petites animations, journal (inspiration *To All Ends*) | Jeux jamais sortis ou austères | Portraits procéduraux animés + gazette annuelle dont le style change avec l'ère |
| Économie et politique d'EcoPol (mod WorldBox) | | Marchés par ville, prix dynamiques, partis et régimes |

Réponses au questionnaire :

- **Genre** : grand strategy jouable (le joueur dirige une nation, le reste du monde vit seul).
- **Plateforme** : web HTML/JS, publiable sur GitHub Pages, aucune dépendance.
- **Vue** : carte 2D illustrée façon carte ancienne, zoom continu monde → région → ville → rues.
- **Croissance** : villes, démographie, économie, histoire et politique.
- **Époque** : de l'Antiquité à l'ère moderne (6 ères).
- **Temps** : temps réel avec pause, 4 vitesses.
- **Personnages** : portraits procéduraux animés.
- **Journal** : gazette papier illustrée.
- **Monde** : un continent (~14 peuples au départ).
- **Villes** : zoom jusqu'aux quartiers et bâtiments.
- **Repris d'EcoPol** : système économique et système politique.

## 2. Génération du monde (`js/terrain.js`)

1. **Côtes** : masque continental déformé par du bruit fractal ; niveau de la mer fixé par quantile (~44 % de terres).
2. **Relief** : chaînes de montagnes par bruit « ridged », modulées par un masque régional, plus des collines. Indépendant du masque côtier, donc les montagnes forment des chaînes et non un dôme central.
3. **Hydrologie** : comblement des cuvettes (*priority-flood*). Les cuvettes profondes deviennent des **lacs**. Calcul du sens d'écoulement, puis du **débit accumulé**. Une case devient rivière au-delà d'un seuil, et la largeur suit la racine du débit. Les vallées sont creusées dans l'ombrage.
4. **Climat** : température selon la latitude (nord froid) et l'altitude ; humidité selon le bruit, la distance à la mer et la proximité des rivières.
5. **Biomes** : 15 biomes (prairie, forêt, jungle, taïga, toundra, steppe, désert, marais, collines, montagnes, neiges, littoral…).
6. **Fertilité** : biome + bonus fluvial (oasis en désert) + bonus lacustre.

Rendu (`js/render.js`) : fond peint une fois à 8 px par case (couleurs interpolées, ombrage du relief, grain du papier, côte à l'encre, isobathes), puis symboles dessinés à la main : montagnes ombrées, arbres, sapins, roseaux, dunes. Au zoom, les rivières passent en vectoriel pour rester nettes.

## 3. Villes et réseau (`js/world.js`, `js/city.js`)

- **Placement** : score de site = fertilité alentour + fleuve + côte. Capitales espacées, puis villages rattachés au chef-lieu le plus proche en coût de trajet.
- **Routes** : A* sur le terrain (montagnes chères, ponts coûteux, routes existantes très bon marché) : les routes **se rejoignent** et forment un vrai réseau. Elles deviennent des **chemins de fer** à l'ère industrielle entre grandes villes.
- **Territoire** : Dijkstra multi-sources pondéré par la taille des villes. Les frontières sont tracées en *marching squares*.
- **Croissance** : population logistique vers une capacité K (nourriture locale × rendement de l'ère + importations + commerce + industrie). Colonisation de nouveaux sites, exode rural vers les villes industrielles.
- **Plan de ville** : anneaux concentriques (un anneau ≈ un palier de population), avenues orientées vers les villes reliées, quartiers typés selon la distance au centre et le site :
  - noble, temple, marchand, artisans, populaire ;
  - port côté mer, quartier latin si université, industriel ;
  - jardins, faubourgs hors des murs.
- **Murailles** : l'enceinte se fige à la construction. La ville continue ensuite de croître **hors les murs** en faubourgs : la croissance se lit sur le plan.
- **Champs en lanières** autour des villes préindustrielles. Couleurs des toits par ère (terre cuite → ardoise → brique → béton).

## 4. Économie (inspirée d'EcoPol)

- 6 denrées : blé, bois, pierre, fer, étoffes, épices. Production par case selon le biome, et consommation par habitant croissante avec l'ère.
- **Stocks et prix par ville** : prix = base × tension (consommation / stock), bornés de ×0,3 à ×4.
- **Commerce** : le long des routes et entre ports. Les marchandises vont du prix bas au prix haut, le profit va aux deux villes, et un marché donne +35 %. Pas de commerce entre pays en guerre ; le traité de commerce donne +40 %.
- **Finances** : impôts × assiette (population, commerce) ; dépenses : armée, administration, entretien des édifices, gaspillage des trésors dormants.
- Pénurie de blé → famine (perte de population, de concorde, gros titre dans la gazette).

## 5. Politique

- **Régimes** : chefferie, royaume, empire, théocratie, république, démocratie, dictature. Chacun a ses titres, sa succession (héréditaire avec numéro de règne, ou élections) et sa durée de mandat.
- **Partis** (5 rôles : tradition, militaire, religion, commerce, peuple), renommés à chaque ère :
  - Antiquité : Anciens, Guerriers, Prêtres, Marchands, Plèbe ;
  - ère industrielle : Conservateurs, Nationalistes, Cléricaux, Libéraux, Socialistes.

  Le soutien de chaque parti dérive selon les impôts, la guerre, les famines, le commerce et les temples.
- **Concorde (stabilité)** : impôts, guerre, famine, temples, légitimité, traits du dirigeant, surextension.
- **Crises** : sous un certain seuil, révolution (le parti dominant impose son régime) ou sécession d'une ville éloignée, qui fonde une nouvelle nation avec une culture dérivée.
- **Diplomatie** : relations (frontières −, commerce +), traités de commerce, guerres (batailles mensuelles, sièges ralentis par les murailles, prise de villes, chute de nations), paix par épuisement.
- **Technologie** : population, universités, commerce, diffusion par les voisins. Le passage d'ère change les tenues, les toits, les partis, la gazette et les rendements.

## 6. Personnages et gazette

- **Portraits** (`js/portrait.js`) : générés depuis une graine. Peau selon la culture, forme du visage, yeux, nez, bouche, coiffure, barbe, grain de beauté, cicatrice.
  - Animations : respiration, balancement de la tête, clignement des yeux, regard qui se déplace.
  - L'**humeur** suit la concorde (sourcils, bouche) ; l'**âge** grisonne les cheveux et ajoute des rides.
  - **Tenue** selon l'ère et le régime : plumes, laurier, couronne, mitre, hermine, fraise, uniforme à épaulettes, costume-cravate, casquette de dictateur.
- **Gazette** (`js/gazette.js`) : une édition chaque janvier, archivée.
  - Le titre et le style changent avec l'ère : *Annales* gravées → chronique gothique avec lettrine → gazette → *Le Petit …ois* → quotidien moderne.
  - Contenu : gros titre (événement le plus important), gravure sépia du dirigeant, nouvelles du pays, échos du monde, cours du marché de la capitale, chiffres du royaume, nécrologie, réclame d'époque.

## 7. Contrôles

| Action | Contrôle |
|---|---|
| Zoom | molette, pincement, `+` / `-` |
| Déplacer | glisser |
| Pause / vitesses | `Espace`, `0` à `4` |
| Sélection | clic sur une ville (panneau de droite) ou un territoire étranger (diplomatie) |
| Gouverner | curseur d'impôts, fonder une colonie, bâtir, tracer une route, guerre / paix / traité, conseil automatique |
| Partager un monde | `?seed=12345` dans l'URL |

## 8. Feuille de route

**Prototype (fait)** : génération du continent, simulation complète de l'Antiquité à l'ère moderne, rendu carte ancienne, zoom ville, portraits animés, gazette, actions de base du joueur.

**Prochaines étapes proposées :**

1. **Armées visibles** : pions qui marchent sur les routes, batailles sur la carte, sièges animés.
2. **Événements à choix** (façon *To All Ends*) : dilemmes avec portrait du conseiller et 2 à 3 options.
3. **Conseillers et cour** : personnages secondaires avec portraits, complots, mariages dynastiques.
4. **Ville vivante** : plans plus organiques (Voronoï), monuments uniques, quartiers nommés selon l'histoire (« Quartier de la Victoire de 312 »).
5. **Commerce maritime visible** : navires sur les routes commerciales.
6. **Religions et cultures** : diffusion sur la carte, conversions, schismes.
7. **Sauvegarde et chargement** (localStorage + export).
8. **Cartes thématiques** : relief, politique, commerce, religion, densité.
9. **Sons** : ambiance par ère.

## 9. Architecture

```
index.html, style.css
js/rng.js       aléatoire déterministe + bruit de Perlin
js/terrain.js   génération du continent
js/names.js     langues procédurales par culture
js/world.js     simulation (villes, nations, économie, politique, guerre)
js/city.js      plans de ville
js/render.js    rendu de la carte
js/portrait.js  portraits animés
js/gazette.js   journal
js/main.js      boucle de jeu et interface
```

Tout est déterministe à partir de la graine : un même `?seed=` donne le même continent.
