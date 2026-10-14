import mongoose from "mongoose";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { ShareLink } from "../src/models/ShareLink.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SEED_BATCH_TAG = "makershare-demo-v1";
export const DEFAULT_MANIFEST_PATH = path.resolve(__dirname, "../data/seed-manifest.json");

export const DEMO_CREATORS = [
  { email: "demo.alice.lego@makershare.local", name: "Alice Briquiste" },
  { email: "demo.bastien.paper@makershare.local", name: "Bastien Papercrafter" },
  { email: "demo.camille.origami@makershare.local", name: "Camille Pliage" },
  { email: "demo.damien.synth@makershare.local", name: "Damien Luthier DIY" },
  { email: "demo.elena.print3d@makershare.local", name: "Elena Maker 3D" },
  { email: "demo.felix.robot@makershare.local", name: "Félix Mécatronique" },
  { email: "demo.gabriel.wood@makershare.local", name: "Gabriel Menuisier" },
  { email: "demo.helene.costume@makershare.local", name: "Hélène Cosplay Design" },
  { email: "demo.ismail.music@makershare.local", name: "Ismaïl Acoustic" },
  { email: "demo.julie.clay@makershare.local", name: "Julie Céramiste" },
];

/**
 * Génère la liste des 100 posts de démonstration répartis entre les 10 créateurs.
 */
export function buildDemoPosts(authorIds) {
  const categories = ["Lego", "Papercraft", "Origami", "Musique", "Modèles 3D", "Autre"];
  const posts = [];

  const postTemplates = [
    // 0..9: Alice Briquiste (Lego)
    {
      title: "Faucon Millenium Lego Star Wars",
      category: "Lego",
      tags: ["lego", "star-wars", "vaisseau"],
      visibility: "public",
      desc: "Reproduction détaillée avec cockpit amovible et intérieur complet.",
    },
    {
      title: "Grue Mobile Technic 8 Roues",
      category: "Lego",
      tags: ["lego", "technic", "mecanique"],
      visibility: "public",
      desc: "Bras télescopique motorisé et stabilisateurs pneumatiques fonctionnels.",
    },
    {
      title: "Voiture de Course Vintage 1960",
      category: "Lego",
      tags: ["lego", "vintage", "voiture"],
      visibility: "public",
      desc: "Châssis tubulaire et moteur V8 détaillé en briques classiques.",
    },
    {
      title: "Boutique Modulaire de Fleuriste",
      category: "Lego",
      tags: ["lego", "modular", "architecture"],
      visibility: "public",
      desc: "Bâtiment à 3 étages avec verrière et mobilier intérieur minutieux.",
    },
    {
      title: "Guitare Électrique Lego Décorative",
      category: "Lego",
      tags: ["lego", "musique", "guitare"],
      visibility: "public",
      desc: "Modèle réduit taille 1:2 avec cordes en nylon et chevalet réaliste.",
    },
    {
      title: "Château Médiéval et Pont-Levis",
      category: "Lego",
      tags: ["lego", "medieval", "chateau"],
      visibility: "public",
      desc: "Forteresse complète avec donjon, herses et salle du trône secrète.",
    },
    {
      title: "Robot Explorateur Martien Rover",
      category: "Lego",
      tags: ["lego", "espace", "robot"],
      visibility: "public",
      desc: "Suspension oscillante à 6 roues adaptée aux terrains accidentés.",
    },
    {
      title: "Figurine Articulée Michael Jackson",
      category: "Lego",
      tags: ["lego", "musique", "pop"],
      visibility: "public",
      desc: "Figurine articulée avec chapeau fedora et veste pailletée emblématique.",
    },
    {
      title: "Sous-Marin Océanographique Jaune",
      category: "Lego",
      tags: ["lego", "ocean", "sous-marin"],
      visibility: "followers",
      desc: "Bras manipulateur fonctionnel et cockpit panoramique transparent.",
    },
    {
      title: "Brouillon Nouveau Projet Diorama Spatial",
      category: "Lego",
      tags: ["lego", "espace", "brouillon"],
      visibility: "public",
      status: "draft",
      desc: "Plan préliminaire d'une station spatiale orbitale modulaire.",
    },

    // 10..19: Bastien Papercrafter (Papercraft)
    {
      title: "Casque Stormtrooper Papercraft Échelle 1:1",
      category: "Papercraft",
      tags: ["papercraft", "star-wars", "casque"],
      visibility: "public",
      desc: "Modèle en papier cartonné 250g avec patrons imprimables complets.",
    },
    {
      title: "Faucon Millenium Papercraft Détaillé",
      category: "Papercraft",
      tags: ["papercraft", "star-wars", "vaisseau"],
      visibility: "public",
      desc: "Modèle de vaisseau spatial avec trains d'atterrissage repliables.",
    },
    {
      title: "Tête de Cerf Géométrique Basse Définition",
      category: "Papercraft",
      tags: ["papercraft", "low-poly", "decoration"],
      visibility: "public",
      desc: "Trophée mural écologique et moderne à assembler sans colle visible.",
    },
    {
      title: "Dragon Oriental Papercraft Articulé",
      category: "Papercraft",
      tags: ["papercraft", "dragon", "asie"],
      visibility: "public",
      desc: "Sculpture en papier de 60 cm de long avec écailles en relief.",
    },
    {
      title: "Mascotte Pokemon Pikachu Low-Poly",
      category: "Papercraft",
      tags: ["papercraft", "pokemon", "manga"],
      visibility: "public",
      desc: "Modèle accessible aux débutants pour s'initier aux pliages 3D.",
    },
    {
      title: "Tour Eiffel en Cartonnage Haute Précision",
      category: "Papercraft",
      tags: ["papercraft", "paris", "monument"],
      visibility: "public",
      desc: "Reproduction fidèle au 1:500e avec découpes laser ou manuelles.",
    },
    {
      title: "Masque Oni Japonais Traditionnel",
      category: "Papercraft",
      tags: ["papercraft", "japon", "masque"],
      visibility: "public",
      desc: "Masque décoratif aux cornes expressives et finitions rouge laqué.",
    },
    {
      title: "Avion de Chasse Rafale Aéronavale",
      category: "Papercraft",
      tags: ["papercraft", "aviation", "avion"],
      visibility: "public",
      desc: "Maquette d'avion avec cockpit détaillé et armement sous voilure.",
    },
    {
      title: "Château Ambulant Miniature en Papier",
      category: "Papercraft",
      tags: ["papercraft", "ghibli", "fantastique"],
      visibility: "link",
      desc: "Patron exclusif partagé avec pièces articulées et cheminées mobiles.",
    },
    {
      title: "Buste Futuriste Cyberpunk en Cartoline",
      category: "Papercraft",
      tags: ["papercraft", "cyberpunk", "art"],
      visibility: "subscribers",
      desc: "Sculpture complexe de 350 facettes réservée aux abonnés du créateur.",
    },

    // 20..29: Camille Pliage (Origami)
    {
      title: "Test origami et bases fondamentales",
      category: "Origami",
      tags: ["origami", "tutoriel", "debutant"],
      visibility: "public",
      desc: "Guide d'introduction aux plis vallée et montagne pour débutants.",
    },
    {
      title: "Grue Japonaise Senbazuru en Papier Washi",
      category: "Origami",
      tags: ["origami", "japon", "grue"],
      visibility: "public",
      desc: "Pliage traditionnel de la grue symbole de paix et longévité.",
    },
    {
      title: "Fleur de Lotus Flottante Multicolore",
      category: "Origami",
      tags: ["origami", "fleur", "nature"],
      visibility: "public",
      desc: "Pliage élégant de 12 pétales déployables sans découpe.",
    },
    {
      title: "Dragon Western Complexe à 120 Étapes",
      category: "Origami",
      tags: ["origami", "dragon", "avance"],
      visibility: "public",
      desc: "Pliage expert sur papier kraft fin de 50x50 cm avec griffes formées.",
    },
    {
      title: "Tessellation Géométrique Miura-Ori",
      category: "Origami",
      tags: ["origami", "geometrie", "science"],
      visibility: "public",
      desc: "Pliage spatial à mémoire de forme déployable en un seul mouvement.",
    },
    {
      title: "Boîte Masu Traditionnelle avec Couvercle",
      category: "Origami",
      tags: ["origami", "boite", "utilitaire"],
      visibility: "public",
      desc: "Rangement pratique et solide plié à partir de deux carrés de papier.",
    },
    {
      title: "Grenouille Sauteuse Dynamique",
      category: "Origami",
      tags: ["origami", "jouet", "anime"],
      visibility: "public",
      desc: "Pliage ludique qui saute réellement lorsqu'on appuie sur son dos.",
    },
    {
      title: "Éléphant d'Asie Miniature en Papier Chiyogami",
      category: "Origami",
      tags: ["origami", "animaux", "elephant"],
      visibility: "public",
      desc: "Modèle tridimensionnel avec trompe courbée et défenses marquées.",
    },
    {
      title: "Rose de Kawasaki Haute Fidélité",
      category: "Origami",
      tags: ["origami", "rose", "fleur"],
      visibility: "followers",
      desc: "Tutoriel pas à pas du célèbre pliage en spirale de Toshikazu Kawasaki.",
    },
    {
      title: "Pégase Ailé Pliage Masterclass",
      category: "Origami",
      tags: ["origami", "mythologie", "expert"],
      visibility: "subscribers",
      desc: "Pliage d'exception sur papier fait main réservé à la communauté d'abonnés.",
    },

    // 30..39: Damien Luthier DIY (Musique)
    {
      title: "Pédalier Effets Guitare en Chêne Recyclé",
      category: "Musique",
      tags: ["musique", "guitare", "pedalboard"],
      visibility: "public",
      desc: "Fabrication d'un pedalboard robuste avec passage de câbles intégré.",
    },
    {
      title: "Guitare Cigar Box à 3 Cordes Blues",
      category: "Musique",
      tags: ["musique", "cigarbox", "blues"],
      visibility: "public",
      desc: "Instrument traditionnel acoustique avec micro piezo maison.",
    },
    {
      title: "Cajon Flamenco Portatif avec Timbre Ajustable",
      category: "Musique",
      tags: ["musique", "percussion", "cajon"],
      visibility: "public",
      desc: "Plans complets et choix des essences de bois pour un son percutant.",
    },
    {
      title: "Synthétiseur Modulaire Eurorack DIY",
      category: "Musique",
      tags: ["musique", "synthe", "electronique"],
      visibility: "public",
      desc: "Création d'un oscillateur analogique VCO sur circuit imprimé maison.",
    },
    {
      title: "Kalimba en Bois d'Acajou et Lames d'Acier",
      category: "Musique",
      tags: ["musique", "kalimba", "lutherie"],
      visibility: "public",
      desc: "Piano à pouces à 17 lames accordées en Do majeur avec résonateur.",
    },
    {
      title: "Ampli Guitare à Lampes 5 Watts Miniature",
      category: "Musique",
      tags: ["musique", "ampli", "tube"],
      visibility: "public",
      desc: "Schéma électronique et assemblage point-à-point d'un ampli vintage.",
    },
    {
      title: "Microphone à Ruban DIY pour Studio",
      category: "Musique",
      tags: ["musique", "micro", "studio"],
      visibility: "public",
      desc: "Conception acoustique d'un transducteur à ruban aluminium ultra fin.",
    },
    {
      title: "Basse Électrique Fretless Manche Traversant",
      category: "Musique",
      tags: ["musique", "basse", "lutherie"],
      visibility: "public",
      desc: "Sculpture du manche et vernis au tampon sur touche ébène.",
    },
    {
      title: "Pédale de Fuzz Silicium Vintage Partage Secret",
      category: "Musique",
      tags: ["musique", "effet", "pedale"],
      visibility: "link",
      desc: "Schéma sonore chaud inspiré des circuits fuzz classiques des années 70.",
    },
    {
      title: "Ukelele Soprano en Koa Massif de Collection",
      category: "Musique",
      tags: ["musique", "ukelele", "lutherie"],
      visibility: "subscribers",
      desc: "Projet de lutherie fine avec barrage personnalisé pour abonnés.",
    },

    // 40..49: Elena Maker 3D (Modèles 3D)
    {
      title: "Bras Robotisé 4 Axes Imprimé en 3D",
      category: "Modèles 3D",
      tags: ["impression-3d", "robotique", "servomoteur"],
      visibility: "public",
      desc: "Fichiers STL et schéma Arduino pour manipuler de petits objets.",
    },
    {
      title: "Support Smartphone Universel avec Suivi Visage",
      category: "Modèles 3D",
      tags: ["impression-3d", "gadget", "support"],
      visibility: "public",
      desc: "Mécanisme rotatif motorisé silencieux sans roulement à billes.",
    },
    {
      title: "Engrenage Planétaire Imprimé sans Assemblage",
      category: "Modèles 3D",
      tags: ["impression-3d", "mecanique", "engrenage"],
      visibility: "public",
      desc: "Modèle print-in-place tolérancé à 0.2 mm pour tester son imprimante.",
    },
    {
      title: "Boîtier PC Mini-ITX Ouvert et Aéré",
      category: "Modèles 3D",
      tags: ["impression-3d", "informatique", "boitier"],
      visibility: "public",
      desc: "Châssis modulaire optimisé pour carte graphique double slot.",
    },
    {
      title: "Éclairage d'Ambiance Voronoi Lumineux",
      category: "Modèles 3D",
      tags: ["impression-3d", "lampe", "design"],
      visibility: "public",
      desc: "Abat-jour design organique diffusant une lumière chaleureuse.",
    },
    {
      title: "Châssis Drone FPV 5 Pouces Hybride Carbone-PLA",
      category: "Modèles 3D",
      tags: ["impression-3d", "drone", "fpv"],
      visibility: "public",
      desc: "Structure allégée absorbant les vibrations des moteurs brushless.",
    },
    {
      title: "Organisateur de Bureau Hexagonal Modulaire",
      category: "Modèles 3D",
      tags: ["impression-3d", "bureau", "rangement"],
      visibility: "public",
      desc: "Pots magnétiques emboîtables pour stylos, cartes SD et câbles USB.",
    },
    {
      title: "Horloge Mécanique à Poids et Échappement",
      category: "Modèles 3D",
      tags: ["impression-3d", "horloge", "mecanisme"],
      visibility: "public",
      desc: "Pendule fonctionnelle entièrement réalisée en pièces imprimées.",
    },
    {
      title: "Molette Macro USB Programmable QMK",
      category: "Modèles 3D",
      tags: ["impression-3d", "clavier", "maker"],
      visibility: "followers",
      desc: "Encodeur rotatif avec touches mécaniques pour raccourcis logiciels.",
    },
    {
      title: "Prothèse de Main Mécanique Open-Source",
      category: "Modèles 3D",
      tags: ["impression-3d", "medical", "solidaire"],
      visibility: "public",
      desc: "Modèle complet ajustable pour enfants avec système de câbles tenseurs.",
    },

    // 50..59: Félix Mécatronique (Modèles 3D / Autre)
    {
      title: "Mini Table Traçante CNC avec Stylos",
      category: "Modèles 3D",
      tags: ["robotique", "cnc", "arduino"],
      visibility: "public",
      desc: "Traceur XY économique utilisant deux vieux lecteurs DVD recyclés.",
    },
    {
      title: "Distributeur Automatique de Croquettes Connecté",
      category: "Autre",
      tags: ["domotique", "animaux", "esp32"],
      visibility: "public",
      desc: "Système à vis sans fin avec programmation horaire et notification WiFi.",
    },
    {
      title: "Station Météo Solaire E-Paper Basse Consommation",
      category: "Autre",
      tags: ["electronique", "meteo", "solaire"],
      visibility: "public",
      desc: "Autonomie de 1 an sur batterie avec capteurs BME280 et écran 4.2 pouces.",
    },
    {
      title: "Serre Autonome Intelligente avec Arrosage Automatique",
      category: "Autre",
      tags: ["jardin", "iot", "plante"],
      visibility: "public",
      desc: "Mesure de l'humidité du sol et déclenchement de micro-pompes 5V.",
    },
    {
      title: "Miroir Infini RGB à LEDs Adressables",
      category: "Autre",
      tags: ["luminaire", "led", "optique"],
      visibility: "public",
      desc: "Effet de profondeur spectaculaire avec miroir sans tain et ruban WS2812B.",
    },
    {
      title: "Rubik's Cube Solveur Automatisé avec Caméra",
      category: "Modèles 3D",
      tags: ["robotique", "cube", "ia"],
      visibility: "public",
      desc: "Résolution mécanique en moins de 10 secondes grâce à la vision par ordinateur.",
    },
    {
      title: "Thermostat Connecté avec Molette Rotative Rétro",
      category: "Autre",
      tags: ["domotique", "thermostat", "esp32"],
      visibility: "public",
      desc: "Interface épurée OLED affichant température et consigne de chauffe.",
    },
    {
      title: "Brouillon Scanner 3D Photogrammétrie Plateau Tournant",
      category: "Modèles 3D",
      tags: ["3d", "scanner", "brouillon"],
      visibility: "public",
      status: "draft",
      desc: "Notes de conception d'un plateau tournant synchronisé avec smartphone.",
    },
    {
      title: "Porte-Clefs NFC Gravé au Laser Fait Maison",
      category: "Autre",
      tags: ["laser", "bois", "nfc"],
      visibility: "link",
      desc: "Badges en noyer avec puce RFID intégrée pour ouverture de portail.",
    },
    {
      title: "Alimentation de Laboratoire Réglable 0-30V 5A",
      category: "Autre",
      tags: ["electronique", "alimentation", "diy"],
      visibility: "followers",
      desc: "Conversion d'une alimentation ATX de PC avec module de régulation précis.",
    },

    // 60..69: Gabriel Menuisier (Lego / Autre)
    {
      title: "Établi de Menuisier Miniature avec Tiroirs Fonctionnels",
      category: "Autre",
      tags: ["bois", "menuiserie", "miniature"],
      visibility: "public",
      desc: "Reproduction au 1:6 avec presse de serrage et assemblages à queue d'aronde.",
    },
    {
      title: "Planche à Découper en Bois de Bout Damier 3D",
      category: "Autre",
      tags: ["bois", "cuisine", "damier"],
      visibility: "public",
      desc: "Assemblage d'érable et de noyer pour une résistance maximale aux couteaux.",
    },
    {
      title: "Boîte Japonaise Secrète à Mécanisme Coulissant",
      category: "Autre",
      tags: ["bois", "casse-tete", "japon"],
      visibility: "public",
      desc: "Boîte à énigme nécessitant 14 mouvements séquentiels pour s'ouvrir.",
    },
    {
      title: "Lampe Articulée en Frêne Scandinave",
      category: "Autre",
      tags: ["bois", "luminaire", "scandinave"],
      visibility: "public",
      desc: "Bras articulé par écrous papillon avec câble textile tressé jaune.",
    },
    {
      title: "Présentoir Mural pour Figurines Lego en Chêne",
      category: "Lego",
      tags: ["lego", "bois", "rangement"],
      visibility: "public",
      desc: "Étagère vitrée rainurée pouvant accueillir 80 figurines avec leurs socles.",
    },
    {
      title: "Manche d'Outil Ergonomique Tourné au Tour à Bois",
      category: "Autre",
      tags: ["tournage", "bois", "outils"],
      visibility: "public",
      desc: "Restauration d'un vieux ciseau de sculpteur avec finition huile de lin.",
    },
    {
      title: "Support Casque Audio Suspendu en Bois Courbé",
      category: "Autre",
      tags: ["bois", "audio", "accessoire"],
      visibility: "public",
      desc: "Pliage du contreplaqué sous vide pour une ligne moderne et galbée.",
    },
    {
      title: "Sous-Bocks Géométriques Marqueterie Contemporaine",
      category: "Autre",
      tags: ["marqueterie", "bois", "design"],
      visibility: "public",
      desc: "Jeux d'ombres et d'essences contrastées taillées au scalpel.",
    },
    {
      title: "Jeu d'Échecs Minimaliste Sculpté à la Main",
      category: "Autre",
      tags: ["bois", "echecs", "sculpture"],
      visibility: "link",
      desc: "Pièces épurées taillées dans du buis et de l'ébène de Macassar.",
    },
    {
      title: "Table Basse Rivière en Noyer et Résine Époxy Noire",
      category: "Autre",
      tags: ["bois", "resine", "mobilier"],
      visibility: "followers",
      desc: "Coulée profonde de résine teintée mettant en valeur les bords bruts du bois.",
    },

    // 70..79: Hélène Cosplay Design (Papercraft / Autre)
    {
      title: "Armure Cosplay Mando en Mousse EVA et Cuir",
      category: "Autre",
      tags: ["cosplay", "star-wars", "armure"],
      visibility: "public",
      desc: "Patrons de découpe et techniques de peinture effet métal brossé beskar.",
    },
    {
      title: "Ailes d'Ange Mécaniques Déployables par Câbles",
      category: "Autre",
      tags: ["cosplay", "ailes", "mecanique"],
      visibility: "public",
      desc: "Envergure de 2,5 mètres actionnée manuellement par des poignées discrètes.",
    },
    {
      title: "Casque Cyberpunk Papercraft Renforcé Résine",
      category: "Papercraft",
      tags: ["papercraft", "cyberpunk", "resine"],
      visibility: "public",
      desc: "Base en papier cartonné consolidée à la fibre de verre et mastiquée.",
    },
    {
      title: "Sceptre Magique Lumineux avec LED et Prisme",
      category: "Autre",
      tags: ["cosplay", "fantasy", "props"],
      visibility: "public",
      desc: "Accessoire de spectacle intégrant un éclairage néopixel vibrant.",
    },
    {
      title: "Épaulières d'Armure Gothique en Worbla",
      category: "Autre",
      tags: ["cosplay", "worbla", "armure"],
      visibility: "public",
      desc: "Moulage à chaud du thermoplastique et gravure de motifs ornementaux.",
    },
    {
      title: "Couronne Elfique Tressée en Fil de Cuivre",
      category: "Autre",
      tags: ["bijoux", "fantasy", "cuivre"],
      visibility: "public",
      desc: "Diadème léger avec perles de verre et pierres semi-précieuses synthétiques.",
    },
    {
      title: "Masque Vénitien Papercraft Peint à la Feuille d'Or",
      category: "Papercraft",
      tags: ["papercraft", "venise", "masque"],
      visibility: "public",
      desc: "Création raffinée pour bal masqué avec dorures traditionnelles posées au pinceau.",
    },
    {
      title: "Gantelet d'Infinité Taille Réelle Détaillé",
      category: "Papercraft",
      tags: ["papercraft", "marvel", "gant"],
      visibility: "public",
      desc: "Assemblage de 180 pièces de papier avec gemmes transparentes colorées.",
    },
    {
      title: "Bottes de Voyage Médiévales Cuir et Boucles Laiton",
      category: "Autre",
      tags: ["cuir", "medieval", "costume"],
      visibility: "link",
      desc: "Couture au point sellier sur semelles en caoutchouc antidérapantes.",
    },
    {
      title: "Tricorne de Pirate en Feutre et Dentelle Ancienne",
      category: "Autre",
      tags: ["costume", "pirate", "chapeau"],
      visibility: "followers",
      desc: "Mise en forme à la vapeur et finitions baroques pour festival historique.",
    },

    // 80..89: Ismaïl Acoustic (Musique / Papercraft)
    {
      title: "Ukulélé Papercraft Fonctionnel Étonnant",
      category: "Papercraft",
      tags: ["papercraft", "musique", "ukelele"],
      visibility: "public",
      desc: "Corps résonateur en carton rigide capable de supporter la tension des cordes.",
    },
    {
      title: "Panneaux Acoustiques Absorbants en Laine de Roche DIY",
      category: "Musique",
      tags: ["acoustique", "studio", "insonorisation"],
      visibility: "public",
      desc: "Traitement des résonances pour home studio avec cadres en pin et tissu acoustique.",
    },
    {
      title: "Diffuseur Acoustique Quadratique Skyline en Bois",
      category: "Musique",
      tags: ["acoustique", "bois", "studio"],
      visibility: "public",
      desc: "Calcul mathématique des longueurs de tasseaux pour une diffusion spatiale optimale.",
    },
    {
      title: "Sourdine d'Appartement pour Trompette en Impression 3D",
      category: "Modèles 3D",
      tags: ["musique", "trompette", "sourdine"],
      visibility: "public",
      desc: "Atténuation sonore de 25 dB préservant la justesse harmonique de l'instrument.",
    },
    {
      title: "Chevalet et Sillet en Os Véritable Façonnés Main",
      category: "Musique",
      tags: ["guitare", "lutherie", "acoustique"],
      visibility: "public",
      desc: "Optimisation du sustain et de la projection sonore d'une guitare folk.",
    },
    {
      title: "Support Guitare Pliant en Contreplaqué de Bouleau",
      category: "Musique",
      tags: ["musique", "guitare", "support"],
      visibility: "public",
      desc: "Découpe compacte tenant dans une housse d'instrument sans encombrement.",
    },
    {
      title: "Clavier Maître USB 25 Touches Imprimé en 3D",
      category: "Musique",
      tags: ["musique", "midi", "clavier"],
      visibility: "public",
      desc: "Touches à mécanisme pivotant équipées de capteurs de vélocité sensibles.",
    },
    {
      title: "Housse d'Instrument Rigide Rembourrée sur Mesure",
      category: "Musique",
      tags: ["musique", "couture", "protection"],
      visibility: "public",
      desc: "Tissu cordura imperméable et mousse haute densité thermoformée.",
    },
    {
      title: "Boîte à Rythmes Analogique Synthé 4 Voix",
      category: "Musique",
      tags: ["musique", "synthe", "drum"],
      visibility: "link",
      desc: "Sons de grosse caisse et caisse claire chauds générés par circuits discrets.",
    },
    {
      title: "Violon Électrique Silencieux au Design Squelette",
      category: "Musique",
      tags: ["musique", "violon", "lutherie"],
      visibility: "subscribers",
      desc: "Corps ergonomique minimaliste équipé d'un capteur piézoactif sous le chevalet.",
    },

    // 90..99: Julie Céramiste (Autre / Origami)
    {
      title: "Vase Géométrique Inspiré de l'Origami en Porcelaine",
      category: "Autre",
      tags: ["ceramique", "origami", "porcelaine"],
      visibility: "public",
      desc: "Coulage d'une pièce à facettes nettes cuite à 1280 degrés avec émail satiné.",
    },
    {
      title: "Tasses à Café en Grès avec Anse Ergonomique Pincée",
      category: "Autre",
      tags: ["ceramique", "gres", "vaisselle"],
      visibility: "public",
      desc: "Tournage au tour de potier et émaillage dégradé bleu cendre de bois.",
    },
    {
      title: "Cache-Pot Mural Facetté en Béton Allégé",
      category: "Autre",
      tags: ["beton", "design", "plante"],
      visibility: "public",
      desc: "Moulage silicone souple avec incorporation de billes d'argile expansée.",
    },
    {
      title: "Lampe à Poser en Argile Blanche et Bois Tourné",
      category: "Autre",
      tags: ["ceramique", "luminaire", "design"],
      visibility: "public",
      desc: "Socle lourd en terre chamottée contrastant avec un abat-jour aérien en lin.",
    },
    {
      title: "Assiettes Rustiques Façonnées à la Plaque et Tampon",
      category: "Autre",
      tags: ["ceramique", "artisanat", "table"],
      visibility: "public",
      desc: "Bords irréguliers bruts estampés avec des dentelles familiales anciennes.",
    },
    {
      title: "Diffuseur d'Huiles Essentielles en Céramique Poreuse",
      category: "Autre",
      tags: ["ceramique", "bien-etre", "aromatherapie"],
      visibility: "public",
      desc: "Terre cuite non émaillée diffusant naturellement les senteurs sans électricité.",
    },
    {
      title: "Sculpture Florale Origami en Faïence Émaillée",
      category: "Autre",
      tags: ["sculpture", "fleur", "origami"],
      visibility: "public",
      desc: "Pétales délicats façonnés feuille par feuille avant cuisson biscuit.",
    },
    {
      title: "Horloge Murale en Grès Noir et Aiguilles en Laiton",
      category: "Autre",
      tags: ["ceramique", "horloge", "deco"],
      visibility: "public",
      desc: "Cadran texturé à l'éponge avec mouvement à quartz silencieux encastré.",
    },
    {
      title: "Ensemble Théière et Bols Cérémonie du Thé Japonais",
      category: "Autre",
      tags: ["ceramique", "the", "japon"],
      visibility: "followers",
      desc: "Création inspirée de la philosophie Wabi-Sabi célébrant la beauté imparfaite.",
    },
    {
      title: "Brûleur d'Encens Cascade avec Fumée Descendante",
      category: "Autre",
      tags: ["ceramique", "zen", "encens"],
      visibility: "subscribers",
      desc: "Circuit aérodynamique guidant la fumée lourde comme une cascade liquide.",
    },
  ];

  for (let i = 0; i < postTemplates.length; i++) {
    const tmpl = postTemplates[i];
    const authorIndex = Math.floor(i / 10);
    const authorId = authorIds[authorIndex];

    const publishedAt = new Date(Date.now() - (100 - i) * 3600 * 24 * 1000); // Échelonné sur 100 jours
    posts.push({
      author: authorId,
      title: tmpl.title,
      shortDescription: tmpl.desc,
      content: `${tmpl.desc}\n\nCe tutoriel complet MakerShare détaille l'ensemble des étapes de fabrication, le choix des matériaux, les gabarits nécessaires et les conseils d'assemblage pas à pas. Réalisation testée et partagée par la communauté DIY.`,
      category: tmpl.category,
      tags: tmpl.tags,
      visibility: tmpl.visibility || "public",
      status: tmpl.status || "published",
      publishedAt: tmpl.status === "draft" ? null : publishedAt,
      attachments: [],
      seedBatch: SEED_BATCH_TAG,
    });
  }

  return posts;
}

/**
 * Exécute l'insertion ou le nettoyage du jeu de démonstration MakerShare.
 */
export async function runSeed({
  mongoUri,
  demoPassword,
  manifestPath = DEFAULT_MANIFEST_PATH,
  clean = false,
  silent = false,
} = {}) {
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  // 1. Validation de sécurité du mot de passe
  if (!clean) {
    if (!demoPassword || typeof demoPassword !== "string" || !demoPassword.trim()) {
      throw new Error(
        "[seed] ERREUR CRITIQUE: La variable DEMO_PASSWORD est obligatoire pour exécuter le seed."
      );
    }
  }

  // 2. Connexion si nécessaire
  const shouldDisconnect = mongoose.connection.readyState === 0;
  if (shouldDisconnect) {
    if (!mongoUri) {
      throw new Error("[seed] Aucune URI MongoDB fournie (MONGODB_URI ou paramètre).");
    }
    await mongoose.connect(mongoUri);
  }

  try {
    // ----------------------------------------------------
    // MODE NETTOYAGE CIBLÉ (--clean)
    // ----------------------------------------------------
    if (clean) {
      log("[seed] Démarrage du nettoyage ciblé du dataset de démonstration...");

      let manifestData = null;
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = await fsPromises.readFile(manifestPath, "utf-8");
          manifestData = JSON.parse(raw);
        } catch (err) {
          log("[seed] Avertissement: manifeste illisible ou corrompu.");
        }
      }

      // Sélection stricte des IDs cibles : uniquement ceux portant le tag seedBatch
      const demoUsers = await User.find({ seedBatch: SEED_BATCH_TAG }).select("_id email");
      const demoPosts = await Post.find({ seedBatch: SEED_BATCH_TAG }).select("_id title");

      const userIds = demoUsers.map((u) => u._id);
      const postIds = demoPosts.map((p) => p._id);

      if (userIds.length === 0 && postIds.length === 0) {
        log("[seed] Aucun compte ni post de démo trouvé. Rien à nettoyer.");
        if (fs.existsSync(manifestPath)) {
          await fsPromises.unlink(manifestPath);
        }
        return { cleanedUsers: 0, cleanedPosts: 0, cleanedLikes: 0 };
      }

      // Nettoyage des relations dépendantes sur ces entités
      const deletedLikes = await Like.deleteMany({ postId: { $in: postIds } });
      const deletedFollows = await Follow.deleteMany({
        $or: [{ creatorId: { $in: userIds } }, { followerId: { $in: userIds } }],
      });
      const deletedSubs = await Subscription.deleteMany({
        $or: [{ creatorId: { $in: userIds } }, { subscriberId: { $in: userIds } }],
      });
      const deletedLinks = await ShareLink.deleteMany({ postId: { $in: postIds } });

      // Suppression des créations et utilisateurs de démo
      const delPostsRes = await Post.deleteMany({ _id: { $in: postIds }, seedBatch: SEED_BATCH_TAG });
      const delUsersRes = await User.deleteMany({ _id: { $in: userIds }, seedBatch: SEED_BATCH_TAG });

      if (fs.existsSync(manifestPath)) {
        await fsPromises.unlink(manifestPath);
      }

      log(
        `[seed] Nettoyage terminé avec succès : ${delUsersRes.deletedCount} comptes, ${delPostsRes.deletedCount} posts supprimés.`
      );
      log(
        `[seed] Relations nettoyées : ${deletedLikes.deletedCount} likes, ${deletedFollows.deletedCount} follows, ${deletedSubs.deletedCount} abonnements, ${deletedLinks.deletedCount} liens.`
      );

      return {
        cleanedUsers: delUsersRes.deletedCount,
        cleanedPosts: delPostsRes.deletedCount,
        cleanedLikes: deletedLikes.deletedCount,
        cleanedFollows: deletedFollows.deletedCount,
        cleanedSubs: deletedSubs.deletedCount,
        cleanedLinks: deletedLinks.deletedCount,
      };
    }

    // ----------------------------------------------------
    // MODE GÉNÉRATION DU DATASET (10 comptes, 100 posts)
    // ----------------------------------------------------
    log("[seed] Vérification préalable de l'état de la base...");

    // A. Détection des comptes existants avec les emails prévus & protection anti-collision
    const emails = DEMO_CREATORS.map((c) => c.email.toLowerCase());
    const existingUsers = await User.find({ email: { $in: emails } });

    // Contrôle d'intégrité anti-collision
    const nonDemo = existingUsers.filter((u) => u.seedBatch !== SEED_BATCH_TAG);
    if (nonDemo.length > 0) {
      throw new Error(
        `[seed] COLLISION DÉTECTÉE : L'email '${nonDemo[0].email}' existe déjà et ne provient pas du seed de démonstration. Opération interrompue pour protéger les données existantes.`
      );
    }

    // B. Récupération ou création des 10 comptes créateurs
    const existingUserMap = new Map();
    for (const u of existingUsers) {
      existingUserMap.set(u.email.toLowerCase(), u);
    }

    let createdAccountsCount = 0;
    const allUsers = [];
    for (const creator of DEMO_CREATORS) {
      const emailLower = creator.email.toLowerCase();
      let user = existingUserMap.get(emailLower);
      if (!user) {
        log(`[seed] Création du créateur de démonstration : ${creator.name} (${creator.email})`);
        user = new User({
          name: creator.name,
          email: creator.email,
          role: "user",
          status: "active",
          seedBatch: SEED_BATCH_TAG,
        });
        user.password = demoPassword;
        await user.save();
        createdAccountsCount++;
      }
      allUsers.push(user);
    }

    // C. Récupération ou création des 100 créations MakerShare
    const authorIds = allUsers.map((u) => u._id);
    const expectedPosts = buildDemoPosts(authorIds);

    const existingPosts = await Post.find({ seedBatch: SEED_BATCH_TAG });
    const existingPostKeys = new Set(
      existingPosts.map((p) => `${p.author.toString()}:::${p.title}`)
    );

    const postsToInsert = expectedPosts.filter(
      (p) => !existingPostKeys.has(`${p.author.toString()}:::${p.title}`)
    );

    let insertedPostsCount = 0;
    if (postsToInsert.length > 0) {
      log(`[seed] Insertion de ${postsToInsert.length} post(s) manquant(s)...`);
      await Post.insertMany(postsToInsert);
      insertedPostsCount = postsToInsert.length;
    }

    // D. Tous les posts finaux de démo
    const finalPosts = await Post.find({ seedBatch: SEED_BATCH_TAG });

    // E. Écriture / mise à jour du manifeste local d'identifiants
    const manifestDir = path.dirname(manifestPath);
    if (!fs.existsSync(manifestDir)) {
      await fsPromises.mkdir(manifestDir, { recursive: true });
    }

    const manifestPayload = {
      version: "1.0",
      batchTag: SEED_BATCH_TAG,
      generatedAt: new Date().toISOString(),
      accountIds: allUsers.map((u) => String(u._id)),
      postIds: finalPosts.map((p) => String(p._id)),
      accounts: allUsers.map((u) => ({ id: String(u._id), email: u.email, name: u.name })),
    };

    await fsPromises.writeFile(manifestPath, JSON.stringify(manifestPayload, null, 2), "utf-8");

    if (createdAccountsCount === 0 && insertedPostsCount === 0) {
      log(
        "[seed] Le dataset de démonstration est DÉJÀ complet en base (10 comptes, 100 posts). Aucun doublon créé."
      );
      return {
        status: "already_seeded",
        accountCount: allUsers.length,
        postCount: finalPosts.length,
      };
    }

    log(
      `[seed] SUCCÈS : ${allUsers.length} comptes et ${finalPosts.length} posts MakerShare (créés: ${createdAccountsCount} comptes, ${insertedPostsCount} posts). Manifeste dans ${path.basename(
        manifestPath
      )}.`
    );

    return {
      status: createdAccountsCount === 10 && insertedPostsCount === 100 ? "created" : "repaired",
      accountCount: allUsers.length,
      postCount: finalPosts.length,
      createdAccountsCount,
      insertedPostsCount,
      manifestPath,
    };
  } finally {
    if (shouldDisconnect) {
      await mongoose.disconnect();
    }
  }
}

// Exécution directe en ligne de commande si invoqué via node
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const isClean = process.argv.includes("--clean");
  const mongoUri = process.env.MONGODB_URI;
  const demoPassword = process.env.DEMO_PASSWORD;

  runSeed({
    mongoUri,
    demoPassword,
    clean: isClean,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
