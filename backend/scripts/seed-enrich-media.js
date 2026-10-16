import mongoose from "mongoose";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { User } from "../src/models/User.js";
import { Post } from "../src/models/Post.js";
import { Like } from "../src/models/Like.js";
import { Comment } from "../src/models/Comment.js";
import { Follow } from "../src/models/Follow.js";
import { Subscription } from "../src/models/Subscription.js";
import { detectAndValidateAttachment } from "../src/utils/attachmentValidator.js";
import { detectRealImageMime } from "../src/utils/imageValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_AVATARS = path.resolve(__dirname, "../data/uploads/avatars");
const UPLOADS_ATTACHMENTS = path.resolve(__dirname, "../data/uploads/attachments");
const SEED_BATCH_TAG = "makershare-demo-v1";

// ============================================================================
// 1. GÉNÉRATEURS DE MÉDIAS BINAIRES VALIDES (PNG, PDF, MP3) PUR NODE.JS
// ============================================================================

// Table CRC-32 standard pour les chunks PNG
function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}
const crcTable = createCRC32Table();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const toHash = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(toHash), 0);
  return Buffer.concat([lenBuf, toHash, crcBuf]);
}

/**
 * Génère un fichier binaire PNG valide conforme à la spécification PNG (RGBA 8 bits).
 */
export function createPng(width, height, getPixel) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Compression deflate standard
  ihdr[11] = 0; // Filtre standard
  ihdr[12] = 0; // Pas d'entrelacement
  const ihdrChunk = makePngChunk("IHDR", ihdr);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const idatChunk = makePngChunk("IDAT", zlib.deflateSync(rawData));
  const iendChunk = makePngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Police matricielle 5x7 pour lettrage net sans dépendance graphique
const BITMAP_FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
};

function isPixelInText(text, px, py, originX, originY, scale = 4) {
  let curX = originX;
  for (let c = 0; c < text.length; c++) {
    const char = text[c].toUpperCase();
    const glyph = BITMAP_FONT[char];
    if (glyph) {
      const charWidth = 5 * scale;
      const charHeight = 7 * scale;
      if (
        px >= curX &&
        px < curX + charWidth &&
        py >= originY &&
        py < originY + charHeight
      ) {
        const col = Math.floor((px - curX) / scale);
        const row = Math.floor((py - originY) / scale);
        if (glyph[row] && glyph[row][col] === "1") {
          return true;
        }
      }
    }
    curX += 6 * scale; // 5 + 1 espace
  }
  return false;
}

/**
 * Génère un document PDF 1.4 valide et structuré avec en-têtes et étapes d'atelier.
 */
export function createStructuredPdf(title, authorName, category, steps) {
  function sanitize(str) {
    return String(str || "")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  const streamLines = [
    "0.08 0.12 0.22 rg 0 770 595 72 re f",
    "1 1 1 rg BT /F1 16 Tf 40 812 Td (MAKER SHARE - DOSSIER TECHNIQUE & NOTICE D ATELIER) Tj ET",
    "0.85 0.90 0.98 rg BT /F2 10 Tf 40 790 Td (Plateforme collaborative des createurs, makers et artisans) Tj ET",
    "0 0 0 rg",
    `BT /F1 16 Tf 40 735 Td (${sanitize(title)}) Tj ET`,
    `0.3 0.35 0.45 rg BT /F2 10 Tf 40 715 Td (Concepteur: ${sanitize(authorName)}   |   Categorie: ${sanitize(category)}   |   Format: Plan A4) Tj ET`,
    "0.8 0.85 0.9 RG 1.5 w 40 700 m 555 700 l S",
    "0.1 0.15 0.25 rg BT /F1 12 Tf 40 670 Td (1. NOMENCLATURE ET FOURNITURES REQUISES) Tj ET",
    "0.25 0.25 0.3 rg BT /F2 10 Tf 50 650 Td (Verifier l exhaustivite des pieces avant assemblage. Travailler sur plan degage.) Tj ET",
    "0.25 0.25 0.3 rg BT /F2 10 Tf 50 635 Td (Outillage: cutter de precision, reglet metallique, plioir et colle adaptee.) Tj ET",
    "0.1 0.15 0.25 rg BT /F1 12 Tf 40 600 Td (2. INSTRUCTIONS D ASSEMBLAGE ET RECOMMANDATIONS) Tj ET",
  ];

  let y = 578;
  for (const step of steps.slice(0, 8)) {
    streamLines.push(
      `0.2 0.2 0.25 rg BT /F2 9.5 Tf 50 ${y} Td (${sanitize(step)}) Tj ET`
    );
    y -= 18;
  }

  streamLines.push(
    "0.94 0.96 1 rg 40 290 515 90 re f",
    "0.3 0.5 0.85 RG 1 w 40 290 515 90 re S",
    "0.1 0.25 0.6 rg BT /F1 11 Tf 55 355 Td (CONSEIL DE L ATELIER MAKER SHARE) Tj ET",
    "0.25 0.25 0.35 rg BT /F2 9 Tf 55 335 Td (Prenez soin de marquer les plis avec precision avant de coller.) Tj ET",
    "0.25 0.25 0.35 rg BT /F2 9 Tf 55 320 Td (Laissez secher chaque point de fixation 5 minutes pour eviter toute tension.) Tj ET",
    "0.25 0.25 0.35 rg BT /F2 9 Tf 55 305 Td (Partagez vos realisations sur la plateforme en citant le createur !) Tj ET",
    "0.5 0.5 0.5 rg BT /F2 8 Tf 40 40 Td (MakerShare Community - Document ouvert - Distribution libre avec attribution) Tj ET"
  );

  const streamContent = streamLines.join("\n");
  const streamLen = Buffer.byteLength(streamContent, "utf-8");

  const pdfBody =
    "%PDF-1.4\n" +
    "1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n" +
    "2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n" +
    "3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources <</Font <</F1 5 0 R /F2 6 0 R>>>>>> endobj\n" +
    `4 0 obj <</Length ${streamLen}>> stream\n${streamContent}\nendstream\nendobj\n` +
    "5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>> endobj\n" +
    "6 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj\n" +
    "xref\n0 7\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer <</Size 7 /Root 1 0 R>>\nstartxref\n500\n%%EOF";

  return Buffer.from(pdfBody, "utf-8");
}

/**
 * Génère un fichier audio MP3 valide avec ID3v2 et trames MPEG Audio sync.
 */
export function createMp3(name) {
  // En-tête ID3v2 valide (10 octets)
  const id3Header = Buffer.from([
    0x49, 0x44, 0x33, // 'ID3'
    0x03, 0x00, // Version 2.3.0
    0x00, // Flags
    0x00, 0x00, 0x02, 0x00, // Tag size (256 octets)
  ]);
  const id3Padding = Buffer.alloc(256, 0);

  // Trame MPEG 1 Layer 3 valide (128 kbps, 44.1 kHz, stéréo)
  // Header: 0xFF, 0xFB, 0x90, 0x64 (4 octets) + 414 octets de charge utile
  const frameHeader = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
  const frameBody = Buffer.alloc(414, 0x55);
  const mpegFrame = Buffer.concat([frameHeader, frameBody]);

  // Répéter sur ~40 trames pour un extrait d'environ 1 seconde valide
  const frames = [];
  for (let i = 0; i < 40; i++) {
    frames.push(mpegFrame);
  }

  return Buffer.concat([id3Header, id3Padding, ...frames]);
}

// ============================================================================
// 2. CONFIGURATION DES 10 CRÉATEURS ET PALETTES CHROMATIQUES
// ============================================================================

const CREATOR_PROFILES = [
  {
    email: "demo.alice.lego@makershare.local",
    initials: "AB",
    color1: [220, 38, 38], // Rouge brique vif
    color2: [245, 158, 11], // Jaune Lego
    bio: "Passionnée de Lego et d'architecture miniature depuis plus de 15 ans. Je partage des MOCs modulaires, des répliques spatiales et des tutoriels de techniques SNOT avancées.",
    profileTags: ["lego", "technic", "mocs", "star-wars", "architecture"],
  },
  {
    email: "demo.bastien.paper@makershare.local",
    initials: "BP",
    color1: [13, 148, 136], // Teal émeraude
    color2: [16, 185, 129], // Vert menthe
    bio: "Créateur de patrons papercraft low-poly géométriques. Tous mes modèles sont accompagnés de patrons PDF imprimables à l'échelle et de notices de pliage millimétrées.",
    profileTags: ["papercraft", "low-poly", "diy-papier", "sculpture", "patrons-pdf"],
  },
  {
    email: "demo.camille.origami@makershare.local",
    initials: "CP",
    color1: [37, 99, 235], // Bleu saphir
    color2: [139, 92, 246], // Violet doux
    bio: "Instructrice d'origami traditionnel et tessellations modernes. Du pli valley élémentaire aux structures modulaires 3D en papier washi.",
    profileTags: ["origami", "tessellation", "papier-japonais", "pliage-modulaire"],
  },
  {
    email: "demo.damien.synth@makershare.local",
    initials: "DL",
    color1: [126, 34, 206], // Violet Eurorack
    color2: [236, 72, 153], // Magenta analogique
    bio: "Luthier numérique & concepteur de synthétiseurs modulaires Eurorack. Circuits analogiques, boîtiers en bois noble et extraits sonores de banc d'essai.",
    profileTags: ["musique", "synthetiseur", "eurorack", "diy-audio", "pedale-effet"],
  },
  {
    email: "demo.elena.print3d@makershare.local",
    initials: "EM",
    color1: [6, 182, 212], // Cyan technique
    color2: [37, 99, 235], // Bleu ingénieur
    bio: "Ingénieure matériaux & passionnée d'impression 3D FDM et résine SLA. Pièces mécaniques fonctionnelles, tolérances serrées et optimisation de supports.",
    profileTags: ["modeles-3d", "impression-3d", "fdm", "resine", "cao", "open-source"],
  },
  {
    email: "demo.felix.robot@makershare.local",
    initials: "FM",
    color1: [217, 119, 6], // Cuivre mécanique
    color2: [71, 85, 105], // Ardoise acier
    bio: "Bidouilleur d'automates, bras robotiques et objets connectés Arduino/ESP32. J'adore mêler engrenages mécaniques, capteurs et code C++.",
    profileTags: ["robotique", "arduino", "esp32", "mecanique", "automatisation"],
  },
  {
    email: "demo.gabriel.wood@makershare.local",
    initials: "GW",
    color1: [180, 83, 9], // Chêne doré
    color2: [120, 53, 15], // Noyer sienne
    bio: "Menuisier d'art et travail du bois traditionnel : assemblages à queue-d'aronde, tournage sur bois et finitions aux huiles naturelles sans solvant.",
    profileTags: ["menuiserie", "bois", "ebenisterie", "outils-manuels", "upcycling"],
  },
  {
    email: "demo.helene.costume@makershare.local",
    initials: "HC",
    color1: [244, 63, 94], // Rose armure
    color2: [168, 85, 247], // Violet fantastique
    bio: "Créatrice de costumes d'armures fantastiques, travail de la mousse EVA foam, thermoformage Worbla et patines vieillies ultra-réalistes.",
    profileTags: ["cosplay", "eva-foam", "worbla", "armure", "props"],
  },
  {
    email: "demo.ismail.music@makershare.local",
    initials: "IA",
    color1: [202, 138, 4], // Ambre chaud
    color2: [101, 163, 13], // Olive lutherie
    bio: "Fabrication d'instruments acoustiques traditionnels : kalimbas en bois massif, cajóns péruviens et percussions accordées. Écoutez mes pistes démo !",
    profileTags: ["musique", "acoustique", "kalimba", "lutherie-bois", "percussions"],
  },
  {
    email: "demo.julie.clay@makershare.local",
    initials: "JC",
    color1: [234, 88, 12], // Terre cuite
    color2: [249, 115, 22], // Grès corail
    bio: "Céramiste et sculptrice sur argile et grès chamotté. Formes organiques, émaux minéraux maison et cuisson grand feu.",
    profileTags: ["ceramique", "poterie", "sculpture", "argile", "emaux"],
  },
];

const CATEGORY_THEMES = {
  Lego: {
    c1: [220, 38, 38],
    c2: [245, 158, 11],
    motif: "lego",
  },
  Papercraft: {
    c1: [13, 148, 136],
    c2: [16, 185, 129],
    motif: "papercraft",
  },
  Origami: {
    c1: [37, 99, 235],
    c2: [139, 92, 246],
    motif: "origami",
  },
  Musique: {
    c1: [79, 70, 229],
    c2: [217, 70, 239],
    motif: "musique",
  },
  "Modèles 3D": {
    c1: [6, 182, 212],
    c2: [30, 64, 175],
    motif: "3d",
  },
  Autre: {
    c1: [234, 88, 12],
    c2: [71, 85, 105],
    motif: "craft",
  },
};

// ============================================================================
// 3. RASTERISEURS D'IMAGES (AVATARS ET COUVERTURES DE CRÉATION)
// ============================================================================

function generateAvatarPng(initials, c1, c2) {
  const size = 200;
  const cx = 100;
  const cy = 100;
  const rCircle = 88;
  const rInner = 84;

  return createPng(size, size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // En dehors du cercle : fond transparent
    if (dist > rCircle) {
      return [0, 0, 0, 0];
    }

    // Anneau de contour élégant
    if (dist > rInner) {
      const alpha = Math.floor(220 * (1 - (dist - rInner) / (rCircle - rInner)));
      return [255, 255, 255, alpha];
    }

    // Dégradé diagonal entre c1 et c2
    const t = (x + y) / (size * 2);
    let r = Math.floor(c1[0] * (1 - t) + c2[0] * t);
    let g = Math.floor(c1[1] * (1 - t) + c2[1] * t);
    let b = Math.floor(c1[2] * (1 - t) + c2[2] * t);

    // Halo lumineux interne centré
    const glow = Math.max(0, 1 - dist / rInner) * 45;
    r = Math.min(255, Math.floor(r + glow));
    g = Math.min(255, Math.floor(g + glow));
    b = Math.min(255, Math.floor(b + glow));

    // Lettres des initiales centrées
    // 2 lettres -> largeur totale: (5*5 + 1*5) + (5*5) = 30 + 25 = 55 px
    const scale = 5;
    const textWidth = initials.length * 6 * scale - scale;
    const textHeight = 7 * scale;
    const textX = Math.floor(cx - textWidth / 2);
    const textY = Math.floor(cy - textHeight / 2);

    if (isPixelInText(initials, x, y, textX, textY, scale)) {
      return [255, 255, 255, 255];
    }

    return [r, g, b, 255];
  });
}

function generateCoverPng(title, category, index) {
  const width = 480;
  const height = 300;
  const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES["Autre"];
  const { c1, c2, motif } = theme;

  // Varier légèrement les nuances selon l'index
  const shift = (index * 17) % 30;

  return createPng(width, height, (x, y) => {
    // 1. Fond dégradé diagonal doux
    const t = (x / width + y / height) / 2;
    let r = Math.floor((c1[0] + shift) * (1 - t) + (c2[0] - shift) * t);
    let g = Math.floor(c1[1] * (1 - t) + c2[1] * t);
    let b = Math.floor(c1[2] * (1 - t) + c2[2] * t);

    // 2. Grille d'atelier subtile (lignes tous les 24px)
    if (x % 24 === 0 || y % 24 === 0) {
      r = Math.min(255, r + 15);
      g = Math.min(255, g + 15);
      b = Math.min(255, b + 15);
    }

    // 3. Carte centrale en verre sombre
    const cardX1 = 45;
    const cardX2 = width - 45;
    const cardY1 = 35;
    const cardY2 = height - 35;

    if (x >= cardX1 && x <= cardX2 && y >= cardY1 && y <= cardY2) {
      // Bordure brillante de la carte (2px)
      if (
        x <= cardX1 + 2 ||
        x >= cardX2 - 2 ||
        y <= cardY1 + 2 ||
        y >= cardY2 - 2
      ) {
        return [255, 255, 255, 180];
      }

      // Fond verre fumé sombre
      const glassAlpha = 0.82;
      r = Math.floor(r * (1 - glassAlpha) + 15 * glassAlpha);
      g = Math.floor(g * (1 - glassAlpha) + 23 * glassAlpha);
      b = Math.floor(b * (1 - glassAlpha) + 42 * glassAlpha);

      // 4. Motifs distinctifs selon la catégorie
      const midX = width / 2;
      const midY = height / 2;

      // Motif Lego : 4 tenons circulaires en brique
      if (motif === "lego") {
        for (const [sx, sy] of [
          [midX - 50, midY - 25],
          [midX + 50, midY - 25],
          [midX - 50, midY + 35],
          [midX + 50, midY + 35],
        ]) {
          const dStud = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
          if (dStud <= 18) {
            if (dStud > 15) return [245, 158, 11, 230];
            return [220, 38, 38, 240];
          }
        }
      }

      // Motif Musique : Barres d'égaliseur audio
      else if (motif === "musique") {
        const barWidth = 14;
        const barGap = 8;
        const totalBars = 9;
        const startX = midX - ((totalBars * (barWidth + barGap)) / 2);
        for (let bIdx = 0; bIdx < totalBars; bIdx++) {
          const bx = startX + bIdx * (barWidth + barGap);
          // Hauteur harmonique de la barre
          const hRatio = [0.35, 0.65, 0.9, 0.5, 0.85, 1.0, 0.7, 0.45, 0.3][bIdx];
          const barH = 100 * hRatio;
          const by = midY + 50 - barH;
          if (x >= bx && x < bx + barWidth && y >= by && y <= midY + 50) {
            return [217, 70, 239, 220];
          }
        }
      }

      // Motif Origami / Papercraft : Facettes géométriques
      else if (motif === "origami" || motif === "papercraft") {
        const diag1 = Math.abs((x - midX) - (y - midY));
        const diag2 = Math.abs((x - midX) + (y - midY));
        if (diag1 < 2 || diag2 < 2 || Math.abs(x - midX) < 2) {
          return [56, 189, 248, 200];
        }
        const dCenter = Math.sqrt((x - midX) ** 2 + (y - midY) ** 2);
        if (dCenter > 38 && dCenter < 42) {
          return [16, 185, 129, 220];
        }
      }

      // Motif 3D / Modèles : Hexagone & grille d'extrusion
      else if (motif === "3d") {
        const dHex = Math.max(
          Math.abs(x - midX) * 0.866 + Math.abs(y - midY) * 0.5,
          Math.abs(y - midY)
        );
        if (dHex >= 48 && dHex <= 52) return [6, 182, 212, 240];
        if (dHex >= 28 && dHex <= 32) return [96, 165, 250, 200];
      }

      // Motif Craft / Menuiserie : Cercles concentriques d'usinage
      else {
        const dCenter = Math.sqrt((x - midX) ** 2 + (y - midY) ** 2);
        if (
          (dCenter >= 25 && dCenter <= 28) ||
          (dCenter >= 50 && dCenter <= 53) ||
          (dCenter >= 75 && dCenter <= 78)
        ) {
          return [245, 158, 11, 200];
        }
      }
    }

    return [r, g, b, 255];
  });
}

// ============================================================================
// 4. BANQUE DE COMMENTAIRES COMMUNAUTAIRES AUTHENTIQUES
// ============================================================================

const MAKER_COMMENTS = [
  "Très impressionnant ! Quelle colle as-tu utilisée pour les jonctions délicates ?",
  "Le plan PDF est super bien annoté, merci infiniment pour le partage !",
  "Le rendu des couleurs en vrai est sublime, félicitations pour ce travail d'orfèvre !",
  "J'ai testé l'assemblage hier soir à l'atelier, les tolérances s'emboîtent au millimètre.",
  "Le son de l'extrait audio est super chaleureux, très belle résonance acoustique !",
  "Magnifique MOC, la verrière et les détails intérieurs sont bluffants de réalisme.",
  "Est-ce que ça fonctionne bien avec du filament PETG ou tu conseilles plutôt du PLA standard ?",
  "La technique de pré-marquage des plis change tout sur ce patron. Résultat impeccable !",
  "Géniale l'idée du module amovible ! Ça rend la maintenance et le transport tellement plus simples.",
  "J'adore le contraste entre les matériaux bruts et la finition soignée. Bravo l'artiste !",
  "Les découpes à la scie japonaise sont d'une netteté parfaite. Beau travail du bois !",
  "Merci pour l'astuce de l'huile de lin en deux couches fines, le veinage ressort superbement.",
  "La patine effet métal usé sur la mousse EVA est bluffante, on dirait du vrai bronze forgé.",
  "Superbe pièce ! Combien d'heures d'impression et d'assemblage au total ?",
  "Le potentiomètre et le câblage interne sont ultra propres, du vrai travail de pro !",
  "Tes créations m'inspirent toujours autant. Hâte de voir le prochain projet !",
  "Le système d'articulation tient bien la position sans forcer, c'est top.",
  "La cuisson grand feu donne un émail minéral magnifique, j'adore ces nuances !",
  "Testé avec du papier washi 80g comme suggéré : les plis tiennent sans craqueler.",
  "Un grand merci pour ce tutoriel détaillé, ça donne envie de s'y mettre dès ce week-end !",
];

// ============================================================================
// 5. FONCTION PRINCIPALE D'ENRICHISSEMENT DU DATASET
// ============================================================================

export async function runEnrichMedia(options = {}) {
  const { silent = false } = options;
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  log("[enrich] Démarrage de l'enrichissement multimédia du jeu de données MakerShare...");

  // Création des dossiers cibles
  await fsPromises.mkdir(UPLOADS_AVATARS, { recursive: true });
  await fsPromises.mkdir(UPLOADS_ATTACHMENTS, { recursive: true });

  // 1. Récupération des 10 créateurs de démo
  const demoUsers = await User.find({ seedBatch: SEED_BATCH_TAG });
  log(`[enrich] ${demoUsers.length} comptes de démonstration trouvés.`);

  if (demoUsers.length === 0) {
    throw new Error(
      "[enrich] Aucun compte démo trouvé. Exécutez d'abord 'npm run seed:demo' pour créer la base."
    );
  }

  const userMap = new Map();
  for (const u of demoUsers) {
    userMap.set(u.email.toLowerCase(), u);
  }

  // 2. Génération et assignation des avatars et profils riches
  log("[enrich] Génération des avatars graphiques PNG et enrichissement des profils...");
  let avatarsCount = 0;

  for (const profile of CREATOR_PROFILES) {
    const user = userMap.get(profile.email.toLowerCase());
    if (!user) continue;

    const avatarPng = generateAvatarPng(
      profile.initials,
      profile.color1,
      profile.color2
    );
    const storedName = `demo-avatar-${user._id}.png`;
    const avatarPath = path.join(UPLOADS_AVATARS, storedName);

    await fsPromises.writeFile(avatarPath, avatarPng);

    // Validation par les validateurs stricts du backend
    const validatedMime = await detectRealImageMime(avatarPath);
    if (!validatedMime) {
      throw new Error(`[enrich] Échec validation avatar pour ${user.name}`);
    }

    user.avatar = {
      storedName,
      originalName: `avatar-${profile.initials.toLowerCase()}.png`,
      mimeType: "image/png",
      size: avatarPng.length,
    };
    user.bio = profile.bio;
    user.profileTags = profile.profileTags;

    await user.save();
    avatarsCount++;
  }
  log(`[enrich] ✅ ${avatarsCount} avatars générés et profils mis à jour.`);

  // 3. Récupération des 100 posts de démo
  const demoPosts = await Post.find({ seedBatch: SEED_BATCH_TAG }).populate("author");
  log(`[enrich] ${demoPosts.length} posts de démonstration trouvés.`);

  // 4. Nettoyage préventif des anciens fichiers d'enrichissement sur disque
  const existingAttFiles = await fsPromises.readdir(UPLOADS_ATTACHMENTS);
  for (const f of existingAttFiles) {
    if (f.startsWith("demo-att-")) {
      await fsPromises.unlink(path.join(UPLOADS_ATTACHMENTS, f)).catch(() => {});
    }
  }

  // 5. Génération des pièces jointes et enrichissement du Markdown pour chaque post
  log("[enrich] Génération des pièces jointes (Couvertures, Plans PDF, Extraits Audio)...");
  let totalAttachmentsCreated = 0;
  let coversCount = 0;
  let pdfsCount = 0;
  let audioCount = 0;

  for (let idx = 0; idx < demoPosts.length; idx++) {
    const post = demoPosts[idx];
    const authorName = post.author?.name || "Créateur MakerShare";
    const attachments = [];

    // A. Image de couverture obligatoire (isCover: true)
    const coverPng = generateCoverPng(post.title, post.category, idx);
    const coverStoredName = `demo-att-cover-${post._id}.png`;
    const coverPath = path.join(UPLOADS_ATTACHMENTS, coverStoredName);
    await fsPromises.writeFile(coverPath, coverPng);

    const coverAttId = new mongoose.Types.ObjectId();
    const coverAttachment = {
      _id: coverAttId,
      originalName: "visuel-couverture.png",
      storedName: coverStoredName,
      mimeType: "image/png",
      size: coverPng.length,
      family: "image",
      isCover: true,
    };
    attachments.push(coverAttachment);
    coversCount++;

    // B. Plan technique PDF pour les créations adaptées (Papercraft, Origami, Lego, Modèles 3D, Wood)
    const needsPdf =
      post.category === "Papercraft" ||
      post.category === "Origami" ||
      post.category === "Modèles 3D" ||
      idx % 3 === 0;

    let pdfAttId = null;
    if (needsPdf) {
      const pdfSteps = [
        "1. Decoupage soigneux des pieces selon le trace continu (cutter 30 degres).",
        "2. Rainurage et pre-marquage des aretes de pliage (plioir en os ou reglet).",
        "3. Pliage des zones vallons et montagnes conformement aux repères du patron.",
        "4. Encollage progressif avec une colle vinylique a prise rapide sans solvant.",
        "5. Assemblage final et maintien sous serre-joint pendant 15 minutes.",
      ];
      const pdfBuffer = createStructuredPdf(
        post.title,
        authorName,
        post.category,
        pdfSteps
      );
      const pdfStoredName = `demo-att-plan-${post._id}.pdf`;
      const pdfPath = path.join(UPLOADS_ATTACHMENTS, pdfStoredName);
      await fsPromises.writeFile(pdfPath, pdfBuffer);

      pdfAttId = new mongoose.Types.ObjectId();
      attachments.push({
        _id: pdfAttId,
        originalName: "plan-technique-complet.pdf",
        storedName: pdfStoredName,
        mimeType: "application/pdf",
        size: pdfBuffer.length,
        family: "pdf",
        isCover: false,
      });
      pdfsCount++;
    }

    // C. Extrait audio MP3 pour les instruments et créations musicales
    const needsAudio =
      post.category === "Musique" ||
      post.tags.includes("guitare") ||
      post.tags.includes("sonore") ||
      post.tags.includes("synthetiseur") ||
      idx === 70; // Guitare lego

    let audioAttId = null;
    if (needsAudio) {
      const mp3Buffer = createMp3(post.title);
      const audioStoredName = `demo-att-audio-${post._id}.mp3`;
      const audioPath = path.join(UPLOADS_ATTACHMENTS, audioStoredName);
      await fsPromises.writeFile(audioPath, mp3Buffer);

      audioAttId = new mongoose.Types.ObjectId();
      attachments.push({
        _id: audioAttId,
        originalName: "extrait-audio-banc-essai.mp3",
        storedName: audioStoredName,
        mimeType: "audio/mpeg",
        size: mp3Buffer.length,
        family: "audio",
        isCover: false,
      });
      audioCount++;
    }

    // Mise à jour des pièces jointes du Post
    post.attachments = attachments;
    totalAttachmentsCreated += attachments.length;

    // D. Rédaction enrichie du contenu Markdown avec embeds visuels, PDF et Audio
    let contentMd = `![Visuel de présentation de ${post.title}](attachment:${coverAttId})\n\n`;
    contentMd += `${post.shortDescription}\n\n`;
    contentMd += `### 🛠️ Matériel et outillage recommandé\n\n`;
    contentMd += `- Matériau principal sélectionné pour sa durabilité et sa rigidité structurelle.\n`;
    contentMd += `- Outils de coupe et de mesure calibrés au demi-millimètre.\n`;
    contentMd += `- Produits de finition naturels assurant une protection longue durée sans solvant.\n\n`;
    contentMd += `### 📐 Étapes de réalisation pas-à-pas\n\n`;
    contentMd += `1. **Préparation et traçage :** Report minutieux des cotes sur le support d'origine.\n`;
    contentMd += `2. **Façonnage des éléments :** Découpe ou usinage en respectant les tolérances d'assemblage.\n`;
    contentMd += `3. **Assemblage progressif :** Ajustage à blanc avant collage ou vissage définitif.\n`;
    contentMd += `4. **Finitions et réglages :** Ponçage fin, lustrage et contrôle des liaisons mécaniques.\n\n`;
    contentMd += `### 💡 Conseils et astuces d'atelier\n\n`;
    contentMd += `Prenez toujours le temps de tester vos réglages sur une chute d'essai avant d'attaquer la pièce définitive. `;
    contentMd += `Un bon éclairage rasoir permet de détecter immédiatement la moindre irrégularité de surface.\n`;

    if (pdfAttId) {
      contentMd += `\n### 📄 Notice et gabarits d'assemblage\n`;
      contentMd += `Téléchargez les plans cotés officiels de ce projet : [📄 Télécharger le plan technique complet (format A4)](attachment:${pdfAttId})\n`;
    }

    if (audioAttId) {
      contentMd += `\n### 🎵 Démonstration sonore en conditions réelles\n`;
      contentMd += `Écoutez la capture audio brute réalisée au banc d'essai : [🎵 Écouter l'extrait audio du projet (MP3)](attachment:${audioAttId})\n`;
    }

    post.content = contentMd;
    await post.save();
  }

  log(
    `[enrich] ✅ ${demoPosts.length} posts enrichis (${totalAttachmentsCreated} pièces jointes : ${coversCount} couvertures, ${pdfsCount} plans PDF, ${audioCount} extraits MP3).`
  );

  // 6. Génération des interactions sociales (Likes, Commentaires, Abonnements, Follows)
  log("[enrich] Génération des interactions sociales réalistes de la communauté...");

  const postIds = demoPosts.map((p) => p._id);
  const userIds = demoUsers.map((u) => u._id);

  // Nettoyage préalable des interactions démo
  await Like.deleteMany({ postId: { $in: postIds } });
  await Comment.deleteMany({ postId: { $in: postIds } });
  await Follow.deleteMany({
    $or: [{ creatorId: { $in: userIds } }, { followerId: { $in: userIds } }],
  });
  await Subscription.deleteMany({
    $or: [{ creatorId: { $in: userIds } }, { subscriberId: { $in: userIds } }],
  });

  // A. Distribution des Likes (~160 likes distribués pour rendre le tri "Plus populaires" réaliste)
  const likesToInsert = [];
  for (let i = 0; i < demoPosts.length; i++) {
    const post = demoPosts[i];
    // Les premiers posts de chaque catégorie sont plus populaires (8 à 10 likes)
    let numLikes = 0;
    if (i % 10 === 0 || i % 10 === 7) {
      numLikes = 8 + (i % 3); // 8 à 10 likes
    } else if (i % 10 <= 3) {
      numLikes = 4 + (i % 3); // 4 à 6 likes
    } else if (i % 10 <= 6) {
      numLikes = 2 + (i % 2); // 2 à 3 likes
    } else {
      numLikes = i % 2; // 0 ou 1 like
    }

    // Sélection d'utilisateurs distincts pour chaque like (sans auto-like obligatoire)
    const shuffledUsers = [...demoUsers].sort(() => 0.5 - Math.random());
    for (let uIdx = 0; uIdx < numLikes && uIdx < shuffledUsers.length; uIdx++) {
      likesToInsert.push({
        postId: post._id,
        userId: shuffledUsers[uIdx]._id,
      });
    }
  }
  await Like.insertMany(likesToInsert);
  log(`[enrich] ✅ ${likesToInsert.length} likes distribués sur le catalogue.`);

  // B. Distribution des Commentaires (~45 commentaires pertinents)
  const commentsToInsert = [];
  for (let i = 0; i < demoPosts.length; i++) {
    // 1 post sur 2 reçoit un commentaire, les plus populaires en reçoivent 2
    if (i % 2 === 0) {
      const post = demoPosts[i];
      const otherUsers = demoUsers.filter(
        (u) => String(u._id) !== String(post.author?._id || post.author)
      );
      const commenter = otherUsers[i % otherUsers.length];
      const commentText = MAKER_COMMENTS[i % MAKER_COMMENTS.length];

      commentsToInsert.push({
        postId: post._id,
        author: {
          id: commenter._id,
          name: commenter.name,
        },
        text: commentText,
        createdAt: new Date(Date.now() - (demoPosts.length - i) * 3600000),
      });

      if (i % 6 === 0) {
        const secondCommenter = otherUsers[(i + 3) % otherUsers.length];
        const secondText =
          MAKER_COMMENTS[(i + 7) % MAKER_COMMENTS.length];
        commentsToInsert.push({
          postId: post._id,
          author: {
            id: secondCommenter._id,
            name: secondCommenter.name,
          },
          text: secondText,
          createdAt: new Date(Date.now() - (demoPosts.length - i) * 1800000),
        });
      }
    }
  }
  await Comment.insertMany(commentsToInsert);
  log(`[enrich] ✅ ${commentsToInsert.length} commentaires communautaires insérés.`);

  // C. Distribution des Follows entre créateurs (~30 follows)
  const followsToInsert = [];
  for (let i = 0; i < demoUsers.length; i++) {
    const follower = demoUsers[i];
    // Chaque créateur suit 2 à 3 collègues
    const next1 = demoUsers[(i + 1) % demoUsers.length];
    const next2 = demoUsers[(i + 3) % demoUsers.length];
    followsToInsert.push({ followerId: follower._id, creatorId: next1._id });
    followsToInsert.push({ followerId: follower._id, creatorId: next2._id });
  }
  await Follow.insertMany(followsToInsert);
  log(`[enrich] ✅ ${followsToInsert.length} relations de suivi (follows) créées.`);

  // D. Distribution d'abonnements VIP actifs (30 jours de validité)
  const subsToInsert = [
    {
      subscriberId: demoUsers[0]._id, // Alice s'abonne à Damien
      creatorId: demoUsers[3]._id,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      active: true,
    },
    {
      subscriberId: demoUsers[1]._id, // Bastien s'abonne à Elena
      creatorId: demoUsers[4]._id,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      active: true,
    },
    {
      subscriberId: demoUsers[2]._id, // Camille s'abonne à Gabriel
      creatorId: demoUsers[6]._id,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      active: true,
    },
    {
      subscriberId: demoUsers[5]._id, // Félix s'abonne à Hélène
      creatorId: demoUsers[7]._id,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      active: true,
    },
  ];
  await Subscription.insertMany(subsToInsert);
  log(`[enrich] ✅ ${subsToInsert.length} abonnements VIP actifs créés.`);

  log("[enrich] ========================================================");
  log(`[enrich] SUCCÈS : Dataset MakerShare enrichi avec succès !`);
  log(`[enrich] - Avatars créateurs : ${avatarsCount}`);
  log(`[enrich] - Pièces jointes totales : ${totalAttachmentsCreated}`);
  log(`[enrich]   * Couvertures graphiques : ${coversCount}`);
  log(`[enrich]   * Plans PDF d'atelier : ${pdfsCount}`);
  log(`[enrich]   * Extraits audio MP3 : ${audioCount}`);
  log(`[enrich] - Likes communautaires : ${likesToInsert.length}`);
  log(`[enrich] - Commentaires : ${commentsToInsert.length}`);
  log(`[enrich] - Follows : ${followsToInsert.length}`);
  log(`[enrich] - Abonnements VIP actifs : ${subsToInsert.length}`);
  log("[enrich] ========================================================");

  return {
    avatarsCount,
    totalAttachmentsCreated,
    coversCount,
    pdfsCount,
    audioCount,
    likesCount: likesToInsert.length,
    commentsCount: commentsToInsert.length,
    followsCount: followsToInsert.length,
    subsCount: subsToInsert.length,
  };
}

// Exécution directe en CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  async function main() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error(
        "[enrich] ERREUR : La variable d'environnement MONGODB_URI est obligatoire."
      );
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    try {
      await runEnrichMedia();
    } finally {
      await mongoose.disconnect();
    }
  }
  main().catch((err) => {
    console.error("[enrich] Erreur fatale lors de l'enrichissement :", err);
    process.exit(1);
  });
}
